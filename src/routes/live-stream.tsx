/**
 * Live Stream Route - Continuous Real-Time Tomato & Blight Detector
 */
import React, { useState } from 'react';
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
  Cpu,
} from 'lucide-react';
import { arduinoSerial } from '../lib/arduino-serial.ts';

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
  onOpenArduinoModal?: () => void;
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
  onOpenArduinoModal,
}) => {
  const [lowLightConfig, setLowLightConfig] = useState<LowLightFilterConfig>({
    enabled: false,
    brightness: 145,
    contrast: 135,
    saturation: 120,
    preset: 'standard',
    autoGain: false,
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 space-y-6">
      {/* Arduino Hardware Quick Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-xs text-xs">
        <div className="flex items-center space-x-3">
          <div className={`p-2 rounded-xl ${arduinoSerial.getConnected() ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400' : 'bg-stone-100 dark:bg-stone-800 text-stone-500'}`}>
            <Cpu className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-stone-900 dark:text-stone-100">
                Arduino Physical Size Sorter
              </span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                arduinoSerial.getConnected()
                  ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                  : 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400'
              }`}>
                <span className={`h-1.5 w-1.5 rounded-full mr-1.5 ${arduinoSerial.getConnected() ? 'bg-emerald-500 animate-pulse' : 'bg-stone-400'}`} />
                {arduinoSerial.getConnected() ? 'USB Connected (9600 Baud)' : 'Disconnected (Simulation Mode Active)'}
              </span>
            </div>
            <p className="text-[11px] text-stone-500 dark:text-stone-400">
              Small: 30° (&lt;60mm) • Medium: 90° (60-75mm / 110-170g) • Large: 150° (&gt;75mm) • Reject: 180°
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {onOpenArduinoModal && (
            <button
              id="btn-open-arduino-sorter-controls"
              onClick={onOpenArduinoModal}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl font-bold bg-stone-900 text-white hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white shadow-xs transition-colors cursor-pointer"
            >
              <Cpu className="h-3.5 w-3.5" />
              <span>{arduinoSerial.getConnected() ? 'Configure Sorter' : 'Connect Arduino USB'}</span>
            </button>
          )}
        </div>
      </div>

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
                              ~{evt.diameterMm || 65}mm ({((evt.diameterMm || 65) / 25.4).toFixed(1)}")
                            </span>
                            <span className="text-[10px] text-stone-500 dark:text-stone-400 font-mono">
                              {evt.weightGrams ?? (evt.size === 'small' ? 85 : evt.size === 'large' ? 200 : 140)}g ({evt.weightOz ?? (evt.size === 'small' ? '3.0' : evt.size === 'large' ? '7.1' : '4.9')} oz)
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
          {/* Arduino Hardware Actuator Quick Status */}
          {onOpenArduinoModal && (
            <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900/90 p-4 shadow-xs flex items-center justify-between transition-colors">
              <div className="flex items-center space-x-3">
                <div className={`p-2.5 rounded-xl ${arduinoSerial.getConnected() ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400' : 'bg-stone-100 dark:bg-stone-800 text-stone-500'}`}>
                  <Cpu className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-stone-900 dark:text-white flex items-center gap-1.5">
                    Arduino Size Sorter
                    <span className={`h-1.5 w-1.5 rounded-full ${arduinoSerial.getConnected() ? 'bg-emerald-500 animate-pulse' : 'bg-stone-400'}`} />
                  </div>
                  <div className="text-[11px] text-stone-500 dark:text-stone-400">
                    {arduinoSerial.getConnected() ? 'Connected • Auto-Gating Active' : 'Offline • Simulation Mode'}
                  </div>
                </div>
              </div>
              <button
                onClick={onOpenArduinoModal}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 border border-stone-200 dark:border-stone-700/60 transition-colors cursor-pointer"
              >
                Configure
              </button>
            </div>
          )}

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

