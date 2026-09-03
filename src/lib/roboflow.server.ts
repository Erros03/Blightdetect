/**
 * Roboflow Server Constants & Model Definitions
 */

export const ROBOFLOW_CONFIG = {
  DEFAULT_CONFIDENCE: 0.40,
  DEFAULT_OVERLAP: 0.30,
  SUPPORTED_CLASSES: [
    'Ripe Tomato',
    'Unripe Tomato',
    'Blight / Diseased Tomato',
    'ripe',
    'unripe',
    'blight',
    'early_blight',
    'late_blight',
  ],
};

export interface DetectionApiResponse {
  predictions: {
    x: number;
    y: number;
    width: number;
    height: number;
    class: string;
    confidence: number;
    class_id?: number;
  }[];
  imageWidth?: number;
  imageHeight?: number;
  inferenceTimeMs: number;
  source?: string;
  error?: string;
}
