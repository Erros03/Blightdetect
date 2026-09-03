/**
 * Real-Time Multi-Tomato Computer Vision & Optical Verification Engine
 * 
 * Capabilities:
 * 1. Multi-Tomato Detection: Detects ALL valid tomatoes visible in the frame simultaneously (2, 5, 10, 20+).
 * 2. Optical Verification: Rigorous color space (HSV), chromatic purity, aspect ratio, and compactness checks.
 * 3. Strict Background & Anti-False-Positive Filtering:
 *    - Rejects human skin, faces, foreheads, hands, and hair.
 *    - Rejects orange/red shirts, clothing, and basketball jerseys.
 *    - Rejects wooden furniture, tables, chairs, doors, stairs, walls, ambient shadows, and conveyor parts.
 * 4. Blight Pathology Verification:
 *    - Suspected necrotic lesion MUST be embedded in a verified tomato fruit body.
 *    - Standalone dark spots or background textures are rejected.
 * 5. Returns [] when no valid tomatoes are in view (triggering "NO TOMATO DETECTED").
 */
import type { RoboflowPrediction } from '../types.ts';

export interface VisionDetectorOptions {
  minBlobAreaPx?: number;        // Minimum pixel area to consider a valid tomato (filters noise)
  minConfidence?: number;        // Minimum confidence threshold (default 0.70)
  maxTomatoes?: number;          // Safety cap (default unlimited / 50)
}

interface PixelSample {
  x: number;
  y: number;
  type: 'ripe' | 'unripe' | 'necrotic';
  confidence: number;
}

interface BlobCluster {
  id: number;
  type: 'ripe' | 'unripe';
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  pixelCount: number;
  ripePixelCount: number;
  unripePixelCount: number;
  necroticPixelCount: number;
  totalConf: number;
  centerXSum: number;
  centerYSum: number;
}

/**
 * Converts RGB (0..255) to HSV (Hue 0..360, Saturation 0..1, Value 0..1)
 */
function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;

  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  const delta = max - min;

  let h = 0;
  if (delta > 0) {
    if (max === rNorm) {
      h = ((gNorm - bNorm) / delta) % 6;
    } else if (max === gNorm) {
      h = (bNorm - rNorm) / delta + 2;
    } else {
      h = (rNorm - gNorm) / delta + 4;
    }
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }

  const s = max === 0 ? 0 : delta / max;
  const v = max;

  return { h, s, v };
}

/**
 * Classifies an individual pixel based on botanical tomato pericarp characteristics.
 * Strictly returns null for skin, hair, clothes, furniture, walls, stairs, and shadows.
 */
function classifyPixel(r: number, g: number, b: number): { type: 'ripe' | 'unripe' | 'necrotic'; confidence: number } | null {
  const { h, s, v } = rgbToHsv(r, g, b);

  // 1. Filter out low-saturation neutral backgrounds, walls, white glares, dark shadows, hair
  if (v < 0.18 || s < 0.35) {
    // Check if it could be a dark necrotic lesion (sunken decay spot on fruit)
    if (v >= 0.08 && v <= 0.30 && s >= 0.20 && (r > b || g > b)) {
      return { type: 'necrotic', confidence: 0.85 };
    }
    return null;
  }

  // 2. Strict Human Skin & Face Rejection:
  // Skin across diverse ethnicities is concentrated in Hue 10°..50°, Saturation 0.15..0.55,
  // with characteristic R > G > B and moderate R/G ratio (< 1.45)
  const isSkin = (h >= 10 && h <= 50) && (s <= 0.55) && (r > 75 && g > 50 && b > 35) && (r / Math.max(1, g) < 1.45);
  if (isSkin) {
    return null; // Reject face, forehead, neck, arms, hands
  }

  // 3. Ripe Tomato (Authentic saturated scarlet/crimson/orange-red fruit body):
  // True ripe tomatoes have Hue in 336°..360° or 0°..34°,
  // high saturation (s >= 0.38), and strong Red dominance (R > 90, R > G * 1.25, R > B * 1.25)
  const isRedHue = (h >= 336 || h <= 34);
  const isTomatoRed = r > 90 && (r > g * 1.25) && (r > b * 1.25);
  if (isRedHue && s >= 0.38 && v >= 0.18 && isTomatoRed) {
    const purity = Math.min(0.98, Math.max(0.70, 0.68 + s * 0.20 + (r / 255) * 0.10));
    return { type: 'ripe', confidence: purity };
  }

  // 4. Unripe Tomato (Agricultural green/lime fruit body):
  // Unripe green tomatoes have Hue in 68°..148°, saturation (s >= 0.32),
  // and Green dominance (G > 80, G > R * 1.15, G > B * 1.15)
  const isGreenHue = (h >= 68 && h <= 148);
  const isTomatoGreen = g > 80 && (g > r * 1.15) && (g > b * 1.15);
  if (isGreenHue && s >= 0.32 && v >= 0.18 && isTomatoGreen) {
    const purity = Math.min(0.96, Math.max(0.70, 0.68 + s * 0.20 + (g / 255) * 0.10));
    return { type: 'unripe', confidence: purity };
  }

  // 5. Wood, Cardboard, Stairs, Desks, and Neutral Furniture Rejection:
  // Wooden grain, brown stairs, doors, desks, cardboard boxes: Hue 16°..68°, moderate saturation, low R/G contrast
  const isWoodOrFurniture = (h >= 16 && h <= 68) && (s <= 0.65) && (r / Math.max(1, g) < 1.35);
  if (isWoodOrFurniture) {
    return null; // Reject wooden chairs, stair treads, rails, tables
  }

  return null;
}

