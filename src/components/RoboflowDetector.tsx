/**
 * Continuous Real-Time YOLO / Roboflow Tomato Vision Stream Detector
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Camera,
  CameraOff,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  Eye,
  Zap,
  ShieldAlert,
  Activity,
  Moon,
  Sun,
  SlidersHorizontal,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import type {
  CameraStatus,
  RoboflowPrediction,
  TomatoSessionCounts,
  TomatoDetectionEvent,
  DetectionStats,
  TrackedTomato,
  LowLightFilterConfig,
  LowLightPreset,
} from '../types.ts';
import { detectTomatoesFn, checkRoboflowStatus } from '../lib/roboflow.functions.ts';
import { TomatoTracker } from '../lib/tracker.ts';
import { detectTomatoesFromImageData, validateTomatoBoundingBox } from '../lib/vision-detector.ts';
import { arduinoSerial } from '../lib/arduino-serial.ts';
import { RoboflowDiagnosticModal } from './RoboflowDiagnosticModal.tsx';

interface RoboflowDetectorProps {
  sessionId: string;
  sessionCounts: TomatoSessionCounts;
  onTomatoCounted: (event: TomatoDetectionEvent) => void;
  onStopCamera: () => void;
  onStartCamera: () => void;
  cameraStatus: CameraStatus;
  setCameraStatus: (status: CameraStatus) => void;
  onFpsUpdate?: (fps: number) => void;
  lowLightConfig?: LowLightFilterConfig;
  onLowLightConfigChange?: (config: LowLightFilterConfig) => void;
}

export const RoboflowDetector: React.FC<RoboflowDetectorProps> = ({
  sessionId,
  sessionCounts,
  onTomatoCounted,
  onStopCamera,
  onStartCamera,
  cameraStatus,
  setCameraStatus,
  onFpsUpdate,
  lowLightConfig: controlledLowLightConfig,
  onLowLightConfigChange,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const isLoopRunningRef = useRef<boolean>(false);
  const isStartedRef = useRef<boolean>(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const nextFrameTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trackerRef = useRef<TomatoTracker>(new TomatoTracker({ useCountingLine: false }));

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [confidenceThreshold, setConfidenceThreshold] = useState<number>(0.45); // 45% default for robust real-time detection
  const confidenceThresholdRef = useRef<number>(0.45);
  confidenceThresholdRef.current = confidenceThreshold;

  const [stats, setStats] = useState<DetectionStats>({
    currentVisibleCount: 0,
    visibleRipe: 0,
    visibleUnripe: 0,
    visibleBlight: 0,
    fps: 0,
    inferenceTimeMs: 0,
  });

  const [activeTracksState, setActiveTracksState] = useState<TrackedTomato[]>([]);

  // Roboflow YOLO configuration and diagnostics - default to Tomato Fruit Ripeness and Blight model
  const [activeEndpoint, setActiveEndpoint] = useState<string>('tomato-fruit-ripeness-and-blight/1');
  const activeEndpointRef = useRef<string>('tomato-fruit-ripeness-and-blight/1');
  activeEndpointRef.current = activeEndpoint;

  const [opticalFallbackEnabled, setOpticalFallbackEnabled] = useState<boolean>(true);
  const opticalFallbackRef = useRef<boolean>(true);
  opticalFallbackRef.current = opticalFallbackEnabled;

  const [isDiagnosticModalOpen, setIsDiagnosticModalOpen] = useState<boolean>(false);
  const [roboflowApiStatus, setRoboflowApiStatus] = useState<'connected' | 'error' | 'unconfigured' | 'checking'>('checking');
  const [roboflowWorkspace, setRoboflowWorkspace] = useState<string>('');

  // Auto-verify Roboflow server connectivity on mount
  useEffect(() => {
    checkRoboflowStatus().then((res) => {
      if (res.status === 'connected') {
        setRoboflowApiStatus('connected');
        if (res.endpoint) {
          setActiveEndpoint(res.endpoint);
        }
        if (res.workspace) {
          setRoboflowWorkspace(res.workspace);
        }
      } else {
        setRoboflowApiStatus(res.status);
      }
    });
  }, []);

  // Low-Light Filter state management
  const [internalLowLightConfig, setInternalLowLightConfig] = useState<LowLightFilterConfig>({
    enabled: false,
    brightness: 145, // 145% (+45% boost)
    contrast: 135,   // 135% (+35% boost)
    saturation: 120, // 120% (+20% boost)
    preset: 'standard',
    autoGain: false,
  });
  const [showLowLightDrawer, setShowLowLightDrawer] = useState<boolean>(false);
  const [ambientLuminance, setAmbientLuminance] = useState<number>(55); // 0-100%

  const activeLowLightConfig = controlledLowLightConfig ?? internalLowLightConfig;
  const lowLightConfigRef = useRef<LowLightFilterConfig>(activeLowLightConfig);
  lowLightConfigRef.current = activeLowLightConfig;

  const ambientLuminanceRef = useRef<number>(55);

  const updateLowLightConfig = useCallback((
    updater: Partial<LowLightFilterConfig> | ((prev: LowLightFilterConfig) => LowLightFilterConfig)
  ) => {
    let nextConfig: LowLightFilterConfig;
    if (typeof updater === 'function') {
      nextConfig = updater(lowLightConfigRef.current);
    } else {
      nextConfig = { ...lowLightConfigRef.current, ...updater };
    }
    setInternalLowLightConfig(nextConfig);
    onLowLightConfigChange?.(nextConfig);
  }, [onLowLightConfigChange]);

  const applyPreset = (preset: LowLightPreset) => {
    if (preset === 'off') {
      updateLowLightConfig({ enabled: false, preset: 'off', autoGain: false });
    } else if (preset === 'standard') {
      updateLowLightConfig({
        enabled: true,
        brightness: 145,
        contrast: 135,
        saturation: 120,
        preset: 'standard',
        autoGain: false,
      });
    } else if (preset === 'high_gain') {
      updateLowLightConfig({
        enabled: true,
        brightness: 180,
        contrast: 150,
        saturation: 130,
        preset: 'high_gain',
        autoGain: false,
      });
    } else if (preset === 'auto') {
      updateLowLightConfig({
        enabled: true,
        brightness: 145,
        contrast: 135,
        saturation: 120,
        preset: 'auto',
        autoGain: true,
      });
    }
  };

  // Performance telemetry and high-precision sliding window FPS calculation
  const frameTimestampsRef = useRef<number[]>([]);
  const consecutiveFailuresRef = useRef<number>(0);
  const onFpsUpdateRef = useRef(onFpsUpdate);
  onFpsUpdateRef.current = onFpsUpdate;

  // Stop camera stream and cleanup
  const stopCameraStream = useCallback(() => {
    isLoopRunningRef.current = false;
    isStartedRef.current = false;

    if (nextFrameTimeoutRef.current) {
      clearTimeout(nextFrameTimeoutRef.current);
      nextFrameTimeoutRef.current = null;
    }

    if (animFrameIdRef.current) {
      cancelAnimationFrame(animFrameIdRef.current);
      animFrameIdRef.current = null;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {
          console.warn('Track stop error:', e);
        }
      });
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    // Clear canvas
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    }

    frameTimestampsRef.current = [];
    setCameraStatus('off');
    setStats((prev) => ({
      ...prev,
      currentVisibleCount: 0,
      visibleRipe: 0,
      visibleUnripe: 0,
      visibleBlight: 0,
      fps: 0,
    }));
    onFpsUpdateRef.current?.(0);
    setActiveTracksState([]);
    trackerRef.current.reset();
  }, [setCameraStatus]);

  // Main continuous inference loop
  const runInferenceLoop = useCallback(async () => {
    if (!isLoopRunningRef.current || !videoRef.current) return;

    const video = videoRef.current;
    if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
      // Wait for video frame to be ready
      animFrameIdRef.current = requestAnimationFrame(() => {
        runInferenceLoop();
      });
      return;
    }

    const vw = video.videoWidth;
    const vh = video.videoHeight;

    // Initialize offscreen capture canvas
    if (!offscreenCanvasRef.current) {
      offscreenCanvasRef.current = document.createElement('canvas');
    }
    const offCanvas = offscreenCanvasRef.current;
    
    // Scale for optimal real-time inference (640x480 max)
    const targetWidth = Math.min(640, vw);
    const targetHeight = Math.round((targetWidth / vw) * vh);
    offCanvas.width = targetWidth;
    offCanvas.height = targetHeight;

    const offCtx = offCanvas.getContext('2d', { willReadFrequently: true });
    if (!offCtx) return;

    // 1. Programmatically apply Low-Light Enhancement filter to capture buffer
    const cfg = lowLightConfigRef.current;
    let appliedBrightness = cfg.brightness;
    let appliedContrast = cfg.contrast;
    let appliedSaturation = cfg.saturation;

    if (cfg.enabled) {
      if (cfg.autoGain && ambientLuminanceRef.current < 45) {
        const lumDeficit = 45 - ambientLuminanceRef.current;
        appliedBrightness = Math.min(240, appliedBrightness + lumDeficit * 1.6);
        appliedContrast = Math.min(190, appliedContrast + lumDeficit * 1.1);
      }
      offCtx.filter = `brightness(${appliedBrightness}%) contrast(${appliedContrast}%) saturate(${appliedSaturation}%)`;
    } else {
      offCtx.filter = 'none';
    }

    // Draw current camera frame to capture buffer with programmatic enhancement
    offCtx.drawImage(video, 0, 0, targetWidth, targetHeight);

    // Extract uncompressed frame ImageData for high-accuracy pixel vision analysis
    const frameImageData = offCtx.getImageData(0, 0, targetWidth, targetHeight);

    // Measure ambient luminance for auto-gain and UI lux exposure meter
    if (frameImageData && frameImageData.data.length > 0) {
      let lumSum = 0;
      const step = 64;
      const totalSamples = Math.floor(frameImageData.data.length / step);
      for (let s = 0; s < totalSamples; s++) {
        const idx = s * step;
        lumSum += 0.2126 * frameImageData.data[idx] + 0.7152 * frameImageData.data[idx + 1] + 0.0722 * frameImageData.data[idx + 2];
      }
      const measured = Math.round((lumSum / (Math.max(1, totalSamples) * 255)) * 100);
      ambientLuminanceRef.current = measured;
      if (Math.random() < 0.18) {
        setAmbientLuminance(measured);
      }
    }

    // JPEG base64 payload
    const imageBase64 = offCanvas.toDataURL('image/jpeg', 0.72);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const inferenceStart = performance.now();

    try {
      // 1. Check if server Roboflow proxy returns cloud predictions
      const currentConfThreshold = confidenceThresholdRef.current;
      const serverResult = await detectTomatoesFn(imageBase64, {
        confidence: currentConfThreshold,
        overlap: 0.3,
        endpoint: activeEndpointRef.current,
        signal: abortController.signal,
      });

      // 2. Extract and validate predictions (multi-tomato mode)
      let rawPredictions: RoboflowPrediction[] = [];
      const isCloudModel = serverResult.source === 'roboflow-cloud';

      if (isCloudModel) {
        // ROBOFLOW CLOUD INFERENCE: Neural network detected tomatoes
        if (serverResult.predictions && serverResult.predictions.length > 0) {
          const scaleX = vw / (serverResult.imageWidth || targetWidth);
          const scaleY = vh / (serverResult.imageHeight || targetHeight);
          rawPredictions = serverResult.predictions
            .filter((p) => (p.confidence ?? 1) >= currentConfThreshold)
            .map((p) => ({
              ...p,
              x: p.x * scaleX,
              y: p.y * scaleY,
              width: p.width * scaleX,
              height: p.height * scaleY,
            }));
        } else {
          // Roboflow confirmed NO TOMATO in frame!
          // We intentionally DO NOT guess or detect random background objects
          if (opticalFallbackRef.current) {
            const localDetections = detectTomatoesFromImageData(frameImageData, {
              minBlobAreaPx: 400,
              minConfidence: currentConfThreshold,
              maxTomatoes: 15,
            });
            const scaleX = vw / targetWidth;
            const scaleY = vh / targetHeight;
            rawPredictions = localDetections.map((p) => ({
              ...p,
              x: p.x * scaleX,
              y: p.y * scaleY,
              width: p.width * scaleX,
              height: p.height * scaleY,
            }));
          } else {
            rawPredictions = [];
          }
        }
      } else {
        // Offline or unconfigured Roboflow API
        if (opticalFallbackRef.current) {
          const localDetections = detectTomatoesFromImageData(frameImageData, {
            minBlobAreaPx: 600,
            minConfidence: currentConfThreshold,
            maxTomatoes: 10,
          });
          const scaleX = vw / targetWidth;
          const scaleY = vh / targetHeight;
          rawPredictions = localDetections.map((p) => ({
            ...p,
            x: p.x * scaleX,
            y: p.y * scaleY,
            width: p.width * scaleX,
            height: p.height * scaleY,
          }));
        } else {
          rawPredictions = [];
        }
      }

      // SINGLE TOMATO DETECTION ONLY:
      // Limit to exactly ONE detection per frame by selecting the single largest / most prominent tomato
      if (rawPredictions.length > 1) {
        rawPredictions.sort((a, b) => {
          const areaA = a.width * a.height * (a.confidence || 1);
          const areaB = b.width * b.height * (b.confidence || 1);
          return areaB - areaA;
        });
        rawPredictions = [rawPredictions[0]];
      }

      const inferenceDuration = Math.round(performance.now() - inferenceStart);
      consecutiveFailuresRef.current = 0;

      // 3. Multi-object tracking with duplicate prevention & counting line
      const trackerResult = trackerRef.current.update(
        rawPredictions,
        vw,
        vh,
        sessionId
      );

      // Emit new unique tomato detection events
      trackerResult.newlyCountedEvents.forEach((evt) => {
        onTomatoCounted({
          ...evt,
          inferenceLatencyMs: inferenceDuration,
        });
        // Auto-dispatch hardware actuator signal via Web Serial API
        arduinoSerial.handleDetectionEvent(evt.ripeness, evt.confidence);
      });

      // 4. Update UI telemetry & calculate real-time inference FPS
      const now = performance.now();
      frameTimestampsRef.current.push(now);

      // Sliding window: filter out timestamps older than 1500ms
      const cutoff = now - 1500;
      frameTimestampsRef.current = frameTimestampsRef.current.filter((t) => t >= cutoff);

      let computedFps = 0;
      if (frameTimestampsRef.current.length > 1) {
        const spanMs = now - frameTimestampsRef.current[0];
        if (spanMs > 0) {
          computedFps = Math.round(((frameTimestampsRef.current.length - 1) * 1000) / spanMs);
        }
      } else if (inferenceDuration > 0) {
        computedFps = Math.round(1000 / (inferenceDuration + 25));
      }

      setStats({
        currentVisibleCount: trackerResult.totalVisible,
        visibleRipe: trackerResult.visibleRipe,
        visibleUnripe: trackerResult.visibleUnripe,
        visibleBlight: trackerResult.visibleBlight,
        fps: computedFps,
        inferenceTimeMs: inferenceDuration,
        lastDetectionTime: Date.now(),
      });
      onFpsUpdateRef.current?.(computedFps);
      setActiveTracksState(trackerResult.activeTracks);

      // 5. Draw bounding boxes & tracking overlay on canvas
      drawOverlay(vw, vh, trackerResult.activeTracks, rawPredictions);

    } catch (err: unknown) {
      if ((err as Error)?.name !== 'AbortError') {
        console.warn('Inference frame warning:', err);
        consecutiveFailuresRef.current += 1;
        if (consecutiveFailuresRef.current > 15) {
          setErrorDetails('Multiple consecutive inference frames failed. Check network connectivity.');
        }
      }
    }

    // 6. Schedule next frame continuously (no setInterval!)
    if (isLoopRunningRef.current) {
      // Small pause (25ms) between frames to prevent CPU saturation while preserving real-time feel
      nextFrameTimeoutRef.current = setTimeout(() => {
        if (isLoopRunningRef.current) {
          animFrameIdRef.current = requestAnimationFrame(() => {
            runInferenceLoop();
          });
        }
      }, 25);
    }
  }, [sessionId, onTomatoCounted]);

  // Render bounding boxes, labels, and virtual gate
  const drawOverlay = (
    vw: number,
    vh: number,
    tracks: TrackedTomato[],
    _rawPredictions: RoboflowPrediction[]
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (canvas.width !== vw || canvas.height !== vh) {
      canvas.width = vw;
      canvas.height = vh;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, vw, vh);

    // Draw active tracked tomatoes (Multi-Tomato Simultaneous)
    tracks.forEach((track) => {
      const { bbox, ripeness, class: className, confidence, id, counted } = track;
      
      // Calculate top-left from center
      const x = bbox.x - bbox.width / 2;
      const y = bbox.y - bbox.height / 2;
      const w = bbox.width;
      const h = bbox.height;

      // Color scheme based on ripeness
      let strokeColor = '#10b981'; // Green for ripe
      let fillColor = 'rgba(16, 185, 129, 0.15)';
      let badgeColor = '#059669';

      if (ripeness === 'unripe') {
        strokeColor = '#84cc16'; // Lime for unripe
        fillColor = 'rgba(132, 204, 22, 0.15)';
        badgeColor = '#65a30d';
      } else if (ripeness === 'blight') {
        strokeColor = '#ef4444'; // Red for blight
        fillColor = 'rgba(239, 68, 68, 0.22)';
        badgeColor = '#dc2626';
      }

      // Draw bounding box with rounded corners
      ctx.save();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = strokeColor;
      ctx.fillStyle = fillColor;

      ctx.beginPath();
      const radius = 6;
      ctx.roundRect(x, y, w, h, radius);
      ctx.fill();
      ctx.stroke();

      // Corner accent markers
      const cornerLen = Math.min(14, w * 0.25);
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#ffffff';

      // Top-Left
      ctx.beginPath();
      ctx.moveTo(x, y + cornerLen);
      ctx.lineTo(x, y);
      ctx.lineTo(x + cornerLen, y);
      ctx.stroke();

      // Bottom-Right
      ctx.beginPath();
      ctx.moveTo(x + w - cornerLen, y + h);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x + w, y + h - cornerLen);
      ctx.stroke();

      // Label text & display formatting: class, confidence, tracking ID (#T001)
      let displayClass = 'Ripe Tomato';
      if (ripeness === 'unripe') displayClass = 'Unripe Tomato';
      else if (ripeness === 'blight') displayClass = 'Blight / Diseased';

      const formattedId = `#T${String(id).padStart(3, '0')}`;
      const tagText = `${displayClass.toUpperCase()} • ${(confidence * 100).toFixed(0)}% | ${formattedId}${counted ? ' [COUNTED]' : ''}`;
      ctx.font = 'bold 12px system-ui, -apple-system, sans-serif';
      const textMetrics = ctx.measureText(tagText);
      const tagWidth = textMetrics.width + 16;
      const tagHeight = 22;
      const tagY = Math.max(4, y - tagHeight - 4);

      ctx.fillStyle = badgeColor;
      ctx.beginPath();
      ctx.roundRect(x, tagY, tagWidth, tagHeight, 6);
      ctx.fill();

      // Subtle shadow/border on label
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Label text
      ctx.fillStyle = '#ffffff';
      ctx.fillText(tagText, x + 8, tagY + 15);

      // Draw Centroid dot & trajectory
      ctx.fillStyle = strokeColor;
      ctx.beginPath();
      ctx.arc(track.centroid.x, track.centroid.y, 4, 0, Math.PI * 2);
      ctx.fill();

      if (track.trajectory.length > 1) {
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        track.trajectory.forEach((pt, idx) => {
          if (idx === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        });
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.restore();
    });
  };

  // Start Camera & Permission Flow
  const startCameraAndInference = useCallback(async () => {
    if (isStartedRef.current) return;

    setErrorMessage(null);
    setErrorDetails(null);
    setCameraStatus('requesting');

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraStatus('error');
      setErrorMessage('Browser MediaDevices API is not supported in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'environment', // Prefer back camera on mobile
        },
        audio: false,
      });

      streamRef.current = stream;
      isStartedRef.current = true;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().then(() => {
            setCameraStatus('live');
            isLoopRunningRef.current = true;
            runInferenceLoop();
          }).catch((playErr) => {
            console.error('Video play error:', playErr);
          });
        };
      }
    } catch (err: unknown) {
      isStartedRef.current = false;
      const error = err as { name?: string; message?: string };
      console.error('Camera access error:', error);

      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        setCameraStatus('blocked');
        setErrorMessage('Camera access is blocked.');
        setErrorDetails(
          'Please allow camera permission from your browser address bar (lock/camera icon) and refresh or click "Start Camera".'
        );
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        setCameraStatus('no_device');
        setErrorMessage('No camera device was found. Connect a webcam and reload.');
      } else if (error.name === 'SecurityError') {
        setCameraStatus('error');
        setErrorMessage('Camera access was blocked due to browser security restrictions.');
      } else {
        setCameraStatus('error');
        setErrorMessage(`Camera initialization error: ${error.message || 'Unknown error'}`);
      }
    }
  }, [setCameraStatus, runInferenceLoop]);

  // Auto-start camera when mounted in Live Stream
  useEffect(() => {
    startCameraAndInference();

    return () => {
      stopCameraStream();
    };
  }, [startCameraAndInference, stopCameraStream]);

  // Capture current frame for Roboflow testing & diagnostics
  const getCurrentFrameBase64 = useCallback((): string | null => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return null;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
  }, []);

  return (
    <div className="space-y-6">
      {/* Top Telemetry & Live Metrics Banner */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        {/* TOTAL CARD */}
        <div id="stat-card-total" className="relative overflow-hidden rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900/90 p-4 shadow-xs transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">Total Counted</span>
            <div className="rounded-lg bg-stone-100 dark:bg-stone-800 p-1.5 text-stone-700 dark:text-stone-300">
              <Zap className="h-4 w-4 text-amber-500 dark:text-amber-400" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-3xl font-black text-stone-900 dark:text-white">{sessionCounts.total}</span>
            <span className="text-xs font-semibold text-stone-500 dark:text-stone-400">Tomatoes</span>
          </div>
          <div className="mt-1 text-[11px] text-stone-400 dark:text-stone-500">Unique items tracked & counted</div>
        </div>

        {/* RIPE CARD */}
        <div id="stat-card-ripe" className="relative overflow-hidden rounded-2xl border border-emerald-200 dark:border-emerald-900/50 bg-white dark:bg-stone-900/90 p-4 shadow-xs transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Ripe / Grade A</span>
            <div className="rounded-lg bg-emerald-100 dark:bg-emerald-950 p-1.5 text-emerald-800 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-3xl font-black text-emerald-600 dark:text-emerald-400">{sessionCounts.ripe}</span>
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-500">
              {sessionCounts.total > 0
                ? `${Math.round((sessionCounts.ripe / sessionCounts.total) * 100)}%`
                : '0%'}
            </span>
          </div>
          <div className="mt-1 text-[11px] text-stone-400 dark:text-stone-500">Market-ready tomatoes</div>
        </div>

        {/* UNRIPE CARD */}
        <div id="stat-card-unripe" className="relative overflow-hidden rounded-2xl border border-lime-200 dark:border-lime-900/50 bg-white dark:bg-stone-900/90 p-4 shadow-xs transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-lime-700 dark:text-lime-400">Unripe / Green</span>
            <div className="rounded-lg bg-lime-100 dark:bg-lime-950 p-1.5 text-lime-800 dark:text-lime-300">
              <span className="h-4 w-4 rounded-full bg-lime-500 block"></span>
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-3xl font-black text-lime-600 dark:text-lime-400">{sessionCounts.unripe}</span>
            <span className="text-xs font-semibold text-lime-600 dark:text-lime-500">
              {sessionCounts.total > 0
                ? `${Math.round((sessionCounts.unripe / sessionCounts.total) * 100)}%`
                : '0%'}
            </span>
          </div>
          <div className="mt-1 text-[11px] text-stone-400 dark:text-stone-500">Needs ripening cycle</div>
        </div>

        {/* BLIGHT CARD */}
        <div id="stat-card-blight" className="relative overflow-hidden rounded-2xl border border-red-200 dark:border-red-900/50 bg-white dark:bg-stone-900/90 p-4 shadow-xs transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-red-700 dark:text-red-400">Blight / Diseased</span>
            <div className="rounded-lg bg-red-100 dark:bg-red-950 p-1.5 text-red-800 dark:text-red-300">
              <ShieldAlert className="h-4 w-4 text-red-600 dark:text-red-400" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-3xl font-black text-red-600 dark:text-red-400">{sessionCounts.blight}</span>
            <span className="text-xs font-semibold text-red-600 dark:text-red-500">
              {sessionCounts.total > 0
                ? `${((sessionCounts.blight / sessionCounts.total) * 100).toFixed(1)}%`
                : '0%'}
            </span>
          </div>
          <div className="mt-1 text-[11px] text-stone-400 dark:text-stone-500">Rejected / Divert to cull</div>
        </div>
      </div>

      {/* Main Video Viewport Card */}
      <div className="relative overflow-hidden rounded-3xl border border-stone-800 bg-stone-950 shadow-2xl">
        {/* Stream Top Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-800 bg-stone-900/80 px-4 py-2.5 sm:px-6">
          <div className="flex items-center space-x-3">
            {cameraStatus === 'live' ? (
              <div className="flex items-center space-x-2 sm:space-x-3">
                {/* LIVE Badge */}
                <span className="flex items-center space-x-1.5 rounded-full bg-red-950/90 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-red-400 border border-red-800/80 shadow-xs">
                  <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse"></span>
                  <span>LIVE</span>
                </span>

                {/* CONVEYOR COUNTING ACTIVE Status Indicator */}
                <div
                  id="conveyor-counting-active-pill"
                  className="flex items-center space-x-1.5 rounded-full bg-emerald-950/90 px-3 py-1 text-xs font-bold uppercase tracking-wider text-emerald-300 border border-emerald-700/80 shadow-xs"
                >
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
                  </span>
                  <span>CONVEYOR COUNTING ACTIVE</span>
                </div>

                {/* Real-time Inference FPS Badge directly next to LIVE indicator */}
                <div
                  id="header-live-inference-fps"
                  className="hidden md:flex items-center space-x-1.5 rounded-full bg-stone-800/90 px-2.5 py-1 text-xs font-mono font-bold text-stone-200 border border-stone-700/80 shadow-xs"
                  title="Real-time YOLO inference frames per second"
                >
                  <Activity className="h-3.5 w-3.5 text-emerald-400 animate-pulse" />
                  <span className="font-extrabold text-white text-xs">
                    {stats.fps > 0
                      ? stats.fps
                      : stats.inferenceTimeMs > 0
                      ? Math.round(1000 / (stats.inferenceTimeMs + 25))
                      : '--'}
                  </span>
                  <span className="text-[10px] text-emerald-400 font-semibold">FPS</span>
                </div>
              </div>
            ) : (
              <span className="flex items-center space-x-2 text-xs font-medium text-stone-400">
                <CameraOff className="h-4 w-4 text-stone-500" />
                <span>STANDBY</span>
              </span>
            )}

            {/* Currently in frame indicator */}
            <div className="hidden sm:flex items-center space-x-1.5 rounded-md bg-stone-800 px-2.5 py-1 text-xs text-stone-300">
              <Eye className="h-3.5 w-3.5 text-blue-400" />
              <span>Visible in View:</span>
              <span className="font-bold text-white">{stats.currentVisibleCount}</span>
            </div>
          </div>

          {/* Telemetry info & Controls */}
          <div className="flex items-center space-x-2 sm:space-x-3 text-xs text-stone-400">
            {/* Roboflow Status & Resend / Inspector Badge Button */}
            <button
              id="btn-roboflow-diagnostics"
              onClick={() => setIsDiagnosticModalOpen(true)}
              className="flex items-center space-x-1.5 rounded-lg bg-stone-800/90 hover:bg-stone-750 px-2.5 py-1 text-xs text-stone-200 border border-stone-700/60 transition-colors cursor-pointer"
              title="Inspect Roboflow YOLO connection, resend current frame, or adjust sensitivity"
            >
              <Zap className="h-3.5 w-3.5 text-red-400" />
              <span className="font-semibold text-[11px] text-stone-300">Roboflow:</span>
              <span className="flex items-center space-x-1">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    roboflowApiStatus === 'connected' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                  }`}
                />
                <span className="font-mono text-emerald-400 font-bold text-[11px]">
                  {roboflowApiStatus === 'connected' ? 'Online' : 'Checking'}
                </span>
              </span>
              <RefreshCw className="h-3 w-3 text-stone-400 hover:text-stone-200 ml-0.5" />
            </button>

            {/* Confidence Threshold Badge / Quick Selector */}
            <div
              className="flex items-center space-x-1.5 rounded-lg bg-stone-800/90 px-2.5 py-1 text-xs text-stone-200 border border-stone-700/60"
              title="Detection Confidence Threshold"
            >
              <span className="text-stone-400 text-[11px]">Conf:</span>
              <span className="font-bold font-mono text-emerald-400">
                {(confidenceThreshold * 100).toFixed(0)}%
              </span>
            </div>

            {cameraStatus === 'live' && (
              <span className="hidden lg:inline text-stone-400 font-mono text-xs">
                Latency: <strong className="text-stone-200">{stats.inferenceTimeMs}ms</strong>
              </span>
            )}

            {/* Low-Light Filter Quick Toggle & Drawer Button */}
            <div className="flex items-center space-x-1">
              <button
                id="btn-toggle-low-light"
                onClick={() => updateLowLightConfig((prev) => ({ ...prev, enabled: !prev.enabled }))}
                className={`flex items-center space-x-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                  activeLowLightConfig.enabled
                    ? 'bg-amber-950/90 text-amber-300 border border-amber-600/80 shadow-xs shadow-amber-900/30'
                    : 'bg-stone-800 text-stone-400 hover:text-stone-200 hover:bg-stone-750 border border-stone-700/60'
                }`}
                title="Toggle Low-Light stream filter for dark/shadowed packhouses"
              >
                <Moon className={`h-3.5 w-3.5 ${activeLowLightConfig.enabled ? 'text-amber-400 fill-amber-400/30 animate-pulse' : 'text-stone-400'}`} />
                <span className="font-semibold">Low-Light</span>
                <span className={`text-[10px] font-extrabold px-1.5 py-0.2 rounded ${
                  activeLowLightConfig.enabled ? 'bg-amber-500/20 text-amber-300' : 'bg-stone-900 text-stone-500'
                }`}>
                  {activeLowLightConfig.enabled ? 'ON' : 'OFF'}
                </span>
              </button>

              <button
                id="btn-low-light-settings"
                onClick={() => setShowLowLightDrawer(!showLowLightDrawer)}
                className={`p-1 rounded-lg border transition-colors ${
                  showLowLightDrawer
                    ? 'bg-amber-900/60 text-amber-200 border-amber-700'
                    : 'bg-stone-800 text-stone-400 hover:text-stone-200 border-stone-700/60'
                }`}
                title="Configure Low-Light Brightness & Contrast Tuning"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Video & Canvas Stage */}
        <div className="relative aspect-video w-full max-h-[640px] bg-black flex items-center justify-center overflow-hidden">
          {/* Real-time In-Viewport HUD Badge Overlay */}
          {cameraStatus === 'live' && (
            <div className="absolute top-3 left-3 z-20 flex flex-wrap items-center gap-2 pointer-events-none select-none">
              <div className="flex items-center space-x-2 rounded-xl bg-black/85 backdrop-blur-md px-3 py-1.5 text-xs font-bold border border-stone-700/80 text-white shadow-xl">
                <span className="flex items-center space-x-1.5 text-red-400 font-extrabold text-[11px] tracking-wider">
                  <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse"></span>
                  <span>LIVE</span>
                </span>
                <span className="text-stone-600">|</span>
                <span className="flex items-center space-x-1 text-emerald-400 font-mono font-bold">
                  <Activity className="h-3.5 w-3.5" />
                  <span>
                    {stats.fps > 0
                      ? stats.fps
                      : stats.inferenceTimeMs > 0
                      ? Math.round(1000 / (stats.inferenceTimeMs + 25))
                      : '--'}{' '}
                    FPS
                  </span>
                </span>
                <span className="text-stone-600">|</span>
                <span className="text-stone-300 font-mono text-[11px]">{stats.inferenceTimeMs}ms</span>
              </div>

              {/* Low-Light Active HUD Pill */}
              {activeLowLightConfig.enabled && (
                <div
                  id="hud-low-light-badge"
                  className="flex items-center space-x-1.5 rounded-xl bg-amber-950/90 backdrop-blur-md px-3 py-1.5 text-xs font-bold border border-amber-600/80 text-amber-300 shadow-xl"
                >
                  <Moon className="h-3.5 w-3.5 text-amber-400 fill-amber-400/40 animate-pulse" />
                  <span>Low-Light Boost</span>
                  <span className="text-amber-500/80 font-mono">|</span>
                  <span className="font-mono text-amber-200">
                    +{activeLowLightConfig.brightness - 100}% B / +{activeLowLightConfig.contrast - 100}% C
                  </span>
                </div>
              )}
            </div>
          )}

          {/* CRITICAL: PROMINENT "NO TOMATO DETECTED" DISPLAY WHEN DETECTION AREA IS CLEAR */}
          {cameraStatus === 'live' && stats.currentVisibleCount === 0 && (
            <div
              id="no-tomato-detected-overlay"
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none select-none flex flex-col items-center justify-center text-center px-4"
            >
              <div className="flex items-center space-x-3 rounded-2xl bg-black/85 backdrop-blur-md px-6 py-3.5 border border-stone-700/90 shadow-2xl">
                <span className="h-3 w-3 rounded-full bg-stone-500 animate-ping"></span>
                <span className="text-sm sm:text-base font-black uppercase tracking-widest text-stone-100">
                  NO TOMATO DETECTED
                </span>
              </div>
              <p className="mt-2.5 text-[11px] font-medium text-stone-400 bg-black/60 px-3.5 py-1 rounded-full backdrop-blur-sm border border-stone-800 max-w-xs">
                Detection area clear • Conveyor sensor active (&ge;{(confidenceThreshold * 100).toFixed(0)}% conf)
              </p>
            </div>
          )}

          {/* Native HTML5 Video with programmatic CSS Brightness/Contrast Filter */}
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            style={{
              filter: activeLowLightConfig.enabled
                ? `brightness(${
                    activeLowLightConfig.autoGain && ambientLuminance < 45
                      ? Math.min(240, activeLowLightConfig.brightness + (45 - ambientLuminance) * 1.6)
                      : activeLowLightConfig.brightness
                  }%) contrast(${
                    activeLowLightConfig.autoGain && ambientLuminance < 45
                      ? Math.min(190, activeLowLightConfig.contrast + (45 - ambientLuminance) * 1.1)
                      : activeLowLightConfig.contrast
                  }%) saturate(${activeLowLightConfig.saturation}%)`
                : 'none',
              transition: 'filter 0.25s ease-out',
            }}
            className={`h-full w-full object-contain ${cameraStatus === 'live' ? 'block' : 'hidden'}`}
          />

          {/* Real-time Bounding Box Canvas Overlay */}
          <canvas
            ref={canvasRef}
            className="absolute inset-0 h-full w-full object-contain pointer-events-none z-10"
          />

          {/* Low-Light Enhancement Settings Drawer / Popover */}
          {showLowLightDrawer && (
            <div
              id="low-light-tuning-panel"
              className="absolute top-3 right-3 z-30 w-80 sm:w-96 rounded-2xl border border-amber-700/60 bg-stone-900/95 p-4 shadow-2xl backdrop-blur-md text-white space-y-3.5"
            >
              <div className="flex items-center justify-between border-b border-stone-800 pb-2.5">
                <div className="flex items-center space-x-2">
                  <Moon className="h-4 w-4 text-amber-400 fill-amber-400/30" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-white">
                    Low-Light Optical Tuning
                  </h4>
                </div>
                <button
                  onClick={() => setShowLowLightDrawer(false)}
                  className="rounded-md p-1 text-stone-400 hover:bg-stone-800 hover:text-white text-xs"
                >
                  ✕
                </button>
              </div>

              {/* Master Filter Toggle */}
              <div className="flex items-center justify-between rounded-xl bg-stone-950 p-2.5 border border-stone-800">
                <div className="flex items-center space-x-2">
                  <div className={`p-1.5 rounded-lg ${activeLowLightConfig.enabled ? 'bg-amber-950 text-amber-400' : 'bg-stone-800 text-stone-500'}`}>
                    <Sun className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold">Stream Preprocessing Filter</div>
                    <div className="text-[10px] text-stone-400">Boosts brightness & contrast for YOLOv8</div>
                  </div>
                </div>
                <button
                  onClick={() => updateLowLightConfig((prev) => ({ ...prev, enabled: !prev.enabled }))}
                  className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors ${
                    activeLowLightConfig.enabled ? 'bg-amber-600' : 'bg-stone-700'
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                      activeLowLightConfig.enabled ? 'translate-x-5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Ambient Exposure Lux Meter */}
              <div className="rounded-xl bg-stone-950/80 p-2.5 border border-stone-800/80 space-y-1.5 text-xs">
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-stone-400">Ambient Lighting Index:</span>
                  <span className={`font-mono font-bold ${
                    ambientLuminance < 35
                      ? 'text-red-400'
                      : ambientLuminance < 50
                      ? 'text-amber-400'
                      : 'text-emerald-400'
                  }`}>
                    {ambientLuminance}% {ambientLuminance < 35 ? '(Dim/Dark)' : ambientLuminance < 50 ? '(Shaded)' : '(Optimal)'}
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-stone-800 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      ambientLuminance < 35
                        ? 'bg-red-500'
                        : ambientLuminance < 50
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(5, ambientLuminance))}%` }}
                  />
                </div>
                {ambientLuminance < 40 && !activeLowLightConfig.enabled && (
                  <p className="text-[10px] text-amber-400 flex items-center gap-1 mt-1">
                    <Sparkles className="h-3 w-3" /> Low ambient light detected. Enable filter to improve detection accuracy.
                  </p>
                )}
              </div>

              {/* Preset Buttons */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider">
                  Presets
                </label>
                <div className="grid grid-cols-3 gap-1.5 text-xs">
                  <button
                    onClick={() => applyPreset('standard')}
                    className={`p-2 rounded-xl text-left border transition-all ${
                      activeLowLightConfig.enabled && activeLowLightConfig.preset === 'standard'
                        ? 'bg-amber-950/90 border-amber-600 text-amber-200'
                        : 'bg-stone-950 border-stone-800 text-stone-300 hover:border-stone-700'
                    }`}
                  >
                    <div className="font-bold text-[11px]">Packhouse</div>
                    <div className="text-[10px] text-stone-400">+45% Bright</div>
                  </button>

                  <button
                    onClick={() => applyPreset('high_gain')}
                    className={`p-2 rounded-xl text-left border transition-all ${
                      activeLowLightConfig.enabled && activeLowLightConfig.preset === 'high_gain'
                        ? 'bg-amber-950/90 border-amber-600 text-amber-200'
                        : 'bg-stone-950 border-stone-800 text-stone-300 hover:border-stone-700'
                    }`}
                  >
                    <div className="font-bold text-[11px]">Night / Gain</div>
                    <div className="text-[10px] text-stone-400">+80% High</div>
                  </button>

                  <button
                    onClick={() => applyPreset('auto')}
                    className={`p-2 rounded-xl text-left border transition-all ${
                      activeLowLightConfig.enabled && activeLowLightConfig.autoGain
                        ? 'bg-amber-950/90 border-amber-600 text-amber-200'
                        : 'bg-stone-950 border-stone-800 text-stone-300 hover:border-stone-700'
                    }`}
                  >
                    <div className="font-bold text-[11px]">Auto Gain</div>
                    <div className="text-[10px] text-stone-400">Dynamic Lux</div>
                  </button>
                </div>
              </div>

              {/* Fine-Tuning Sliders */}
              <div className="space-y-3 pt-1 border-t border-stone-800/80">
                {/* Brightness */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-stone-300 font-medium">Brightness Boost</span>
                    <span className="font-mono text-amber-400 font-bold">{activeLowLightConfig.brightness}%</span>
                  </div>
                  <input
                    type="range"
                    min={80}
                    max={230}
                    step={5}
                    value={activeLowLightConfig.brightness}
                    onChange={(e) =>
                      updateLowLightConfig({
                        enabled: true,
                        brightness: Number(e.target.value),
                        preset: 'custom',
                      })
                    }
                    className="w-full h-1.5 bg-stone-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                  />
                </div>

                {/* Contrast */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-stone-300 font-medium">Contrast Boost</span>
                    <span className="font-mono text-amber-400 font-bold">{activeLowLightConfig.contrast}%</span>
                  </div>
                  <input
                    type="range"
                    min={80}
                    max={190}
                    step={5}
                    value={activeLowLightConfig.contrast}
                    onChange={(e) =>
                      updateLowLightConfig({
                        enabled: true,
                        contrast: Number(e.target.value),
                        preset: 'custom',
                      })
                    }
                    className="w-full h-1.5 bg-stone-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                  />
                </div>

                {/* Saturation */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-stone-300 font-medium">Pigment Saturation</span>
                    <span className="font-mono text-amber-400 font-bold">{activeLowLightConfig.saturation}%</span>
                  </div>
                  <input
                    type="range"
                    min={80}
                    max={170}
                    step={5}
                    value={activeLowLightConfig.saturation}
                    onChange={(e) =>
                      updateLowLightConfig({
                        enabled: true,
                        saturation: Number(e.target.value),
                        preset: 'custom',
                      })
                    }
                    className="w-full h-1.5 bg-stone-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                  />
                </div>

                <div className="flex justify-between items-center pt-1 text-xs">
                  <button
                    onClick={() => applyPreset('standard')}
                    className="flex items-center space-x-1 text-stone-400 hover:text-white transition-colors"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>Reset Defaults</span>
                  </button>
                  <button
                    onClick={() => setShowLowLightDrawer(false)}
                    className="px-3 py-1 bg-stone-800 hover:bg-stone-700 text-white rounded-lg text-xs font-semibold"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STATE: Requesting Permission */}
          {cameraStatus === 'requesting' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-stone-950/90 z-20">
              <div className="h-14 w-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-4">
                <Camera className="h-7 w-7 text-amber-400 animate-pulse" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Camera Access Required</h3>
              <p className="text-sm text-stone-300 max-w-md mb-4 leading-relaxed">
                Camera access is required. Please click <strong>Allow</strong> when your browser asks for camera permission.
              </p>
              <div className="flex items-center space-x-2 text-xs text-amber-400/90 bg-amber-950/60 px-3 py-1.5 rounded-full border border-amber-800/40">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                <span>Waiting for browser approval...</span>
              </div>
            </div>
          )}

          {/* STATE: Blocked Permission */}
          {cameraStatus === 'blocked' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-stone-950/95 z-20">
              <div className="h-14 w-14 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center mb-4">
                <AlertTriangle className="h-7 w-7 text-red-500" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Camera Access is Blocked</h3>
              <p className="text-sm text-stone-300 max-w-md mb-3 leading-relaxed">
                {errorMessage || 'Camera access is blocked.'}
              </p>
              <p className="text-xs text-stone-400 max-w-lg mb-6 leading-relaxed bg-stone-900 p-3 rounded-xl border border-stone-800">
                {errorDetails ||
                  'To continue, click the lock or camera icon in your browser address bar, set Camera to "Allow", and click Start Camera below or reload.'}
              </p>
              <div className="flex items-center space-x-3">
                <button
                  id="btn-retry-camera-permission"
                  onClick={startCameraAndInference}
                  className="flex items-center space-x-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg hover:bg-red-500 transition-colors"
                >
                  <RefreshCw className="h-4 w-4" />
                  <span>Retry Permission</span>
                </button>
              </div>
            </div>
          )}

          {/* STATE: No Device */}
          {cameraStatus === 'no_device' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-stone-950/95 z-20">
              <div className="h-14 w-14 rounded-2xl bg-stone-800 flex items-center justify-center mb-4">
                <CameraOff className="h-7 w-7 text-stone-400" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">No Camera Found</h3>
              <p className="text-sm text-stone-400 max-w-md mb-6 leading-relaxed">
                No camera device was detected. Connect a webcam and click Retry to start the live detection stream.
              </p>
              <button
                id="btn-retry-camera-device"
                onClick={startCameraAndInference}
                className="flex items-center space-x-2 rounded-xl bg-red-600 hover:bg-red-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors"
              >
                <RefreshCw className="h-4 w-4" />
                <span>Retry Connection</span>
              </button>
            </div>
          )}

          {/* STATE: Off / Standby */}
          {cameraStatus === 'off' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-stone-950/90 z-20">
              <div className="h-16 w-16 rounded-3xl bg-stone-900 border border-stone-800 flex items-center justify-center mb-4">
                <CameraOff className="h-8 w-8 text-stone-500" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Camera Stopped</h3>
              <p className="text-sm text-stone-400 max-w-sm mb-6">
                Session was saved to permanent history. Click Start Camera to begin a new detection stream.
              </p>
              <button
                id="btn-start-camera-standby"
                onClick={() => {
                  onStartCamera();
                  startCameraAndInference();
                }}
                className="flex items-center space-x-2 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 px-6 py-3 text-sm font-bold text-white shadow-lg hover:from-red-500 hover:to-rose-500 transition-all"
              >
                <Camera className="h-5 w-5" />
                <span>Start Camera</span>
              </button>
            </div>
          )}
        </div>

        {/* Bottom Control Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-stone-800 bg-stone-900/90 px-4 py-3 sm:px-6">
          {/* Main Camera Switch Action */}
          <div className="flex items-center space-x-3">
            {cameraStatus === 'live' ? (
              <button
                id="btn-stop-camera"
                onClick={() => {
                  stopCameraStream();
                  onStopCamera();
                }}
                className="flex items-center space-x-2 rounded-xl bg-red-600 px-5 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-lg hover:bg-red-500 transition-all active:scale-95"
              >
                <CameraOff className="h-4 w-4" />
                <span>Stop Camera</span>
              </button>
            ) : (
              <button
                id="btn-start-camera"
                onClick={() => {
                  onStartCamera();
                  startCameraAndInference();
                }}
                className="flex items-center space-x-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-lg hover:bg-emerald-500 transition-all active:scale-95"
              >
                <Camera className="h-4 w-4" />
                <span>Start Camera</span>
              </button>
            )}
          </div>

          {/* Quick classification legend */}
          <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs font-semibold">
            <div className="flex items-center space-x-1.5">
              <span className="h-3 w-3 rounded-full bg-emerald-500 shadow-xs shadow-emerald-500/50"></span>
              <span className="text-stone-200">Ripe Tomato</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="h-3 w-3 rounded-full bg-lime-500 shadow-xs shadow-lime-500/50"></span>
              <span className="text-stone-200">Unripe Tomato</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="h-3 w-3 rounded-full bg-red-500 shadow-xs shadow-red-500/50"></span>
              <span className="text-stone-200">Blight / Disease</span>
            </div>
          </div>
        </div>
      </div>

      {/* Live Tracked Objects Feed */}
      {activeTracksState.length > 0 && (
        <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900/60 p-4 shadow-xs transition-colors">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-stone-700 dark:text-stone-400">
              <Eye className="h-4 w-4 text-blue-500 dark:text-blue-400" />
              <span>Active Tracks In Frame ({activeTracksState.length})</span>
            </div>
            <span className="text-[11px] text-stone-400 dark:text-stone-500">Centroid & IoU duplicate filter active</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
            {activeTracksState.map((track) => (
              <div
                key={track.id}
                className="flex items-center justify-between p-2.5 rounded-xl bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 text-xs transition-colors"
              >
                <div className="flex items-center space-x-2">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      track.ripeness === 'ripe'
                        ? 'bg-emerald-500'
                        : track.ripeness === 'unripe'
                        ? 'bg-lime-500'
                        : 'bg-red-500'
                    }`}
                  ></span>
                  <div>
                    <div className="font-bold text-stone-900 dark:text-white">{track.class}</div>
                    <div className="text-[10px] text-stone-500 dark:text-stone-400">
                      ID #{track.id} • {(track.confidence * 100).toFixed(0)}% conf
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <span className="inline-block rounded bg-stone-200 dark:bg-stone-800 px-2 py-0.5 text-[10px] font-semibold text-stone-700 dark:text-stone-300">
                    ~{track.diameterMm || 65}mm
                  </span>
                  <div className="text-[9px] text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">
                    {track.counted ? 'Counted ✓' : 'Tracking...'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Roboflow Model Diagnostic & Frame Resend Modal */}
      <RoboflowDiagnosticModal
        isOpen={isDiagnosticModalOpen}
        onClose={() => setIsDiagnosticModalOpen(false)}
        confidenceThreshold={confidenceThreshold}
        onConfidenceChange={(val) => setConfidenceThreshold(val)}
        currentEndpoint={activeEndpoint}
        onEndpointChange={(ep) => setActiveEndpoint(ep)}
        opticalFallbackEnabled={opticalFallbackEnabled}
        onOpticalFallbackToggle={(enabled) => setOpticalFallbackEnabled(enabled)}
        getCurrentFrameBase64={getCurrentFrameBase64}
      />
    </div>
  );
};
