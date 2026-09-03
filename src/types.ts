/**
 * BlightDetect+ Tomato Vision Stream Types
 */

export type TomatoRipeness = 'ripe' | 'unripe' | 'blight';

export type TomatoSizeClass = 'small' | 'medium' | 'large' | 'extra-large';

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
}

export interface TrackedTomato {
  id: number;
  centroid: { x: number; y: number };
  bbox: { x: number; y: number; width: number; height: number };
  class: string;
  ripeness: TomatoRipeness;
  confidence: number;
  firstSeen: number;
  lastSeen: number;
  framesVisible: number;
  counted: boolean;
  diameterMm?: number;
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
  diameterMm: number; // calculated geometric estimate in mm
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  trackId: number;
  inferenceLatencyMs?: number;
}

export interface TomatoSessionCounts {
  ripe: number;
  unripe: number;
  blight: number;
  total: number;
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

