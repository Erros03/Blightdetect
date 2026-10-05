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
  ExternalLink,
  Play,
  Tv,
  Settings,
  ChevronDown,
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

  const [feedSource, setFeedSource] = useState<'camera' | 'simulation'>('camera');
  const feedSourceRef = useRef<'camera' | 'simulation'>('camera');
  feedSourceRef.current = feedSource;

  const simCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const simAnimIdRef = useRef<number | null>(null);
  const simOffsetRef = useRef<number>(0);
  const simTomatoesRef = useRef<
    Array<{
      id: number;
      x: number;
      y: number;
      radius: number;
      speed: number;
      type: 'ripe' | 'unripe' | 'early_blight' | 'late_blight';
    }>
  >([
    { id: 1, x: 120, y: 240, radius: 48, speed: 2.2, type: 'ripe' },
    { id: 2, x: 320, y: 232, radius: 45, speed: 2.2, type: 'early_blight' },
    { id: 3, x: 510, y: 246, radius: 44, speed: 2.2, type: 'unripe' },
    { id: 4, x: -80, y: 236, radius: 47, speed: 2.2, type: 'late_blight' },
    { id: 5, x: -280, y: 240, radius: 46, speed: 2.2, type: 'ripe' },
  ]);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [confidenceThreshold, setConfidenceThreshold] = useState<number>(0.95); // Strictly fixed at 95% for defense panel automated sorting
  const confidenceThresholdRef = useRef<number>(0.95);
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

  // YOLOv11 Model Architecture Backend State (Cloud vs Local Edge Pipeline)
  const [modelBackend, setModelBackend] = useState<'yolov11_roboflow' | 'local_yolov11_onnx'>('yolov11_roboflow');
  const [edgeStatus, setEdgeStatus] = useState<{
    online: boolean;
    localEngineReachable: boolean;
    lastHeartbeat: number;
    probeLatencyMs: number;
    bufferedCount: number;
  }>({
    online: false,
    localEngineReachable: false,
    lastHeartbeat: 0,
    probeLatencyMs: -1,
    bufferedCount: 0,
  });
  const seenEdgeTracksRef = useRef<Set<number>>(new Set());

  // Check initial backend configuration
  useEffect(() => {
    fetch('/api/model/config')
      .then((res) => res.json())
      .then((data) => {
        if (data.activeBackend && (data.activeBackend === 'yolov11_roboflow' || data.activeBackend === 'local_yolov11_onnx')) {
          setModelBackend(data.activeBackend);
        }
      })
      .catch(() => {});
  }, []);

  const switchModelBackend = async (backend: 'yolov11_roboflow' | 'local_yolov11_onnx') => {
    setModelBackend(backend);
    try {
      await fetch('/api/model/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backend }),
      });
    } catch (e) {
      console.warn('Could not switch model backend:', e);
    }
  };

  // Poll edge status & ingest real-time edge telemetry streamed from blightdetect_yolo11.py
  useEffect(() => {
    const pollEdgeStatus = async () => {
      try {
        const res = await fetch('/api/edge/status');
        if (res.ok) {
          const data = await res.json();
          setEdgeStatus({
            online: Boolean(data.edgeScriptRunning),
            localEngineReachable: Boolean(data.localEngineReachable),
            lastHeartbeat: data.lastHeartbeat || 0,
            probeLatencyMs: data.probeLatencyMs || -1,
            bufferedCount: data.bufferedCount || 0,
          });
        }

        // When in local edge mode, sync latest incoming detection records from the edge python script
        if (modelBackend === 'local_yolov11_onnx') {
          const latestRes = await fetch('/api/edge/latest');
          if (latestRes.ok) {
            const latestData = await latestRes.json();
            const items = latestData.detections || [];
            for (const item of items) {
              if (!seenEdgeTracksRef.current.has(item.track_id)) {
                seenEdgeTracksRef.current.add(item.track_id);
                onTomatoCounted({
                  id: `edge-${item.timestamp}-${item.track_id}`,
                  sessionId,
                  timestamp: item.timestamp,
                  createdAt: item.created_at,
                  class: item.raw_class,
                  ripeness: item.ripeness,
                  confidence: item.confidence_percentage,
                  size: (item.size_category || 'medium') as any,
                  diameterMm: item.diameter_mm,
                  bbox: item.bbox || { x: 320, y: 240, width: 140, height: 140 },
                  trackId: item.track_id,
                  blightType: item.blight_type as any,
                  severity: item.severity as any,
                  sortingAction: item.sorting_action as any,
                  qualityGrade: item.quality_grade as any,
                });
              }
            }
          }
        }
      } catch (e) {
        // Silent error in background polling
      }
    };

    pollEdgeStatus();
    const interval = setInterval(pollEdgeStatus, 2500);
    return () => clearInterval(interval);
  }, [sessionId, onTomatoCounted, modelBackend]);

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

  // Draw realistic animated conveyor belt with moving tomatoes for simulation mode
  const drawSimulationFrame = useCallback(() => {
    const canvas = simCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width || 640;
    const h = canvas.height || 480;

    // 1. Clear background
    ctx.fillStyle = '#1c1917';
    ctx.fillRect(0, 0, w, h);

    // 2. Conveyor Belt
    const beltTop = 130;
    const beltBottom = 350;
    const beltHeight = beltBottom - beltTop;

    ctx.fillStyle = '#292524';
    ctx.fillRect(0, beltTop, w, beltHeight);

    // Guide rails
    ctx.fillStyle = '#44403c';
    ctx.fillRect(0, beltTop - 12, w, 12);
    ctx.fillRect(0, beltBottom, w, 12);

    // Moving hazard stripes on top rail
    const stripeW = 20;
    simOffsetRef.current = (simOffsetRef.current + 2.2) % (stripeW * 2);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, beltTop - 12, w, 12);
    ctx.clip();
    for (let x = -stripeW * 2 + (simOffsetRef.current % (stripeW * 2)); x < w + stripeW * 2; x += stripeW * 2) {
      ctx.fillStyle = '#eab308';
      ctx.beginPath();
      ctx.moveTo(x, beltTop);
      ctx.lineTo(x + stripeW, beltTop - 12);
      ctx.lineTo(x + stripeW * 1.5, beltTop - 12);
      ctx.lineTo(x + stripeW * 0.5, beltTop);
      ctx.fill();
    }
    ctx.restore();

    // Moving belt slats
    ctx.strokeStyle = '#383431';
    ctx.lineWidth = 2;
    const slatSpacing = 40;
    const slatOffset = simOffsetRef.current % slatSpacing;
    for (let sx = -slatSpacing + slatOffset; sx < w + slatSpacing; sx += slatSpacing) {
      ctx.beginPath();
      ctx.moveTo(sx, beltTop);
      ctx.lineTo(sx, beltBottom);
      ctx.stroke();
    }

    // Overhead light cone
    const lightGrad = ctx.createRadialGradient(w / 2, (beltTop + beltBottom) / 2, 40, w / 2, (beltTop + beltBottom) / 2, 280);
    lightGrad.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
    lightGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = lightGrad;
    ctx.fillRect(0, beltTop, w, beltHeight);

    // 3. Render and update each tomato
    simTomatoesRef.current.forEach((t) => {
      t.x += t.speed;
      if (t.x > w + t.radius + 40) {
        const minX = Math.min(...simTomatoesRef.current.map((o) => o.x));
        t.x = Math.min(-60, minX - 160);
        t.y = 230 + (Math.random() * 20 - 10);
        const types: Array<'ripe' | 'unripe' | 'early_blight' | 'late_blight'> = [
          'ripe',
          'early_blight',
          'ripe',
          'late_blight',
          'unripe',
        ];
        t.type = types[Math.floor(Math.random() * types.length)];
      }

      ctx.save();
      // Drop shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.beginPath();
      ctx.ellipse(t.x, t.y + t.radius * 0.75, t.radius * 0.85, t.radius * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();

      // Tomato body
      const tomatoGrad = ctx.createRadialGradient(
        t.x - t.radius * 0.3,
        t.y - t.radius * 0.3,
        t.radius * 0.1,
        t.x,
        t.y,
        t.radius
      );

      if (t.type === 'unripe') {
        tomatoGrad.addColorStop(0, '#a3e635');
        tomatoGrad.addColorStop(0.6, '#65a30d');
        tomatoGrad.addColorStop(1, '#3f6212');
      } else {
        tomatoGrad.addColorStop(0, '#f87171');
        tomatoGrad.addColorStop(0.55, '#dc2626');
        tomatoGrad.addColorStop(1, '#991b1b');
      }

      ctx.fillStyle = tomatoGrad;
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.radius, 0, Math.PI * 2);
      ctx.fill();

      // Specific lesions
      if (t.type === 'early_blight') {
        const lesionX = t.x + t.radius * 0.2;
        const lesionY = t.y - t.radius * 0.1;
        const lesionR = t.radius * 0.38;

        ctx.fillStyle = '#451a03';
        ctx.beginPath();
        ctx.arc(lesionX, lesionY, lesionR, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#1c1917';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(lesionX, lesionY, lesionR * 0.65, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#0c0a09';
        ctx.beginPath();
        ctx.arc(lesionX, lesionY, lesionR * 0.32, 0, Math.PI * 2);
        ctx.fill();
      } else if (t.type === 'late_blight') {
        const rotX = t.x - t.radius * 0.15;
        const rotY = t.y + t.radius * 0.1;
        ctx.fillStyle = '#1c1917';
        ctx.beginPath();
        ctx.ellipse(rotX, rotY, t.radius * 0.45, t.radius * 0.35, Math.PI / 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#292524';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }

      // Specular reflection
      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.beginPath();
      ctx.ellipse(t.x - t.radius * 0.32, t.y - t.radius * 0.35, t.radius * 0.22, t.radius * 0.12, -Math.PI / 4, 0, Math.PI * 2);
      ctx.fill();

      // Calyx stem
      ctx.fillStyle = '#15803d';
      ctx.beginPath();
      const calyxX = t.x;
      const calyxY = t.y - t.radius * 0.85;
      const starR = t.radius * 0.28;
      for (let i = 0; i < 5; i++) {
        const angle = (i * Math.PI * 2) / 5 - Math.PI / 2;
        const outerX = calyxX + Math.cos(angle) * starR;
        const outerY = calyxY + Math.sin(angle) * starR;
        if (i === 0) ctx.moveTo(outerX, outerY);
        else ctx.lineTo(outerX, outerY);
        const innerAngle = angle + Math.PI / 5;
        const innerX = calyxX + Math.cos(innerAngle) * (starR * 0.4);
        const innerY = calyxY + Math.sin(innerAngle) * (starR * 0.4);
        ctx.lineTo(innerX, innerY);
      }
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    });
  }, []);

  const startSimulationCanvasAnimation = useCallback(() => {
    if (simAnimIdRef.current) {
      cancelAnimationFrame(simAnimIdRef.current);
      simAnimIdRef.current = null;
    }
    const loop = () => {
      drawSimulationFrame();
      simAnimIdRef.current = requestAnimationFrame(loop);
    };
    simAnimIdRef.current = requestAnimationFrame(loop);
  }, [drawSimulationFrame]);

  const stopSimulationStream = useCallback(() => {
    if (simAnimIdRef.current) {
      cancelAnimationFrame(simAnimIdRef.current);
      simAnimIdRef.current = null;
    }
  }, []);

  // Stop camera stream and cleanup
  const stopCameraStream = useCallback(() => {
    isLoopRunningRef.current = false;
    isStartedRef.current = false;

    stopSimulationStream();

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
  }, [setCameraStatus, stopSimulationStream]);

  // Main continuous inference loop
  const runInferenceLoop = useCallback(async () => {
    if (!isLoopRunningRef.current) return;

    const isSim = feedSourceRef.current === 'simulation';
    const video = videoRef.current;
    const simCanvas = simCanvasRef.current;

    let sourceEl: CanvasImageSource | null = null;
    let vw = 640;
    let vh = 480;

    if (isSim) {
      if (!simCanvas) {
        if (isLoopRunningRef.current) {
          animFrameIdRef.current = requestAnimationFrame(runInferenceLoop);
        }
        return;
      }
      sourceEl = simCanvas;
      vw = simCanvas.width || 640;
      vh = simCanvas.height || 480;
    } else {
      if (!video || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
        // Wait for video frame to be ready
        if (isLoopRunningRef.current) {
          animFrameIdRef.current = requestAnimationFrame(() => {
            runInferenceLoop();
          });
        }
        return;
      }
      sourceEl = video;
      vw = video.videoWidth;
      vh = video.videoHeight;
    }

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

    // Draw current camera or simulation frame to capture buffer with programmatic enhancement
    offCtx.drawImage(sourceEl, 0, 0, targetWidth, targetHeight);

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

        // Automatically dispatch size sorting signal to physical Arduino actuator
        arduinoSerial.handleDetectionEvent(evt.size, evt.ripeness, evt.confidence);
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

      // Secondary HUD Badge: Calibrated Commercial Slicing Sizing (60-75mm / 110-170g)
      const sizeMm = track.diameterMm || Math.round(((w + h) / 2) * 0.35);
      const sizeCat = sizeMm < 60 ? 'Small' : sizeMm <= 75 ? 'Medium' : 'Large';
      const weightG =
        track.weightGrams ||
        (sizeCat === 'Small'
          ? Math.round(40 + Math.max(0, (sizeMm - 25) / 34) * 69)
          : sizeCat === 'Medium'
          ? Math.round(110 + ((sizeMm - 60) / 15) * 60)
          : Math.round(171 + Math.min(1, (sizeMm - 75) / 45) * 109));
      const action = track.sortingAction || (confidence < 0.95 ? 'MANUAL_REVIEW' : ripeness === 'blight' ? 'REJECT_QUARANTINE' : 'ACCEPT');
      const grade = track.qualityGrade || (ripeness === 'blight' ? 'Grade C' : confidence >= 0.95 ? 'Grade A' : 'Grade B');

      const subTagText = `${sizeMm}mm (${sizeCat} • ${weightG}g) • ${grade} • ${action}`;
      ctx.font = 'bold 10px monospace';
      const subMetrics = ctx.measureText(subTagText);
      const subWidth = subMetrics.width + 12;
      const subHeight = 18;
      const subY = Math.min(vh - 22, y + h + 4);

      let subBadgeColor = 'rgba(5, 150, 105, 0.92)'; // Emerald for ACCEPT
      if (action === 'REJECT_QUARANTINE') {
        subBadgeColor = 'rgba(220, 38, 38, 0.92)'; // Red for REJECT
      } else if (action === 'MANUAL_REVIEW') {
        subBadgeColor = 'rgba(217, 119, 6, 0.92)'; // Amber for REVIEW (<95% conf)
      }

      ctx.fillStyle = subBadgeColor;
      ctx.beginPath();
      ctx.roundRect(x, subY, subWidth, subHeight, 4);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.fillText(subTagText, x + 6, subY + 13);

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

  // Start Simulation Feed with animated conveyor belt & tomatoes
  const startSimulationStream = useCallback(() => {
    // Stop camera stream tracks if active
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

    setFeedSource('simulation');
    feedSourceRef.current = 'simulation';
    setCameraStatus('live');
    setErrorMessage(null);
    setErrorDetails(null);
    isStartedRef.current = true;
    isLoopRunningRef.current = true;

    // Start drawing moving tomatoes onto simCanvas
    startSimulationCanvasAnimation();

    // Start vision inference loop on canvas frames
    animFrameIdRef.current = requestAnimationFrame(() => {
      runInferenceLoop();
    });
  }, [runInferenceLoop, setCameraStatus, startSimulationCanvasAnimation]);

  // Start Camera & Permission Flow
  const startCameraAndInference = useCallback(async () => {
    if (isStartedRef.current && feedSourceRef.current === 'camera') return;

    // Stop simulation if running
    stopSimulationStream();

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

    setFeedSource('camera');
    feedSourceRef.current = 'camera';
    setErrorMessage(null);
    setErrorDetails(null);
    setCameraStatus('requesting');

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraStatus('error');
      setErrorMessage('Browser MediaDevices API is not supported in this browser.');
      return;
    }

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'environment', // Prefer back camera on mobile
          },
          audio: false,
        });
      } catch (highResErr) {
        const highResError = highResErr as { name?: string };
        if (highResError.name === 'OverconstrainedError' || highResError.name === 'TypeError') {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        } else {
          throw highResErr;
        }
      }

      streamRef.current = stream;
      isStartedRef.current = true;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current
            ?.play()
            .then(() => {
              setCameraStatus('live');
              isLoopRunningRef.current = true;
              runInferenceLoop();
            })
            .catch((playErr) => {
              console.warn('Video play warning:', playErr);
            });
        };
      }
    } catch (err: unknown) {
      isStartedRef.current = false;
      const error = err as { name?: string; message?: string };
      console.warn('Camera access request status:', error?.name || error?.message || error);

      if (
        error.name === 'NotAllowedError' ||
        error.name === 'PermissionDeniedError' ||
        (error.message && error.message.includes('Permission denied'))
      ) {
        setCameraStatus('blocked');
        setErrorMessage('Camera access was denied or is restricted in this browser frame.');
        setErrorDetails(
          'Webcam access requires browser permission. You can enable camera permission in your address bar, open the app in a new tab, or switch immediately to the interactive Conveyor Simulation feed.'
        );
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        setCameraStatus('no_device');
        setErrorMessage('No physical camera device was detected on this system.');
        setErrorDetails('Connect a webcam and click Retry, or launch the Conveyor Simulation feed.');
      } else if (error.name === 'SecurityError') {
        setCameraStatus('error');
        setErrorMessage('Camera access was blocked due to iframe security policy.');
        setErrorDetails('Open this app in a standalone tab or launch the Conveyor Simulation feed.');
      } else {
        setCameraStatus('error');
        setErrorMessage(`Camera initialization notice: ${error.message || 'Unavailable'}`);
      }
    }
  }, [setCameraStatus, runInferenceLoop, stopSimulationStream]);

  // Auto-start camera when mounted in Live Stream; if restricted, it gracefully falls back to prompt
  useEffect(() => {
    startCameraAndInference().catch((err) => {
      console.warn('Camera initial check:', err);
    });

    return () => {
      stopCameraStream();
    };
  }, [startCameraAndInference, stopCameraStream]);

  // Capture current frame for Roboflow testing & diagnostics
  const getCurrentFrameBase64 = useCallback((): string | null => {
    if (feedSourceRef.current === 'simulation') {
      const canvas = simCanvasRef.current;
      if (!canvas) return null;
      return canvas.toDataURL('image/jpeg', 0.85);
    }

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
        {/* Stream Top Header Bar - Clean and Uncluttered */}
        <div className="flex items-center justify-between gap-3 border-b border-stone-800 bg-stone-900/90 px-4 py-2.5 sm:px-6">
          <div className="flex items-center space-x-3">
            {cameraStatus === 'live' ? (
              <div className="flex items-center space-x-2.5">
                {/* LIVE Badge */}
                <span className="flex items-center space-x-1.5 rounded-full bg-red-950/80 px-2.5 py-0.5 text-xs font-semibold text-red-400 border border-red-800/60">
                  <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse"></span>
                  <span>LIVE</span>
                </span>

                {/* Feed Source Mode Indicator */}
                <span
                  id="header-feed-source-badge"
                  className="inline-flex items-center space-x-1 text-xs text-stone-400"
                >
                  {feedSource === 'simulation' ? (
                    <>
                      <Tv className="h-3.5 w-3.5 text-amber-400" />
                      <span>Conveyor Simulation</span>
                    </>
                  ) : (
                    <>
                      <Camera className="h-3.5 w-3.5 text-stone-400" />
                      <span>Webcam Feed</span>
                    </>
                  )}
                </span>
              </div>
            ) : (
              <span className="flex items-center space-x-2 text-xs font-medium text-stone-400">
                <CameraOff className="h-3.5 w-3.5 text-stone-500" />
                <span>Standby</span>
              </span>
            )}
          </div>

          {/* Right Toolbar Controls: Clean and Unified */}
          <div className="flex items-center space-x-2 text-xs">
            {/* Low-Light Toggle */}
            <button
              id="btn-toggle-low-light"
              onClick={() => updateLowLightConfig((prev) => ({ ...prev, enabled: !prev.enabled }))}
              className={`flex items-center space-x-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                activeLowLightConfig.enabled
                  ? 'bg-amber-950/80 text-amber-300 border border-amber-700/80'
                  : 'bg-stone-800/80 text-stone-400 hover:text-stone-200 border border-stone-700/60'
              }`}
              title="Toggle Low-Light enhancement filter"
            >
              <Moon className={`h-3.5 w-3.5 ${activeLowLightConfig.enabled ? 'text-amber-400 fill-amber-400/30' : 'text-stone-400'}`} />
              <span className="hidden sm:inline">Low-Light</span>
              <span className="text-[10px] font-bold">
                {activeLowLightConfig.enabled ? 'ON' : 'OFF'}
              </span>
            </button>
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
            </div>
          )}

          {/* Native HTML5 Video for Webcam Stream */}
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
            className={`h-full w-full object-contain ${cameraStatus === 'live' && feedSource === 'camera' ? 'block' : 'hidden'}`}
          />

          {/* Realistic Conveyor Simulation Canvas */}
          <canvas
            ref={simCanvasRef}
            width={640}
            height={480}
            className={`h-full w-full object-contain ${cameraStatus === 'live' && feedSource === 'simulation' ? 'block' : 'hidden'}`}
          />

          {/* Real-time Bounding Box & HUD Canvas Overlay */}
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
                    <div className="text-[10px] text-stone-400">Boosts brightness & contrast for YOLOv11</div>
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
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-stone-950/95 z-20 overflow-y-auto">
              <div className="h-14 w-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-3">
                <ShieldAlert className="h-7 w-7 text-amber-400" />
              </div>
              <h3 className="text-lg font-bold text-white mb-1.5">Camera Access Restricted</h3>
              <p className="text-sm text-stone-300 max-w-lg mb-4 leading-relaxed">
                Browser privacy restrictions or iframe sandboxing prevented access to the local webcam device.
              </p>

              {/* Primary Action Callouts */}
              <div className="flex flex-col sm:flex-row items-center gap-3 mb-5 w-full max-w-md justify-center">
                {/* 1. Launch conveyor simulation */}
                <button
                  id="btn-launch-conveyor-sim"
                  onClick={startSimulationStream}
                  className="w-full sm:w-auto flex items-center justify-center space-x-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg transition-all active:scale-95"
                >
                  <Play className="h-4 w-4 fill-white" />
                  <span>Run Conveyor Simulation</span>
                </button>

                {/* 2. Retry permission */}
                <button
                  id="btn-retry-camera-permission"
                  onClick={startCameraAndInference}
                  className="w-full sm:w-auto flex items-center justify-center space-x-2 rounded-xl bg-stone-800 hover:bg-stone-700 px-4 py-2.5 text-sm font-semibold text-stone-200 border border-stone-700 transition-colors"
                >
                  <RefreshCw className="h-4 w-4 text-stone-400" />
                  <span>Retry Camera</span>
                </button>

                {/* 3. Open in new window if in iframe */}
                <button
                  id="btn-open-standalone-tab"
                  onClick={() => {
                    try {
                      window.open(window.location.href, '_blank');
                    } catch (e) {
                      console.warn('Could not open new window:', e);
                    }
                  }}
                  className="w-full sm:w-auto flex items-center justify-center space-x-1.5 rounded-xl bg-stone-800/60 hover:bg-stone-800 px-3.5 py-2.5 text-xs font-semibold text-stone-300 border border-stone-750 transition-colors"
                  title="Open application in a direct standalone window to request native browser camera permissions"
                >
                  <ExternalLink className="h-3.5 w-3.5 text-stone-400" />
                  <span>Standalone Tab</span>
                </button>
              </div>

              {/* Step by step browser permissions helper */}
              <div className="text-left text-xs text-stone-400 max-w-lg bg-stone-900/90 p-3.5 rounded-xl border border-stone-800 space-y-1.5">
                <div className="font-bold text-stone-300 flex items-center space-x-1.5 mb-1">
                  <span>How to enable your webcam:</span>
                </div>
                <div className="flex items-start space-x-2">
                  <span className="font-mono text-amber-400 font-bold">1.</span>
                  <span>Click the tune / lock or camera icon in your browser address bar.</span>
                </div>
                <div className="flex items-start space-x-2">
                  <span className="font-mono text-amber-400 font-bold">2.</span>
                  <span>Set <strong>Camera</strong> to <strong>Allow</strong>.</span>
                </div>
                <div className="flex items-start space-x-2">
                  <span className="font-mono text-amber-400 font-bold">3.</span>
                  <span>Click <strong>Retry Camera</strong> above, or click <strong>Run Conveyor Simulation</strong> to test sorting immediately without camera hardware.</span>
                </div>
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
                No camera device was detected on your device. Connect a webcam or test with our animated conveyor simulation.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  id="btn-no-device-sim"
                  onClick={startSimulationStream}
                  className="flex items-center space-x-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-5 py-2.5 text-sm font-bold text-white transition-colors"
                >
                  <Play className="h-4 w-4 fill-white" />
                  <span>Run Conveyor Simulation</span>
                </button>
                <button
                  id="btn-retry-camera-device"
                  onClick={startCameraAndInference}
                  className="flex items-center space-x-2 rounded-xl bg-stone-800 hover:bg-stone-700 px-4 py-2.5 text-sm font-semibold text-stone-200 border border-stone-700 transition-colors"
                >
                  <RefreshCw className="h-4 w-4" />
                  <span>Retry Connection</span>
                </button>
              </div>
            </div>
          )}

          {/* STATE: Off / Standby */}
          {cameraStatus === 'off' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-stone-950/90 z-20">
              <div className="h-16 w-16 rounded-3xl bg-stone-900 border border-stone-800 flex items-center justify-center mb-4">
                <CameraOff className="h-8 w-8 text-stone-500" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Vision Feed Standby</h3>
              <p className="text-sm text-stone-400 max-w-sm mb-6">
                Choose a feed source to begin real-time sorting and tomato detection.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  id="btn-start-camera-standby"
                  onClick={() => {
                    onStartCamera();
                    startCameraAndInference();
                  }}
                  className="flex items-center space-x-2 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg hover:from-red-500 hover:to-rose-500 transition-all"
                >
                  <Camera className="h-4 w-4" />
                  <span>Start Webcam</span>
                </button>
                <button
                  id="btn-start-sim-standby"
                  onClick={startSimulationStream}
                  className="flex items-center space-x-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg hover:bg-emerald-500 transition-all"
                >
                  <Play className="h-4 w-4 fill-white" />
                  <span>Conveyor Simulation</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Control Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-stone-800 bg-stone-900/90 px-4 py-3 sm:px-6">
          {/* Stream Control Actions */}
          <div className="flex flex-wrap items-center gap-2.5">
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
                <span>Stop Stream</span>
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
                <span>Start Webcam</span>
              </button>
            )}

            {/* Quick Switch to Simulation / Webcam */}
            <button
              id="btn-toggle-feed-source"
              onClick={() => {
                if (feedSource === 'simulation') {
                  startCameraAndInference();
                } else {
                  startSimulationStream();
                }
              }}
              className="flex items-center space-x-1.5 rounded-xl bg-stone-800 hover:bg-stone-750 px-3.5 py-2 text-xs font-bold text-stone-200 border border-stone-700 transition-colors"
              title="Toggle between physical webcam and simulated conveyor belt"
            >
              {feedSource === 'simulation' ? (
                <>
                  <Camera className="h-3.5 w-3.5 text-stone-300" />
                  <span>Switch to Webcam</span>
                </>
              ) : (
                <>
                  <Tv className="h-3.5 w-3.5 text-amber-400" />
                  <span>Switch to Conveyor Sim</span>
                </>
              )}
            </button>
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
    </div>
  );
};
