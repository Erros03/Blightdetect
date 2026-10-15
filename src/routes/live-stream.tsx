/**
 * Live Stream Route - Continuous Real-Time Tomato & Blight Detector
 */
import React, { useState, useEffect } from 'react';
import { RoboflowDetector } from '../components/RoboflowDetector.tsx';
import type {
  CameraStatus,
  TomatoSessionCounts,
  TomatoDetectionEvent,
  DetectionSession,
  LowLightFilterConfig,
} from '../types.ts';
import {
  Activity,
  ShieldAlert,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  AlertTriangle,
  Award,
  Usb,
  Send,
  AlertCircle,
  ExternalLink,
  Terminal,
  ChevronDown,
  ChevronUp,
  Trash2,
  HelpCircle,
  Play,
  Square,
  Pause,
  RotateCcw,
  Sliders,
  Eye,
  Zap,
} from 'lucide-react';
import {
  connectSerial,
  disconnectSerial,
  subscribeSerial,
  sendCommand,
  enableSimulationMode,
  isSerialSupported,
  isRunningInIframe,
  clearSerialLogs,
  startConveyor,
  stopConveyor,
  pauseConveyor,
  resumeConveyor,
  resetSystem,
  testServo,
  toggleMotorInversion,
  testMotorFwd,
  testMotorRev,
  type SerialStatus,
} from '../lib/arduino.ts';

interface LiveStreamRouteProps {
  session: DetectionSession | null;
  counts: TomatoSessionCounts;
  recentEvents: TomatoDetectionEvent[];
  cameraStatus: CameraStatus;
  setCameraStatus: (status: CameraStatus) => void;
  onTomatoCounted: (event: TomatoDetectionEvent) => void;
  onStopCamera: () => void;
  onStartCamera: () => void;
  onNavigate: (route: string) => void;
}

