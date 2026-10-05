/**
 * Real-Time Multi-Object Tomato Tracker for Live Camera Streams & Conveyor Belts
 * 
 * Features:
 * 1. Multi-Tomato Tracking: Tracks multiple tomatoes simultaneously across frames.
 * 2. Stable Identity: Assigns unique, persistent tracking IDs (#T001, #T002, #T003...)
 * 3. Temporal Smoothing: Smooths bounding box coordinates to reduce jitter.
 * 4. Conveyor Counting Gate: Counts each unique tomato EXACTLY ONCE as it crosses the line.
 * 5. Robust Exit Handling: Instantly removes bounding boxes when tomatoes leave the frame.
 */
import type {
  RoboflowPrediction,
  TrackedTomato,
  TomatoDetectionEvent,
  TomatoRipeness,
  TomatoSizeClass,
} from '../types.ts';
import {
  evaluateSortingAction,
  determineQualityGrade,
  classifyBlightPathology,
  calculatePostHarvestMetrics,
} from './post-harvest.ts';

export function parseRipeness(className: string): TomatoRipeness {
  const lower = className.toLowerCase();
  if (lower.includes('blight') || lower.includes('diseas') || lower.includes('spot') || lower.includes('rot') || lower.includes('defect')) {
    return 'blight';
  }
  if (lower.includes('unripe') || lower.includes('green') || lower.includes('raw')) {
    return 'unripe';
  }
  return 'ripe';
}

export function estimateTomatoSize(
  width: number,
  height: number,
  mmPerPixel = 0.35
): {
  size: TomatoSizeClass;
  diameterMm: number;
  weightGrams: number;
  weightOz: number;
} {
  const avgDimPx = (width + height) / 2;
  const estimatedMm = Math.round(Math.max(25, Math.min(120, avgDimPx * mmPerPixel)));
  
  // Standard slicing tomato commercial calibration:
  // Medium: 2.5 - 3.0 inches (60 - 75mm), 4 - 6 oz (110 - 170g)
  // Small: < 2.5 inches (< 60mm), < 4 oz (< 110g)
  // Large: > 3.0 inches (> 75mm), > 6 oz (> 170g)
  let size: TomatoSizeClass = 'medium';
  if (estimatedMm < 60) size = 'small';
  else if (estimatedMm <= 75) size = 'medium';
  else size = 'large';

  // Realistic weight estimation based on oblate spheroid geometry calibrated to 110-170g at 60-75mm
  let weightGrams: number;
  if (size === 'small') {
    // 25mm to 59mm maps proportionally to ~40g - 109g
    const factor = Math.max(0, (estimatedMm - 25) / (59 - 25));
    weightGrams = Math.round(40 + factor * 69);
  } else if (size === 'medium') {
    // 60mm to 75mm maps to 110g - 170g (4 - 6 oz)
    const factor = (estimatedMm - 60) / (75 - 60);
    weightGrams = Math.round(110 + factor * 60);
  } else {
    // > 75mm maps to > 170g (up to ~280g at 120mm)
    const factor = Math.min(1, (estimatedMm - 75) / (120 - 75));
    weightGrams = Math.round(171 + factor * 109);
  }

  const weightOz = Number((weightGrams * 0.035274).toFixed(1));

  return { size, diameterMm: estimatedMm, weightGrams, weightOz };
}

export function calculateIoU(
  boxA: { x: number; y: number; width: number; height: number },
  boxB: { x: number; y: number; width: number; height: number }
): number {
  const xA1 = boxA.x - boxA.width / 2;
  const yA1 = boxA.y - boxA.height / 2;
  const xA2 = boxA.x + boxA.width / 2;
  const yA2 = boxA.y + boxA.height / 2;

  const xB1 = boxB.x - boxB.width / 2;
  const yB1 = boxB.y - boxB.height / 2;
  const xB2 = boxB.x + boxB.width / 2;
  const yB2 = boxB.y + boxB.height / 2;

  const xInter1 = Math.max(xA1, xB1);
  const yInter1 = Math.max(yA1, yB1);
  const xInter2 = Math.min(xA2, xB2);
  const yInter2 = Math.min(yA2, yB2);

  const interWidth = Math.max(0, xInter2 - xInter1);
  const interHeight = Math.max(0, yInter2 - yInter1);
  const interArea = interWidth * interHeight;

  const areaA = boxA.width * boxA.height;
  const areaB = boxB.width * boxB.height;
  const unionArea = areaA + areaB - interArea;

  if (unionArea <= 0) return 0;
  return interArea / unionArea;
}

export function calculateDistance(
  p1: { x: number; y: number },
  p2: { x: number; y: number }
): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export interface TrackerOptions {
  maxDistancePx?: number;
  minIoU?: number;
  maxLostFrames?: number;
  virtualLineYRatio?: number;
  useCountingLine?: boolean;
  minFramesToCount?: number;
}

interface InternalTrack extends TrackedTomato {
  lostFrames: number;
}

export class TomatoTracker {
  private nextId = 1;
  private tracks: Map<number, InternalTrack> = new Map();
  private options: Required<TrackerOptions>;

