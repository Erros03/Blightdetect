/**
 * Client-Side YOLO/Roboflow inference function
 * Calls the secure server-side proxy to keep API keys hidden
 */
import type { RoboflowPrediction } from '../types.ts';
import type { DetectionApiResponse } from './roboflow.server.ts';

export interface DetectOptions {
  confidence?: number;
  overlap?: number;
  endpoint?: string;
  signal?: AbortSignal;
}

export interface DetectTomatoesResult {
  predictions: RoboflowPrediction[];
  inferenceTimeMs: number;
  imageWidth: number;
  imageHeight: number;
  source?: string;
  endpoint?: string;
  error?: string;
}

export async function checkRoboflowStatus(): Promise<{
  configured: boolean;
  endpoint: string;
  status: 'connected' | 'error' | 'unconfigured' | 'network_error';
  statusCode?: number;
  workspace?: string;
  message: string;
}> {
  try {
    const res = await fetch('/api/roboflow/status');
    if (!res.ok) {
      return {
        configured: false,
        endpoint: '',
        status: 'error',
        statusCode: res.status,
        message: `Status check returned HTTP ${res.status}`,
      };
    }
    return await res.json();
  } catch (err: any) {
    return {
      configured: false,
      endpoint: '',
      status: 'network_error',
      message: err?.message || 'Network error checking Roboflow status',
    };
  }
}

export async function detectTomatoesFn(
  imageBase64: string,
  options: DetectOptions = {}
): Promise<DetectTomatoesResult> {
  const { confidence = 0.50, overlap = 0.3, endpoint, signal } = options;

  try {
    const response = await fetch('/api/detect', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image: imageBase64,
        confidence,
        overlap,
        endpoint,
      }),
      signal,
    });

    if (!response.ok) {
      throw new Error(`Inference server responded with status: ${response.status}`);
    }

    const data = await response.json();
    return {
      predictions: data.predictions || [],
      inferenceTimeMs: data.inferenceTimeMs || 0,
      imageWidth: data.imageWidth || 640,
      imageHeight: data.imageHeight || 480,
      source: data.source,
      endpoint: data.endpoint,
      error: data.error,
    };
  } catch (error) {
    if (signal?.aborted) {
      throw error;
    }
    console.warn('detectTomatoesFn error:', error);
    // Return empty predictions without crashing the continuous stream
    return {
      predictions: [],
      inferenceTimeMs: 0,
      imageWidth: 640,
      imageHeight: 480,
      source: 'client-error',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
