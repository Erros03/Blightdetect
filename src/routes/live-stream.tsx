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
} from 'lucide-react';

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
}) => {
  const [lowLightConfig, setLowLightConfig] = useState<LowLightFilterConfig>({
    enabled: false,
    brightness: 145, // +45%
    contrast: 135,   // +35%
    saturation: 120, // +20%
    preset: 'standard',
    autoGain: false,
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 space-y-6">
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
              <h3 className="text-sm font-bold uppercase tracking-wider text-stone-900 dark:text-white">
                Live Detection Event Stream
              </h3>
            </div>
            <span className="text-xs text-stone-500 dark:text-stone-400">
              {recentEvents.length} items logged this session
            </span>
          </div>

          {recentEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-stone-400 dark:text-stone-500">
              <div className="h-10 w-10 rounded-full bg-stone-100 dark:bg-stone-800 flex items-center justify-center mb-3">
                <Sparkles className="h-5 w-5 text-stone-400" />
              </div>
              <p className="text-sm font-medium text-stone-700 dark:text-stone-400">No tomatoes detected yet in this session</p>
              <p className="text-xs text-stone-500 mt-1 max-w-sm">
                Point the camera at tomatoes. Real-time detections will stream here automatically.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-stone-200 dark:border-stone-800 text-stone-500 dark:text-stone-400">
                    <th className="pb-2 font-semibold">Time</th>
                    <th className="pb-2 font-semibold">Track ID</th>
                    <th className="pb-2 font-semibold">Classification</th>
                    <th className="pb-2 font-semibold">Confidence</th>
                    <th className="pb-2 font-semibold">Est. Size</th>
                    <th className="pb-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 dark:divide-stone-800/60">
                  {recentEvents.slice(0, 10).map((evt) => (
                    <tr key={evt.id} className="hover:bg-stone-50 dark:hover:bg-stone-800/40 transition-colors">
                      <td className="py-2.5 font-mono text-stone-600 dark:text-stone-400">
                        {new Date(evt.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="py-2.5 font-mono font-bold text-stone-900 dark:text-stone-300">
                        #TRK-{evt.trackId}
                      </td>
                      <td className="py-2.5">
                        <span
                          className={`inline-flex items-center space-x-1 rounded px-2 py-0.5 font-semibold ${
                            evt.ripeness === 'ripe'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800/60'
                              : evt.ripeness === 'unripe'
                              ? 'bg-lime-100 text-lime-800 dark:bg-lime-950 dark:text-lime-300 border border-lime-300 dark:border-lime-800/60'
                              : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 border border-red-300 dark:border-red-800/60'
                          }`}
                        >
                          <span>{evt.class}</span>
                        </span>
                      </td>
                      <td className="py-2.5 font-semibold text-stone-800 dark:text-stone-200">
                        {evt.confidence}%
                      </td>
                      <td className="py-2.5 text-stone-700 dark:text-stone-300">
                        <span className="capitalize">{evt.size}</span> (~{evt.diameterMm}mm)
                      </td>
                      <td className="py-2.5">
                        {evt.ripeness === 'blight' ? (
                          <span className="text-red-600 dark:text-red-400 font-semibold flex items-center gap-1">
                            <ShieldAlert className="h-3 w-3" /> Cull
                          </span>
                        ) : (
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Pass
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right Col: Conveyor Quality Summary */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900/90 p-5 shadow-xs transition-colors">
            <h3 className="text-sm font-bold uppercase tracking-wider text-stone-900 dark:text-white mb-3">
              Session Quality Breakdown
            </h3>
            
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span className="text-emerald-600 dark:text-emerald-400">Ripe Yield Rate</span>
                  <span className="text-stone-900 dark:text-white">
                    {counts.total > 0
                      ? `${Math.round((counts.ripe / counts.total) * 100)}%`
                      : '0%'}
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-stone-100 dark:bg-stone-800 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-500"
                    style={{
                      width: `${counts.total > 0 ? (counts.ripe / counts.total) * 100 : 0}%`,
                    }}
                  ></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span className="text-lime-600 dark:text-lime-400">Unripe Ratio</span>
                  <span className="text-stone-900 dark:text-white">
                    {counts.total > 0
                      ? `${Math.round((counts.unripe / counts.total) * 100)}%`
                      : '0%'}
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-stone-100 dark:bg-stone-800 overflow-hidden">
                  <div
                    className="h-full bg-lime-500 transition-all duration-500"
                    style={{
                      width: `${counts.total > 0 ? (counts.unripe / counts.total) * 100 : 0}%`,
                    }}
                  ></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span className="text-red-600 dark:text-red-400">Blight Contamination</span>
                  <span className="text-stone-900 dark:text-white">
                    {counts.total > 0
                      ? `${((counts.blight / counts.total) * 100).toFixed(1)}%`
                      : '0%'}
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-stone-100 dark:bg-stone-800 overflow-hidden">
                  <div
                    className="h-full bg-red-500 transition-all duration-500"
                    style={{
                      width: `${counts.total > 0 ? (counts.blight / counts.total) * 100 : 0}%`,
                    }}
                  ></div>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-stone-200 dark:border-stone-800 flex items-center justify-between">
              <button
                onClick={() => onNavigate('yield-monitoring')}
                className="flex items-center space-x-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
              >
                <span>View Full Yield Analytics</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-stone-50/80 dark:bg-stone-900/60 p-4 text-xs text-stone-600 dark:text-stone-400">
            <h4 className="font-bold text-stone-800 dark:text-stone-200 mb-1">Continuous Counting Principle</h4>
            <p className="leading-relaxed">
              Tomatoes in view maintain persistent tracking IDs. Newly detected physical tomatoes are uniquely tracked to prevent duplicate inflation.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