  constructor(options: TrackerOptions = {}) {
    this.options = {
      maxDistancePx: options.maxDistancePx ?? 140,
      minIoU: options.minIoU ?? 0.15,
      maxLostFrames: options.maxLostFrames ?? 3,
      virtualLineYRatio: options.virtualLineYRatio ?? 0.5,
      useCountingLine: options.useCountingLine ?? false,
      minFramesToCount: options.minFramesToCount ?? 2,
    };
  }

  public reset(): void {
    this.tracks.clear();
    this.nextId = 1;
  }

  public update(
    predictions: RoboflowPrediction[],
    frameWidth: number,
    frameHeight: number,
    sessionId: string
  ): {
    activeTracks: TrackedTomato[];
    newlyCountedEvents: TomatoDetectionEvent[];
    visibleRipe: number;
    visibleUnripe: number;
    visibleBlight: number;
    totalVisible: number;
  } {
    const now = Date.now();
    const newlyCountedEvents: TomatoDetectionEvent[] = [];

    // If no predictions and no active tracks, return empty immediately
    if (predictions.length === 0 && this.tracks.size === 0) {
      return {
        activeTracks: [],
        newlyCountedEvents: [],
        visibleRipe: 0,
        visibleUnripe: 0,
        visibleBlight: 0,
        totalVisible: 0,
      };
    }

    const matchedPredictionIndices = new Set<number>();
    const matchedTrackIds = new Set<number>();

    // 1. Calculate Cost Matrix (Distance & IoU) between existing tracks and incoming predictions
    const trackEntries = Array.from(this.tracks.entries());
    const costPairs: { trackId: number; predIdx: number; cost: number }[] = [];

    for (const [trackId, track] of trackEntries) {
      for (let pIdx = 0; pIdx < predictions.length; pIdx++) {
        const pred = predictions[pIdx];
        const predCentroid = { x: pred.x, y: pred.y };
        const predBbox = { x: pred.x, y: pred.y, width: pred.width, height: pred.height };

        const dist = calculateDistance(predCentroid, track.centroid);
        const iou = calculateIoU(predBbox, track.bbox);

        // Accept if close in distance or has good IoU overlap
        if (dist <= this.options.maxDistancePx || iou >= this.options.minIoU) {
          // Combined cost: lower distance and higher IoU = lower cost
          const cost = dist - (iou * 100);
          costPairs.push({ trackId, predIdx: pIdx, cost });
        }
      }
    }

    // Sort by lowest cost for greedy bipartite matching
    costPairs.sort((a, b) => a.cost - b.cost);

    for (const pair of costPairs) {
      if (matchedTrackIds.has(pair.trackId) || matchedPredictionIndices.has(pair.predIdx)) {
        continue;
      }

      matchedTrackIds.add(pair.trackId);
      matchedPredictionIndices.add(pair.predIdx);

      const track = this.tracks.get(pair.trackId)!;
      const pred = predictions[pair.predIdx];
      const prevCentroid = { ...track.centroid };

      const predCentroid = { x: pred.x, y: pred.y };
      const predBbox = { x: pred.x, y: pred.y, width: pred.width, height: pred.height };
      const predRipeness = parseRipeness(pred.class);

      // Smooth coordinates using moving average (alpha = 0.75 for fast responsive tracking)
      const alpha = 0.75;
      track.centroid = {
        x: Math.round(track.centroid.x * (1 - alpha) + predCentroid.x * alpha),
        y: Math.round(track.centroid.y * (1 - alpha) + predCentroid.y * alpha),
      };
      track.bbox = {
        x: Math.round(track.bbox.x * (1 - alpha) + predBbox.x * alpha),
        y: Math.round(track.bbox.y * (1 - alpha) + predBbox.y * alpha),
        width: Math.round(track.bbox.width * (1 - alpha) + predBbox.width * alpha),
        height: Math.round(track.bbox.height * (1 - alpha) + predBbox.height * alpha),
      };
      track.confidence = pred.confidence;
      track.class = pred.class;
      track.ripeness = predRipeness;
      const sizeEst = estimateTomatoSize(track.bbox.width, track.bbox.height);
      track.diameterMm = sizeEst.diameterMm;
      track.weightGrams = sizeEst.weightGrams;
      track.weightOz = sizeEst.weightOz;
      if (!track.sortingAction) {
        track.sortingAction = evaluateSortingAction(predRipeness, pred.confidence);
      }
      if (!track.qualityGrade) {
        track.qualityGrade = determineQualityGrade(predRipeness, pred.confidence);
      }
      track.lastSeen = now;
      track.lostFrames = 0;
      track.framesVisible += 1;
      track.trajectory.push({ x: track.centroid.x, y: track.centroid.y, time: now });
      if (track.trajectory.length > 25) {
        track.trajectory.shift();
      }

      // Conveyor Counting Gate Line check
      if (!track.counted) {
        let shouldCount = false;

        if (this.options.useCountingLine) {
          const lineY = frameHeight * this.options.virtualLineYRatio;
          const crossedLine =
            (prevCentroid.y < lineY && track.centroid.y >= lineY) ||
            (prevCentroid.y > lineY && track.centroid.y <= lineY) ||
            (Math.abs(track.centroid.y - lineY) <= 16);

          if (crossedLine && track.framesVisible >= this.options.minFramesToCount) {
            shouldCount = true;
          }
        } else {
          if (track.framesVisible >= this.options.minFramesToCount) {
            shouldCount = true;
          }
        }

        if (shouldCount) {
          track.counted = true;
          const { size, diameterMm, weightGrams, weightOz } = estimateTomatoSize(track.bbox.width, track.bbox.height);
          track.diameterMm = diameterMm;
          track.weightGrams = weightGrams;
          track.weightOz = weightOz;

          const pathology = classifyBlightPathology(track.class, track.ripeness === 'blight' ? 0.15 : 0);
          const sortingAction = evaluateSortingAction(track.ripeness, track.confidence);
          const qualityGrade = determineQualityGrade(track.ripeness, track.confidence, pathology.severity);
          const postHarvest = calculatePostHarvestMetrics(
            track.ripeness,
            track.confidence,
            size,
            pathology.type,
            pathology.severity
          );

          track.blightType = pathology.type;
          track.severity = pathology.severity;
          track.sortingAction = sortingAction;
          track.qualityGrade = qualityGrade;
          track.postHarvest = postHarvest;

          newlyCountedEvents.push({
            id: `tomato-evt-${Date.now()}-${track.id}`,
            sessionId,
            timestamp: now,
            createdAt: new Date(now).toISOString(),
            class: track.class,
            ripeness: track.ripeness,
            confidence: Number((track.confidence * 100).toFixed(1)),
            size,
            diameterMm,
            weightGrams,
            weightOz,
            bbox: track.bbox,
            trackId: track.id,
            blightType: pathology.type,
            severity: pathology.severity,
            sortingAction,
            qualityGrade,
            postHarvest,
          });
        }
      }
    }

    // 2. Unmatched existing tracks: increment lost count or remove
    for (const [trackId, track] of this.tracks.entries()) {
      if (!matchedTrackIds.has(trackId)) {
        track.lostFrames += 1;
        // If track left the frame boundary or missed too many frames, delete it
        const isOutOfFrame =
          track.centroid.x < -20 ||
          track.centroid.x > frameWidth + 20 ||
          track.centroid.y < -20 ||
          track.centroid.y > frameHeight + 20;

        if (track.lostFrames > this.options.maxLostFrames || isOutOfFrame) {
          this.tracks.delete(trackId);
        }
      }
    }

    // 3. Unmatched predictions: spawn new multi-tomato tracks
    for (let pIdx = 0; pIdx < predictions.length; pIdx++) {
      if (!matchedPredictionIndices.has(pIdx)) {
        const pred = predictions[pIdx];
        const newId = this.nextId++;
        const predCentroid = { x: pred.x, y: pred.y };
        const predBbox = { x: pred.x, y: pred.y, width: pred.width, height: pred.height };
        const predRipeness = parseRipeness(pred.class);
        const { size, diameterMm, weightGrams, weightOz } = estimateTomatoSize(predBbox.width, predBbox.height);

        const pathology = classifyBlightPathology(pred.class, predRipeness === 'blight' ? 0.15 : 0);
        const sortingAction = evaluateSortingAction(predRipeness, pred.confidence);
        const qualityGrade = determineQualityGrade(predRipeness, pred.confidence, pathology.severity);
        const postHarvest = calculatePostHarvestMetrics(
          predRipeness,
          pred.confidence,
          size,
          pathology.type,
          pathology.severity
        );

        const newTrack: InternalTrack = {
          id: newId,
          centroid: predCentroid,
          bbox: predBbox,
          class: pred.class,
          ripeness: predRipeness,
          confidence: pred.confidence,
          blightType: pathology.type,
          severity: pathology.severity,
          sortingAction,
          qualityGrade,
          postHarvest,
          firstSeen: now,
          lastSeen: now,
          framesVisible: 1,
          lostFrames: 0,
          counted: false,
          diameterMm,
          weightGrams,
          weightOz,
          trajectory: [{ x: predCentroid.x, y: predCentroid.y, time: now }],
        };

        this.tracks.set(newId, newTrack);
      }
    }

    // Active tracks currently visible in frame (lostFrames === 0)
    const activeTracks: TrackedTomato[] = [];
    let visibleRipe = 0;
    let visibleUnripe = 0;
    let visibleBlight = 0;

    for (const track of this.tracks.values()) {
      if (track.lostFrames === 0) {
        activeTracks.push(track);
        if (track.ripeness === 'ripe') visibleRipe++;
        else if (track.ripeness === 'unripe') visibleUnripe++;
        else if (track.ripeness === 'blight') visibleBlight++;
      }
    }

    return {
      activeTracks,
      newlyCountedEvents,
      visibleRipe,
      visibleUnripe,
      visibleBlight,
      totalVisible: activeTracks.length,
    };
  }

  public getTrack(id: number): TrackedTomato | undefined {
    return this.tracks.get(id);
  }
}