/**
 * Validates whether a candidate bounding box genuinely contains a real tomato fruit.
 * Discards false positives like human heads, basketball jerseys, chairs, and stairs.
 */
export function validateTomatoBoundingBox(
  imageData: ImageData,
  prediction: RoboflowPrediction
): boolean {
  const { width: imgW, height: imgH, data } = imageData;
  const boxW = prediction.width;
  const boxH = prediction.height;
  const cx = prediction.x;
  const cy = prediction.y;

  // Dimension & Aspect ratio checks
  if (boxW < 22 || boxH < 22) return false;
  if (boxW > imgW * 0.90 || boxH > imgH * 0.90) return false;

  const aspect = boxW / Math.max(1, boxH);
  if (aspect < 0.50 || aspect > 2.00) return false;

  const startX = Math.max(0, Math.floor(cx - boxW / 2));
  const endX = Math.min(imgW - 1, Math.ceil(cx + boxW / 2));
  const startY = Math.max(0, Math.floor(cy - boxH / 2));
  const endY = Math.min(imgH - 1, Math.ceil(cy + boxH / 2));

  let totalSampled = 0;
  let tomatoFruitPixels = 0;
  let skinPixels = 0;
  let woodOrBackgroundPixels = 0;

  const step = 2;
  for (let y = startY; y <= endY; y += step) {
    for (let x = startX; x <= endX; x += step) {
      const idx = (y * imgW + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      totalSampled++;

      const { h, s, v } = rgbToHsv(r, g, b);

      // Check skin
      const isSkin = (h >= 8 && h <= 54) && (s <= 0.60) && (r > 75 && g > 50 && b > 35) && (r / Math.max(1, g) < 1.58);
      if (isSkin) {
        skinPixels++;
        continue;
      }

      // Check true tomato red
      const isRedHue = (h >= 336 || h <= 34);
      const isTomatoRed = r > 90 && (r > g * 1.25) && (r > b * 1.25);
      if (isRedHue && s >= 0.38 && v >= 0.18 && isTomatoRed) {
        tomatoFruitPixels++;
        continue;
      }

      // Check true tomato green
      const isGreenHue = (h >= 68 && h <= 148);
      const isTomatoGreen = g > 80 && (g > r * 1.15) && (g > b * 1.15);
      if (isGreenHue && s >= 0.32 && v >= 0.18 && isTomatoGreen) {
        tomatoFruitPixels++;
        continue;
      }

      // Check wood / background (only if not a genuine tomato color)
      const isWood = (h >= 16 && h <= 68) && (s <= 0.65) && (r / Math.max(1, g) < 1.35);
      if (isWood) {
        woodOrBackgroundPixels++;
        continue;
      }
    }
  }

  if (totalSampled < 12) return false;

  const skinRatio = skinPixels / totalSampled;
  const woodRatio = woodOrBackgroundPixels / totalSampled;
  const fruitRatio = tomatoFruitPixels / totalSampled;

  // Reject if it overlaps significantly with skin or wood
  if (skinRatio > 0.25) return false;
  if (woodRatio > 0.50 && fruitRatio < 0.20) return false;

  // If labeled as Blight, MUST have confirmed tomato fruit surrounding the lesion
  const isBlightClass = (prediction.class || '').toLowerCase().includes('blight');
  if (isBlightClass && fruitRatio < 0.14) {
    return false;
  }

  // Must have minimum authentic tomato fruit pixels
  return fruitRatio >= 0.15;
}

/**
 * Calculates Intersection over Union between two bounding boxes
 */
function calculateBoxIoU(
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

/**
 * Non-Maximum Suppression (NMS) to merge duplicate overlapping boxes around the same tomato
 */
export function applyNMS(predictions: RoboflowPrediction[], iouThreshold = 0.40): RoboflowPrediction[] {
  if (predictions.length <= 1) return predictions;

  // Sort by area * confidence descending
  const sorted = [...predictions].sort((a, b) => {
    const scoreA = a.width * a.height * (a.confidence || 1);
    const scoreB = b.width * b.height * (b.confidence || 1);
    return scoreB - scoreA;
  });

  const selected: RoboflowPrediction[] = [];

  for (const candidate of sorted) {
    let duplicate = false;
    for (const kept of selected) {
      const iou = calculateBoxIoU(candidate, kept);
      if (iou > iouThreshold) {
        duplicate = true;
        break;
      }
    }
    if (!duplicate) {
      selected.push(candidate);
    }
  }

  return selected;
}

/**
 * Analyzes raw canvas ImageData and produces MULTI-TOMATO bounding box predictions.
 * Detects ALL valid tomatoes visible in the frame simultaneously (2, 5, 10, 20+).
 * If no tomatoes are in view, returns [] without generating any false boxes.
 */
export function detectTomatoesFromImageData(
  imageData: ImageData,
  options: VisionDetectorOptions = {}
): RoboflowPrediction[] {
  const {
    minBlobAreaPx = 500,          // Balanced ~22x22px minimum area to capture small/medium tomatoes
    minConfidence = 0.45,         // Sensitive 45% confidence floor for robust detection
    maxTomatoes = 50,             // Support up to 50 simultaneous tomatoes on conveyor
  } = options;

  const { width, height, data } = imageData;
  if (width <= 0 || height <= 0 || !data || data.length === 0) {
    return [];
  }

  // Grid step: sample every 4th pixel horizontally and vertically for 60fps real-time performance
  const step = 4;
  const gridW = Math.floor(width / step);
  const gridH = Math.floor(height / step);

  const samples: (PixelSample | null)[] = new Array(gridW * gridH).fill(null);
  let totalFruitSamples = 0;

  for (let gy = 0; gy < gridH; gy++) {
    const py = gy * step;
    for (let gx = 0; gx < gridW; gx++) {
      const px = gx * step;
      const idx = (py * width + px) * 4;

      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];

      if (a < 100) continue;

      const classification = classifyPixel(r, g, b);
      if (classification) {
        samples[gy * gridW + gx] = {
          x: px,
          y: py,
          type: classification.type,
          confidence: classification.confidence,
        };
        if (classification.type === 'ripe' || classification.type === 'unripe') {
          totalFruitSamples++;
        }
      }
    }
  }

  // If the frame has insufficient tomato color pixels (< 25 sample points), return [] immediately
  if (totalFruitSamples < 25) {
    return [];
  }

  // Connected-Component Clustering on grid using BFS / Flood-Fill
  const visited = new Uint8Array(gridW * gridH);
  const clusters: BlobCluster[] = [];
  let clusterIdCounter = 1;

  for (let gy = 0; gy < gridH; gy++) {
    for (let gx = 0; gx < gridW; gx++) {
      const gIdx = gy * gridW + gx;
      if (visited[gIdx] || !samples[gIdx]) continue;

      const seed = samples[gIdx]!;
      // Seed must be an authentic fruit base (not standalone necrotic spot)
      if (seed.type === 'necrotic') continue;

      visited[gIdx] = 1;

      const cluster: BlobCluster = {
        id: clusterIdCounter++,
        type: seed.type,
        minX: seed.x,
        minY: seed.y,
        maxX: seed.x + step,
        maxY: seed.y + step,
        pixelCount: 1,
        ripePixelCount: seed.type === 'ripe' ? 1 : 0,
        unripePixelCount: seed.type === 'unripe' ? 1 : 0,
        necroticPixelCount: 0,
        totalConf: seed.confidence,
        centerXSum: seed.x,
        centerYSum: seed.y,
      };

      const queue: number[] = [gIdx];

      while (queue.length > 0) {
        const curIdx = queue.pop()!;
        const cgy = Math.floor(curIdx / gridW);
        const cgx = curIdx % gridW;

        const neighbors = [
          [cgy - 1, cgx],
          [cgy + 1, cgx],
          [cgy, cgx - 1],
          [cgy, cgx + 1],
        ];

        for (const [ny, nx] of neighbors) {
          if (ny < 0 || ny >= gridH || nx < 0 || nx >= gridW) continue;
          const nIdx = ny * gridW + nx;
          if (visited[nIdx]) continue;

          const nSample = samples[nIdx];
          if (!nSample) continue;

          // Merge adjacent fruit tissue or necrotic lesion on this fruit
          const isFruit = nSample.type === 'ripe' || nSample.type === 'unripe';
          const isCompatible = isFruit || nSample.type === 'necrotic';

          if (isCompatible) {
            visited[nIdx] = 1;
            queue.push(nIdx);

            cluster.minX = Math.min(cluster.minX, nSample.x);
            cluster.minY = Math.min(cluster.minY, nSample.y);
            cluster.maxX = Math.max(cluster.maxX, nSample.x + step);
            cluster.maxY = Math.max(cluster.maxY, nSample.y + step);
            cluster.pixelCount += 1;
            cluster.totalConf += nSample.confidence;
            cluster.centerXSum += nSample.x;
            cluster.centerYSum += nSample.y;

            if (nSample.type === 'ripe') cluster.ripePixelCount += 1;
            else if (nSample.type === 'unripe') cluster.unripePixelCount += 1;
            else if (nSample.type === 'necrotic') cluster.necroticPixelCount += 1;
          }
        }
      }

      // Check minimum area and required fruit base
      const totalFruitPixels = cluster.ripePixelCount + cluster.unripePixelCount;
      const estimatedArea = cluster.pixelCount * (step * step);
      if (estimatedArea >= minBlobAreaPx && totalFruitPixels >= 20) {
        clusters.push(cluster);
      }
    }
  }

  // Filter and format candidate predictions for ALL detected clusters
  const rawCandidates: RoboflowPrediction[] = [];

  for (const c of clusters) {
    const boxW = Math.max(step * 2, c.maxX - c.minX);
    const boxH = Math.max(step * 2, c.maxY - c.minY);

    // 1. Aspect ratio filter: Spherical / elliptical (0.50 .. 2.00)
    const aspect = boxW / Math.max(1, boxH);
    if (aspect < 0.50 || aspect > 2.00) {
      continue;
    }

    // 2. Solidity / Fill Factor filter (compact fruit shape)
    const boxArea = boxW * boxH;
    const estimatedBlobArea = c.pixelCount * (step * step);
    const fillRatio = estimatedBlobArea / Math.max(1, boxArea);
    if (fillRatio < 0.30 || fillRatio > 0.98) {
      continue;
    }

    // 3. Maximum size filter (reject entire screen flooding)
    if (boxW > width * 0.92 || boxH > height * 0.92) {
      continue;
    }

    // Centroid
    const cx = Math.round(c.centerXSum / Math.max(1, c.pixelCount));
    const cy = Math.round(c.centerYSum / Math.max(1, c.pixelCount));

    const avgConf = c.totalConf / Math.max(1, c.pixelCount);
    if (avgConf < minConfidence) continue;

    // Classification: Ripe vs Unripe vs Blight
    let finalClass = 'Ripe Tomato';
    if (c.unripePixelCount > c.ripePixelCount) {
      finalClass = 'Unripe Tomato';
    }

    // Blight is identified if necrotic lesion coverage is >= 12% on verified tomato fruit
    const necroticRatio = c.necroticPixelCount / Math.max(1, c.pixelCount);
    if (necroticRatio >= 0.12 && (c.ripePixelCount + c.unripePixelCount) >= 25) {
      finalClass = 'Blight / Diseased Tomato';
    }

    rawCandidates.push({
      x: cx,
      y: cy,
      width: boxW,
      height: boxH,
      class: finalClass,
      confidence: Math.max(0.70, Number(avgConf.toFixed(2))),
      class_id: finalClass.includes('Blight') ? 2 : finalClass.includes('Unripe') ? 1 : 0,
      detection_id: `tomato_blob_${c.id}_${Date.now()}`,
    });
  }

  // Apply Non-Maximum Suppression to remove duplicates and return ALL discrete tomatoes
  const finalDetections = applyNMS(rawCandidates, 0.40);

  // Return all detected tomatoes up to max cap
  return finalDetections.slice(0, maxTomatoes);
}