export const LiveStreamRoute: React.FC<LiveStreamRouteProps> = ({
  session,
  counts,
  recentEvents,
  cameraStatus,
  setCameraStatus,
  onTomatoCounted,
  onStopCamera,
  onStartCamera,
  onNavigate,
}) => {
  const [lowLightConfig, setLowLightConfig] = useState<LowLightFilterConfig>({
    enabled: false,
    brightness: 145,
    contrast: 135,
    saturation: 120,
    preset: 'standard',
    autoGain: false,
  });

  const [serialStatus, setSerialStatus] = useState<SerialStatus>({
    isConnected: false,
    isSimulated: false,
    lastCommand: null,
    error: null,
    logs: [],
  });
  const [isConnecting, setIsConnecting] = useState(false);
  const [testSent, setTestSent] = useState<string | null>(null);
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);

  const isInIframe = typeof window !== 'undefined' && window.self !== window.top;
  const supported = isSerialSupported();

  useEffect(() => {
    return subscribeSerial((status) => {
      setSerialStatus(status);
      if (status.isConnected && status.logs.length > 0) {
        setIsTerminalOpen(true);
      }
    });
  }, []);

  const handleToggleConnect = async () => {
    if (serialStatus.isConnected) {
      await disconnectSerial();
    } else {
      setIsConnecting(true);
      await connectSerial();
      setIsConnecting(false);
    }
  };

  const handleManualTest = async (cmd: string) => {
    setTestSent(cmd);
    await sendCommand(cmd);
    setTimeout(() => setTestSent(null), 1200);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 space-y-6">
      {/* Arduino Web Serial Status & Connection Toolbar */}
      <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors">
        <div className="flex items-center space-x-3">
          <div
            className={`p-2.5 rounded-xl ${
              serialStatus.isConnected
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
                : 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400'
            }`}
          >
            <Usb className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-sm font-bold text-stone-900 dark:text-white">
                Arduino USB Serial
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                  serialStatus.isConnected
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                    : 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400 border border-stone-200 dark:border-stone-700'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full mr-1.5 ${
                    serialStatus.isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-stone-400'
                  }`}
                />
                {serialStatus.isConnected
                  ? serialStatus.isSimulated
                    ? 'Simulated Serial'
                    : 'USB Connected (9600 Baud)'
                  : 'Disconnected'}
              </span>

              {/* Conveyor State Badge */}
              {serialStatus.isConnected && (
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                    serialStatus.conveyorState === 'RUNNING'
                      ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                      : serialStatus.conveyorState === 'SORTING_ACTIVE'
                      ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border-purple-300 dark:border-purple-700 animate-pulse'
                      : serialStatus.conveyorState === 'WAITING_POSITION'
                      ? 'bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border-blue-300 dark:border-blue-700'
                      : serialStatus.conveyorState === 'PAUSED'
                      ? 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-300 dark:border-amber-700'
                      : 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300 border-stone-200 dark:border-stone-700'
                  }`}
                >
                  Conveyor: {serialStatus.conveyorState}
                  {serialStatus.activeSortingArm && ` (${serialStatus.activeSortingArm})`}
                </span>
              )}

              {/* IR Sensor Trigger indicator */}
              {serialStatus.lastIrDetectedTime && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                  IR Beam: {serialStatus.lastIrDetectedTime}
                </span>
              )}
            </div>

            <div className="text-xs text-stone-500 dark:text-stone-400 mt-1 flex flex-wrap items-center gap-x-2">
              <span>Thesis Prototype:</span>
              <span className="font-mono text-[11px] text-stone-700 dark:text-stone-300">
                12V Motor (D5 PWM) • 6 Servos (D9/10/11/6/7/12) • IR (D2)
              </span>
              {serialStatus.lastCommand && (
                <span className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400 font-bold">
                  (TX: &apos;{serialStatus.lastCommand}&apos;)
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons & Manual Triggers */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Master Conveyor Motor Controls when connected */}
          {serialStatus.isConnected && (
            <div className="flex items-center space-x-1.5 border-r border-stone-200 dark:border-stone-800 pr-2 mr-1">
              <span className="text-[11px] text-stone-400 font-bold mr-0.5">Motor:</span>
              <button
                onClick={() => startConveyor()}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg flex items-center space-x-1 transition-all cursor-pointer ${
                  serialStatus.conveyorState === 'RUNNING'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-200 border border-emerald-300 dark:border-emerald-700'
                }`}
                title="Start 12V Conveyor Motor (START command)"
              >
                <Play className="h-3 w-3 fill-current" />
                <span>Start</span>
              </button>
              <button
                onClick={() => stopConveyor()}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg flex items-center space-x-1 transition-all cursor-pointer ${
                  serialStatus.conveyorState === 'STOPPED'
                    ? 'bg-red-600 text-white shadow-xs'
                    : 'bg-red-100 dark:bg-red-950/80 text-red-800 dark:text-red-300 hover:bg-red-200 border border-red-300 dark:border-red-700'
                }`}
                title="Stop Conveyor Motor (STOP command)"
              >
                <Square className="h-3 w-3 fill-current" />
                <span>Stop</span>
              </button>
              <button
                onClick={() => (serialStatus.conveyorState === 'PAUSED' ? resumeConveyor() : pauseConveyor())}
                className="px-2 py-1 text-xs rounded-lg bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-700 transition-all cursor-pointer"
                title="Pause/Resume Conveyor Motor"
              >
                <Pause className="h-3 w-3" />
              </button>
              <button
                onClick={() => resetSystem()}
                className="px-2 py-1 text-xs rounded-lg bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-700 transition-all cursor-pointer"
                title="Reset Conveyor and Servos to Home (RESET command)"
              >
                <RotateCcw className="h-3 w-3" />
              </button>
              <button
                onClick={() => toggleMotorInversion()}
                className={`px-2 py-1 text-[11px] font-mono rounded-lg border transition-all cursor-pointer flex items-center space-x-1 ${
                  serialStatus.isMotorInverted
                    ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700 font-bold'
                    : 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400 border-stone-200 dark:border-stone-700'
                }`}
                title={
                  serialStatus.isMotorInverted
                    ? 'Motor logic is INVERTED (Start ⮂ Stop swapped for Active-LOW / inverted driver). Click to toggle.'
                    : 'Motor logic is NORMAL. Click to invert.'
                }
              >
                <Zap className="h-3 w-3" />
                <span>{serialStatus.isMotorInverted ? 'Inverted' : 'Normal'}</span>
              </button>
              <button
                onClick={() => testMotorFwd()}
                className="px-2 py-1 text-[11px] font-mono rounded-lg bg-blue-100 dark:bg-blue-950/80 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-700 hover:bg-blue-200 transition-all cursor-pointer font-bold"
                title="Force Motor Forward at PWM 160 speed"
              >
                Fwd 160
              </button>
              <button
                onClick={() => testMotorRev()}
                className="px-2 py-1 text-[11px] font-mono rounded-lg bg-blue-100 dark:bg-blue-950/80 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-700 hover:bg-blue-200 transition-all cursor-pointer font-bold"
                title="Force Motor Reverse at PWM 160 speed"
              >
                Rev 160
              </button>
            </div>
          )}

          {/* Quick Manual Test Triggers for 4 Servos */}
          {serialStatus.isConnected && (
            <div className="flex items-center space-x-1 border-r border-stone-200 dark:border-stone-800 pr-2 mr-1">
              <span className="text-[11px] text-stone-400 mr-1">Servos:</span>
              {[
                { label: 'S1: Unripe (D9)', cmd: 'UNRIPE' },
                { label: 'S2: Small (D10)', cmd: 'SMALL' },
                { label: 'S3: Med (D11)', cmd: 'MEDIUM' },
                { label: 'S4: Large (D6)', cmd: 'LARGE' },
              ].map(({ label, cmd }) => (
                <button
                  key={cmd}
                  onClick={() => testServo(cmd)}
                  className={`px-1.5 py-1 text-[11px] font-mono rounded-lg border transition-all cursor-pointer ${
                    serialStatus.activeSortingArm?.includes(cmd)
                      ? 'bg-purple-600 text-white border-purple-600 scale-95 animate-pulse'
                      : 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300 border-stone-200 dark:border-stone-700 hover:bg-stone-200 dark:hover:bg-stone-700'
                  }`}
                  title={`Test ${label} servo arm diverter (TEST_${cmd} command)`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* Toggle Live Terminal */}
          <button
            onClick={() => setIsTerminalOpen(!isTerminalOpen)}
            className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer border ${
              isTerminalOpen
                ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 border-transparent'
                : 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300 border-stone-200 dark:border-stone-700 hover:bg-stone-200 dark:hover:bg-stone-700'
            }`}
            title="Toggle Live Serial RX/TX terminal feed"
          >
            <Terminal className="h-3.5 w-3.5 text-emerald-500" />
            <span>Terminal</span>
            {serialStatus.logs.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-mono">
                {serialStatus.logs.length}
              </span>
            )}
            {isTerminalOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>

          {/* If in iframe, offer 1-click standalone launch for USB permission */}
          {isInIframe && !serialStatus.isConnected && (
            <button
              onClick={() => window.open(window.location.href, '_blank')}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white flex items-center space-x-1.5 shadow-sm transition-all cursor-pointer"
              title="Open app in a top-level browser tab so Chrome grants full USB serial access"
            >
              <ExternalLink className="h-4 w-4" />
              <span>Launch Standalone Tab</span>
            </button>
          )}

          {/* Connect / Disconnect Button */}
          <button
            id="btn-connect-serial"
            onClick={handleToggleConnect}
            disabled={isConnecting}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer disabled:opacity-50 ${
              serialStatus.isConnected
                ? 'bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-950/60 dark:text-red-400 dark:hover:bg-red-950 border border-red-200 dark:border-red-900/60'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm'
            }`}
          >
            <Usb className="h-4 w-4" />
            <span>
              {isConnecting
                ? 'Requesting Port...'
                : serialStatus.isConnected
                ? serialStatus.isSimulated
                  ? 'Exit Simulation'
                  : 'Disconnect Arduino'
                : 'Connect Arduino (USB)'}
            </span>
          </button>
        </div>
      </div>

      {/* Collapsible Live Serial Monitor */}
      {isTerminalOpen && (
        <div className="rounded-2xl border border-stone-800 bg-stone-950 p-4 shadow-md font-mono text-xs text-stone-300 animate-fadeIn">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-stone-800">
            <div className="flex items-center space-x-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-bold text-white text-xs">Live Serial Monitor (9600 Baud)</span>
              <span className="text-[11px] text-stone-500">
                {serialStatus.isConnected ? (serialStatus.isSimulated ? '(Simulation Mode)' : '(Live USB Port)') : '(Offline)'}
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => clearSerialLogs()}
                className="px-2.5 py-1 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-400 hover:text-stone-200 text-[11px] flex items-center space-x-1 transition-colors cursor-pointer"
                title="Clear terminal log"
              >
                <Trash2 className="h-3 w-3" />
                <span>Clear</span>
              </button>
            </div>
          </div>

          <div className="max-h-48 overflow-y-auto space-y-1 text-[11px] scrollbar-thin">
            {serialStatus.logs.length === 0 ? (
              <div className="text-stone-500 py-3 text-center italic">
                No serial events logged yet. Click &apos;Connect Arduino&apos; or press test buttons above.
              </div>
            ) : (
              serialStatus.logs.map((log) => (
                <div key={log.id} className="flex items-start space-x-2 font-mono leading-relaxed">
                  <span className="text-stone-500 text-[10px] select-none shrink-0">{log.timestamp}</span>
                  <span
                    className={`px-1 rounded text-[10px] font-bold shrink-0 ${
                      log.type === 'tx'
                        ? 'bg-blue-950 text-blue-400 border border-blue-800/60'
                        : log.type === 'rx'
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
                        : log.type === 'err'
                        ? 'bg-red-950 text-red-400 border border-red-800/60'
                        : 'bg-stone-800 text-stone-400'
                    }`}
                  >
                    {log.type.toUpperCase()}
                  </span>
                  <span
                    className={`${
                      log.type === 'tx'
                        ? 'text-blue-300 font-semibold'
                        : log.type === 'rx'
                        ? 'text-emerald-300 font-bold'
                        : log.type === 'err'
                        ? 'text-red-400'
                        : 'text-stone-300'
                    }`}
                  >
                    {log.message}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Security or Connection Notice if needed */}
      {serialStatus.error && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-amber-900 dark:text-amber-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start space-x-2.5">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-semibold">{serialStatus.error}</p>
              <p className="text-[11px] text-amber-800/80 dark:text-amber-300/80">
                Opening in a standalone browser tab bypasses iframe restrictions and gives Chrome direct access to your USB port.
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2 shrink-0">
            <button
              onClick={() => enableSimulationMode()}
              className="px-3 py-1.5 rounded-xl bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/60 dark:hover:bg-amber-800 text-amber-900 dark:text-amber-200 font-semibold text-xs transition-colors cursor-pointer"
            >
              Use Simulation Mode
            </button>
            <button
              onClick={() => window.open(window.location.href, '_blank')}
              className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs flex items-center space-x-1.5 shadow-sm transition-colors cursor-pointer"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span>Open in Full Tab for Real USB</span>
            </button>
          </div>
        </div>
      )}

      {/* Real-time Detector Main Component */}
      <RoboflowDetector
        sessionId={session?.id || 'default-session'}
        sessionCounts={counts}
        onTomatoCounted={onTomatoCounted}
        onStopCamera={onStopCamera}
        onStartCamera={onStartCamera}
        cameraStatus={cameraStatus}
        setCameraStatus={setCameraStatus}
        lowLightConfig={lowLightConfig}
        onLowLightConfigChange={setLowLightConfig}
      />

      {/* Real-Time Unique Tomato Event Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Live Event Stream Table */}
        <div className="lg:col-span-2 rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900/90 p-5 shadow-xs transition-colors">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <Activity className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-stone-900 dark:text-white">
                Live Detection Stream
              </h3>
            </div>
            <span className="text-xs text-stone-500 dark:text-stone-400">
              {recentEvents.length} items logged
            </span>
          </div>

          {recentEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-stone-400 dark:text-stone-500">
              <div className="h-10 w-10 rounded-full bg-stone-100 dark:bg-stone-800 flex items-center justify-center mb-3">
                <Sparkles className="h-5 w-5 text-stone-400" />
              </div>
              <p className="text-sm font-medium text-stone-700 dark:text-stone-400">No tomatoes detected yet in this session</p>
              <p className="text-xs text-stone-500 mt-1 max-w-sm">
                Start camera or simulation to begin continuous detection and sorting.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-stone-200 dark:border-stone-800 text-stone-500 dark:text-stone-400">
                    <th className="pb-2 font-semibold">Time</th>
                    <th className="pb-2 font-semibold">Track ID</th>
                    <th className="pb-2 font-semibold">Classification & Pathology</th>
                    <th className="pb-2 font-semibold">Est. Size & Weight</th>
                    <th className="pb-2 font-semibold">Confidence</th>
                    <th className="pb-2 font-semibold">Grade</th>
                    <th className="pb-2 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 dark:divide-stone-800/60">
                  {recentEvents.slice(0, 10).map((evt) => {
                    const isBlight = evt.ripeness === 'blight';
                    const action = evt.sortingAction || (evt.confidence < 95 ? 'MANUAL_REVIEW' : isBlight ? 'REJECT_QUARANTINE' : 'ACCEPT');
                    const grade = evt.qualityGrade || (isBlight ? 'Grade C' : evt.confidence >= 95 ? 'Grade A' : 'Grade B');

                    return (
                      <tr key={evt.id} className="hover:bg-stone-50 dark:hover:bg-stone-800/40 transition-colors">
                        <td className="py-2.5 font-mono text-stone-600 dark:text-stone-400">
                          {new Date(evt.timestamp).toLocaleTimeString()}
                        </td>
                        <td className="py-2.5 font-mono font-bold text-stone-900 dark:text-stone-300">
                          #TRK-{evt.trackId}
                        </td>
                        <td className="py-2.5">
                          <div className="flex flex-col">
                            <span
                              className={`inline-flex items-center space-x-1 rounded px-2 py-0.5 font-semibold w-fit ${
                                evt.ripeness === 'ripe'
                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800/60'
                                  : evt.ripeness === 'unripe'
                                  ? 'bg-lime-100 text-lime-800 dark:bg-lime-950 dark:text-lime-300 border border-lime-300 dark:border-lime-800/60'
                                  : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 border border-red-300 dark:border-red-800/60'
                              }`}
                            >
                              <span>{evt.class}</span>
                            </span>
                            {evt.blightType && evt.blightType !== 'none' && (
                              <span className="text-[10px] text-red-600 dark:text-red-400 font-mono mt-0.5">
                                {evt.blightType === 'late_blight' ? 'Late Blight' : 'Early Blight'} • {evt.severity || 'mild'}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5">
                          <div className="flex flex-col">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded font-bold text-[11px] w-fit ${
                                evt.size === 'small'
                                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300 dark:border-amber-700'
                                  : evt.size === 'large'
                                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 border border-blue-300 dark:border-blue-700'
                                  : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                              }`}
                            >
                              {evt.size === 'small' ? 'Small' : evt.size === 'large' ? 'Large' : 'Medium'}
                            </span>
                            <span className="text-[10px] text-stone-700 dark:text-stone-300 font-mono mt-0.5 font-semibold">
                              ~{((evt.diameterMm || 65) / 10).toFixed(1)} cm
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5">
                          <span className={`font-semibold ${evt.confidence >= 95 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                            {evt.confidence}%
                          </span>
                        </td>
                        <td className="py-2.5">
                          <span className="inline-flex items-center px-2 py-0.5 rounded font-mono font-bold text-[11px] bg-stone-100 dark:bg-stone-800 text-stone-800 dark:text-stone-200 border border-stone-200 dark:border-stone-700">
                            {grade}
                          </span>
                        </td>
                        <td className="py-2.5">
                          {action === 'ACCEPT' ? (
                            <span className="inline-flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-300 dark:border-emerald-800/60">
                              <CheckCircle2 className="h-3 w-3" /> ACCEPT
                            </span>
                          ) : action === 'REJECT_QUARANTINE' ? (
                            <span className="inline-flex items-center gap-1 font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/60 px-2 py-0.5 rounded border border-red-300 dark:border-red-800/60">
                              <ShieldAlert className="h-3 w-3" /> REJECT
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 rounded border border-amber-300 dark:border-amber-800/60">
                              <AlertTriangle className="h-3 w-3" /> REVIEW
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right Col: Conveyor Quality Summary */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900/90 p-5 shadow-xs transition-colors">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-stone-900 dark:text-white">
                Automated Sorter Routing
              </h3>
              <span className="text-[10px] font-mono text-stone-500">95% Criteria</span>
            </div>
            
            {/* Tally Metrics */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-center">
                <div className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-400">Accepted</div>
                <div className="text-base font-bold font-mono text-emerald-900 dark:text-emerald-200">
                  {counts.accepted ?? (counts.ripe + counts.unripe)}
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 text-center">
                <div className="text-[10px] font-bold uppercase text-red-700 dark:text-red-400">Quarantine</div>
                <div className="text-base font-bold font-mono text-red-900 dark:text-red-200">
                  {counts.rejected ?? counts.blight}
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-center">
                <div className="text-[10px] font-bold uppercase text-amber-700 dark:text-amber-400">Manual</div>
                <div className="text-base font-bold font-mono text-amber-900 dark:text-amber-200">
                  {counts.manualReview ?? 0}
                </div>
              </div>
            </div>

            {/* Quality Grade breakdown */}
            <h4 className="text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider mb-2 flex items-center space-x-1.5">
              <Award className="h-3.5 w-3.5 text-stone-500" />
              <span>Commercial Grade Breakdown</span>
            </h4>

            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-stone-600 dark:text-stone-400 flex items-center space-x-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span>Grade A (Market)</span>
                </span>
                <span className="font-mono font-bold text-stone-900 dark:text-white">
                  {counts.gradeA ?? counts.ripe} ({counts.total > 0 ? Math.round(((counts.gradeA ?? counts.ripe) / counts.total) * 100) : 0}%)
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-stone-600 dark:text-stone-400 flex items-center space-x-1.5">
                  <span className="h-2 w-2 rounded-full bg-lime-500" />
                  <span>Grade B (Processing)</span>
                </span>
                <span className="font-mono font-bold text-stone-900 dark:text-white">
                  {counts.gradeB ?? counts.unripe} ({counts.total > 0 ? Math.round(((counts.gradeB ?? counts.unripe) / counts.total) * 100) : 0}%)
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-stone-600 dark:text-stone-400 flex items-center space-x-1.5">
                  <span className="h-2 w-2 rounded-full bg-red-500" />
                  <span>Grade C (Culled)</span>
                </span>
                <span className="font-mono font-bold text-stone-900 dark:text-white">
                  {counts.gradeC ?? counts.blight} ({counts.total > 0 ? Math.round(((counts.gradeC ?? counts.blight) / counts.total) * 100) : 0}%)
                </span>
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-stone-200 dark:border-stone-800 flex items-center justify-between">
              <button
                onClick={() => onNavigate('yield-monitoring')}
                className="flex items-center space-x-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
              >
                <span>View Analytics</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

