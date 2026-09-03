import express from 'express';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3000;

// Parse large base64 JSON payloads for image frames (limit 25mb)
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'BlightDetect+ Tomato Vision Stream' });
});

export interface PredictionResult {
  x: number;
  y: number;
  width: number;
  height: number;
  class: string;
  confidence: number;
  class_id?: number;
}

// Helper to normalize tomato classification from Roboflow model
function normalizeTomatoClass(rawClass: string = ''): { displayName: string; class_id: number; ripeness: 'ripe' | 'unripe' | 'blight' } {
  const c = rawClass.toLowerCase().replace(/[-_]/g, ' ').trim();
  if (c.includes('blight') || c.includes('disease') || c.includes('rot') || c.includes('defect') || c.includes('decay') || c.includes('lesion') || c.includes('spot')) {
    return { displayName: 'Defect / Blight Tomato', class_id: 2, ripeness: 'blight' };
  }
  if (c.includes('unripe') || c.includes('green') || c.includes('immature')) {
    return { displayName: 'Unripe Tomato', class_id: 1, ripeness: 'unripe' };
  }
  return { displayName: 'Ripe Tomato', class_id: 0, ripeness: 'ripe' };
}

// Helper to normalize Roboflow model endpoint (strips full URL prefix, ensures /1 version)
function resolveModelEndpoint(customEndpoint?: string): string {
  let ep = (customEndpoint || process.env.ROBOFLOW_MODEL_ENDPOINT || 'tomato-fruit-ripeness-and-blight/1').trim();
  ep = ep.replace(/^https?:\/\/detect\.roboflow\.com\//i, '').trim();
  if (ep && !ep.includes('/')) {
    ep = `${ep}/1`;
  }
  return ep;
}

// Roboflow health check & connection status endpoint
app.get('/api/roboflow/status', async (_req, res) => {
  const roboflowKey = process.env.ROBOFLOW_API_KEY;
  const modelEndpoint = resolveModelEndpoint();

  const isKeyConfigured = Boolean(roboflowKey && roboflowKey.trim() !== '' && roboflowKey !== 'MY_ROBOFLOW_API_KEY');
  
  if (!isKeyConfigured) {
    return res.json({
      configured: false,
      endpoint: modelEndpoint,
      status: 'unconfigured',
      message: 'No Roboflow API key configured in environment variables.',
    });
  }

  try {
    const checkRes = await fetch(`https://api.roboflow.com/?api_key=${roboflowKey}`);
    const checkData = checkRes.ok ? await checkRes.json() : null;

    return res.json({
      configured: true,
      endpoint: modelEndpoint,
      status: checkRes.ok ? 'connected' : 'error',
      statusCode: checkRes.status,
      workspace: checkData?.workspace || 'Connected',
      message: checkRes.ok ? 'Roboflow API connected and ready.' : `Roboflow returned status ${checkRes.status}`,
    });
  } catch (err: any) {
    return res.json({
      configured: true,
      endpoint: modelEndpoint,
      status: 'network_error',
      message: err?.message || 'Could not reach Roboflow API servers.',
    });
  }
});

// Roboflow / YOLO inference API proxy
app.post('/api/detect', async (req, res) => {
  const startTime = Date.now();
  try {
    const { image, confidence = 0.50, overlap = 0.3, endpoint: customEndpoint } = req.body;

    if (!image) {
      return res.status(400).json({ error: 'Image base64 is required' });
    }

    const roboflowKey = process.env.ROBOFLOW_API_KEY;
    const modelEndpoint = resolveModelEndpoint(customEndpoint);

    // Clean base64 string
    const base64Data = image.replace(/^data:image\/[a-z]+;base64,/, '');

    // If Roboflow key is configured, forward request to Roboflow Hosted Inference API
    if (roboflowKey && roboflowKey.trim() !== '' && roboflowKey !== 'MY_ROBOFLOW_API_KEY') {
      try {
        // Query Roboflow with a sensible base confidence (max 0.35) so candidate boxes aren't prematurely dropped by the cloud API
        const queryConfidence = Math.max(0.20, Math.min(Number(confidence) || 0.35, 0.35));
        const roboflowUrl = `https://detect.roboflow.com/${modelEndpoint}?api_key=${roboflowKey}&confidence=${queryConfidence}&overlap=${overlap}&format=json`;
        
        let response = await fetch(roboflowUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: base64Data,
        });

        let data = response.ok ? await response.json() : null;
        let rawPredictions = data?.predictions || [];
        let usedEndpoint = modelEndpoint;

        // If primary model returned 0 predictions and no custom endpoint was explicitly specified,
        // attempt secondary model (tomato-defect-and-unripe-detect-kdhgn/1) to catch edge-case unripe fruit
        if ((!rawPredictions || rawPredictions.length === 0) && !customEndpoint && modelEndpoint !== 'tomato-defect-and-unripe-detect-kdhgn/1') {
          try {
            const fallbackUrl = `https://detect.roboflow.com/tomato-defect-and-unripe-detect-kdhgn/1?api_key=${roboflowKey}&confidence=${queryConfidence}&overlap=${overlap}&format=json`;
            const fallbackRes = await fetch(fallbackUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: base64Data,
            });
            if (fallbackRes.ok) {
              const fallbackData = await fallbackRes.json();
              if (fallbackData?.predictions && fallbackData.predictions.length > 0) {
                data = fallbackData;
                rawPredictions = fallbackData.predictions;
                usedEndpoint = 'tomato-defect-and-unripe-detect-kdhgn/1';
              }
            }
          } catch (e) {
            // Ignore fallback network error, use primary result
          }
        }

        if (response.ok || rawPredictions.length > 0) {
          const inferenceTimeMs = Date.now() - startTime;
          
          const validPredictions = rawPredictions.map((p: any) => {
            const normalized = normalizeTomatoClass(p.class);
            return {
              x: p.x,
              y: p.y,
              width: p.width,
              height: p.height,
              class: normalized.displayName,
              original_class: p.class,
              ripeness: normalized.ripeness,
              confidence: p.confidence,
              class_id: normalized.class_id,
              detection_id: p.detection_id || `rf_${Math.random().toString(36).slice(2, 9)}`,
            };
          });

          return res.json({
            predictions: validPredictions,
            imageWidth: data?.image?.width || 640,
            imageHeight: data?.image?.height || 480,
            inferenceTimeMs,
            source: 'roboflow-cloud',
            endpoint: usedEndpoint,
          });
        } else {
          const errorBody = await response.text();
          console.warn(`Roboflow Inference API error (${response.status}) on ${modelEndpoint}:`, errorBody);
          return res.json({
            predictions: [],
            imageWidth: 640,
            imageHeight: 480,
            inferenceTimeMs: Date.now() - startTime,
            source: 'roboflow-error',
            endpoint: modelEndpoint,
            error: `Roboflow API returned status ${response.status}`,
          });
        }
      } catch (rfErr: any) {
        console.warn('Roboflow API call exception:', rfErr);
        return res.json({
          predictions: [],
          imageWidth: 640,
          imageHeight: 480,
          inferenceTimeMs: Date.now() - startTime,
          source: 'roboflow-error',
          endpoint: modelEndpoint,
          error: rfErr?.message || 'Network error calling Roboflow',
        });
      }
    }

    // When no Roboflow key is configured, return empty predictions
    const inferenceTimeMs = Date.now() - startTime;
    return res.json({
      predictions: [],
      imageWidth: 640,
      imageHeight: 480,
      inferenceTimeMs,
      source: 'local-passthrough',
    });
  } catch (error) {
    console.error('Inference error in /api/detect:', error);
    return res.status(500).json({
      error: 'Inference processing failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      predictions: [],
    });
  }
});

// Vite & Static file serving setup
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`BlightDetect+ server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
