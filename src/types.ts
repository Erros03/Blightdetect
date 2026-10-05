/**
 * BlightDetect+ Tomato Vision Stream Types
 * Expanded for Capstone Defense Recommendations (Pathology, 95% Sorter Gating, Post-Harvest)
 */

export type TomatoRipeness = 'ripe' | 'unripe' | 'blight';

export type TomatoSizeClass = 'small' | 'medium' | 'large';

export type BlightType = 'early_blight' | 'late_blight' | 'septoria_spot' | 'none';

export type BlightSeverity = 'none' | 'mild' | 'moderate' | 'severe';

export type SortingAction = 'ACCEPT' | 'REJECT_QUARANTINE' | 'MANUAL_REVIEW';

export type QualityGrade = 'Grade A' | 'Grade B' | 'Grade C';

export type CameraResolution = '1080p' | '720p' | '480p';

export type ModelBackendType = 'yolov11_roboflow' | 'local_yolov11_onnx' | 'gemini_vision_llm';

export interface PostHarvestMetrics {
  shelfLifeDaysCold: number;      // Days at 12-15°C cold chain
  shelfLifeDaysAmbient: number;   // Days at 25°C ambient warehouse
  marketabilityScore: number;     // 0 - 100% compliance with USDA No. 1 / No. 2
  storageRecommendation: string; // Handling directives (Quarantine, Ripening, Retail)
  quarantineRequired: boolean;
  defectPericarpCoverage: number; // Estimated % lesion coverage (0 - 100)
}

/**
 * Strict evaluation response format required by defense panel & automated benchmarks
 */
export interface StructuredInferenceResponse {
  status: 'success' | 'error';
  classification: string;         // e.g. "Healthy" or "Blight (Early Blight / Late Blight)"
  confidence_percentage: number;  // 0.0 - 100.0%
  sorting_action: SortingAction;  // "ACCEPT" | "REJECT_QUARANTINE" | "MANUAL_REVIEW"
  quality_grade: QualityGrade;    // "Grade A" | "Grade B" | "Grade C"
  analytics_notes: string;
  blight_type?: BlightType;
  severity?: BlightSeverity;
  post_harvest?: PostHarvestMetrics;
}

export interface BoundingBox {
  x: number;      // center x (or top-left depending on coordinate system, standardized to pixel coordinates)
  y: number;      // center y
  width: number;
  height: number;
}

export interface RoboflowPrediction {
  x: number;
  y: number;
  width: number;
  height: number;
  class: string;
  confidence: number;
  class_id?: number;
  detection_id?: string;
  blight_type?: BlightType;
  severity?: BlightSeverity;
}

export interface TrackedTomato {
  id: number;
  centroid: { x: number; y: number };
  bbox: { x: number; y: number; width: number; height: number };
  class: string;
  ripeness: TomatoRipeness;
  confidence: number;
  blightType?: BlightType;
  severity?: BlightSeverity;
  sortingAction?: SortingAction;
  qualityGrade?: QualityGrade;
  postHarvest?: PostHarvestMetrics;
  firstSeen: number;
  lastSeen: number;
  framesVisible: number;
  counted: boolean;
  diameterMm?: number;
  weightGrams?: number;
  weightOz?: number;
  trajectory: { x: number; y: number; time: number }[];
}

export interface TomatoDetectionEvent {
  id: string;
  sessionId: string;
  timestamp: number;
  createdAt: string;
  class: string;
  ripeness: TomatoRipeness;
  confidence: number;
  size: TomatoSizeClass;
  diameterMm: number; // calculated geometric estimate in mm (Medium: 60-75mm / 2.5-3.0 in)
  weightGrams?: number; // calculated weight estimate in grams (Medium: 110-170g / 4-6 oz)
  weightOz?: number; // calculated weight estimate in ounces
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  trackId: number;
  inferenceLatencyMs?: number;
  blightType?: BlightType;
  severity?: BlightSeverity;
  sortingAction?: SortingAction;
  qualityGrade?: QualityGrade;
  postHarvest?: PostHarvestMetrics;
}

export interface TomatoSessionCounts {
  ripe: number;
  unripe: number;
  blight: number;
  total: number;
  // Panel Recommendation #14 metrics
  accepted?: number;
  rejected?: number;
  manualReview?: number;
  gradeA?: number;
  gradeB?: number;
  gradeC?: number;
  earlyBlight?: number;
  lateBlight?: number;
}

export interface DetectionSession {
  id: string;
  date: string;              // YYYY-MM-DD
  startTime: string;         // HH:MM:SS format
  endTime?: string;          // HH:MM:SS format
  createdAt: number;         // epoch ms
  endedAt?: number;          // epoch ms
  durationSeconds?: number;
  ripeCount: number;
  unripeCount: number;
  blightCount: number;
  totalCount: number;
  status: 'active' | 'completed';
  averageConfidence?: number;
  blightPercentage?: number;
  notes?: string;
  // Panel metrics
  acceptedCount?: number;
  rejectedCount?: number;
  manualReviewCount?: number;
  gradeACount?: number;
  gradeBCount?: number;
  gradeCCount?: number;
}

export type CameraStatus =
  | 'off'
  | 'requesting'
  | 'live'
  | 'blocked'
  | 'no_device'
  | 'error';

export interface DetectionStats {
  currentVisibleCount: number;
  visibleRipe: number;
  visibleUnripe: number;
  visibleBlight: number;
  fps: number;
  inferenceTimeMs: number;
  lastDetectionTime?: number;
  cameraResolution?: CameraResolution;
  activeModelBackend?: ModelBackendType;
  ambientLuxLevel?: number;
}

export type LowLightPreset = 'off' | 'auto' | 'standard' | 'high_gain' | 'custom';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface LowLightFilterConfig {
  enabled: boolean;
  brightness: number; // percentage, e.g. 100 to 250 (100 = neutral)
  contrast: number;   // percentage, e.g. 100 to 200 (100 = neutral)
  saturation: number; // percentage, e.g. 100 to 180 (100 = neutral)
  preset: LowLightPreset;
  autoGain: boolean;  // dynamically adjust gain based on measured ambient luminance
}

