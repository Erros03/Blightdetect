/**
 * Dashboard Route - BlightDetect+ Tomato Vision Stream
 */
import React from 'react';
import {
  Camera,
  ShieldAlert,
  CheckCircle2,
  Activity,
  History,
  Sparkles,
  ArrowRight,
  AlertTriangle,
} from 'lucide-react';
import type {
  TomatoSessionCounts,
  TomatoDetectionEvent,
  CameraStatus,
  DetectionSession,
} from '../types.ts';
import { useDashboardData } from '../hooks/useDashboardData.ts';
import { BrandLogo } from '../components/BrandLogo.tsx';

interface DashboardRouteProps {
  currentCounts: TomatoSessionCounts;
  liveEvents: TomatoDetectionEvent[];
  cameraStatus: CameraStatus;
  session: DetectionSession | null;
  onNavigate: (route: string) => void;
  onStartLiveSession: () => void;
}

export const DashboardRoute: React.FC<DashboardRouteProps> = ({
  currentCounts,
  liveEvents,
  cameraStatus,
  session,
  onNavigate,
  onStartLiveSession,
}) => {
  const { metrics, historicalSessions, recentDetections } = useDashboardData(
    currentCounts,
    liveEvents
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 space-y-6">
      {/* Top Banner / Hero Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-stone-900 via-stone-900 to-stone-800 border border-stone-800 p-6 sm:p-8 shadow-xl text-white">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="flex items-start space-x-4">
            <BrandLogo size="lg" className="hidden sm:flex mt-1" />
            <div className="space-y-2 max-w-2xl">
              <div className="inline-flex items-center space-x-2 rounded-full bg-red-950/80 px-3 py-1 text-xs font-bold text-red-300 border border-red-800/60">
                <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse"></span>
                <span>Autonomous Vision Stream Active</span>
              </div>
              <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
                BlightDetect<span className="text-red-500">+</span>
              </h1>
              <p className="text-sm text-stone-300 leading-relaxed">
                Real-time tomato ripening classification, automated conveyor tracking, and early blight disease detection powered by continuous YOLOv11 computer vision.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              id="btn-dash-open-camera"
              onClick={() => {
                onStartLiveSession();
                onNavigate('live-stream');
              }}
              className="flex items-center space-x-2 rounded-2xl bg-gradient-to-r from-red-600 to-rose-600 px-5 py-3 text-sm font-bold text-white shadow-lg hover:from-red-500 hover:to-rose-500 transition-all cursor-pointer"
            >
              <Camera className="h-4 w-4" />
              <span>Launch Live Camera</span>
              <ArrowRight className="h-4 w-4" />
            </button>

            <button
              id="btn-dash-view-history"
              onClick={() => onNavigate('history')}
              className="flex items-center space-x-2 rounded-2xl bg-stone-800 hover:bg-stone-700 px-5 py-3 text-sm font-semibold text-stone-200 border border-stone-700 transition-colors"
            >
              <History className="h-4 w-4 text-amber-400" />
              <span>Past Sessions ({historicalSessions.length})</span>
            </button>
          </div>
        </div>
      </div>

      {/* Blight Alert Banner (Conditional) */}
      {metrics.blightRatePercent > 10 && (
        <div className="flex items-center justify-between rounded-2xl border border-red-300 dark:border-red-800/80 bg-red-50 dark:bg-red-950/60 p-4 text-red-900 dark:text-red-200 shadow-sm">
          <div className="flex items-center space-x-3">
            <div className="rounded-xl bg-red-200 dark:bg-red-900/80 p-2 text-red-700 dark:text-red-300">
              <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-red-900 dark:text-red-100">Elevated Blight Infection Rate Warning</h4>
              <p className="text-xs text-red-700 dark:text-red-300/90">
                Current session blight rate is <strong>{metrics.blightRatePercent}%</strong> (Threshold: 10%). Immediate culling recommended.
              </p>
            </div>
          </div>
          <button
            onClick={() => onNavigate('live-stream')}
            className="rounded-xl bg-red-600 dark:bg-red-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-500"
          >
            Inspect Feed
          </button>
        </div>
      )}

      {/* Live Session Counter Cards (Requirement: Starts at 0, accurate counts) */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <Activity className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-stone-600 dark:text-stone-400">
              Active Detection Session Metrics
            </h2>
          </div>
          {session && (
            <span className="text-xs text-stone-500 font-mono">
              Session: {session.id.substring(0, 14)}...
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {/* TOTAL */}
          <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900/90 p-5 shadow-xs transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">Session Total</span>
              <span className="rounded-lg bg-stone-100 dark:bg-stone-800 p-1.5 text-stone-700 dark:text-stone-300 font-mono text-xs">ALL</span>
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-4xl font-black text-stone-900 dark:text-white">{currentCounts.total}</span>
              <span className="text-xs text-stone-500 dark:text-stone-400">unique tomatoes</span>
            </div>
            <div className="mt-2 text-xs text-stone-500 flex items-center gap-1">
              <span>Status:</span>
              <span className={cameraStatus === 'live' ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-stone-500 dark:text-stone-400'}>
                {cameraStatus === 'live' ? 'Scanning live' : 'Standby'}
              </span>
            </div>
          </div>

          {/* RIPE */}
          <div className="rounded-2xl border border-emerald-200 dark:border-emerald-950 bg-white dark:bg-stone-900/90 p-5 shadow-xs transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Ripe / Grade A</span>
              <div className="rounded-lg bg-emerald-100 dark:bg-emerald-950 p-1.5 text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-4xl font-black text-emerald-600 dark:text-emerald-400">{currentCounts.ripe}</span>
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-500">
                {currentCounts.total > 0
                  ? `${Math.round((currentCounts.ripe / currentCounts.total) * 100)}%`
                  : '0%'}
              </span>
            </div>
            <div className="mt-2 text-xs text-emerald-600 dark:text-emerald-500/90">Passed to packaging</div>
          </div>

          {/* UNRIPE */}
          <div className="rounded-2xl border border-lime-200 dark:border-lime-950 bg-white dark:bg-stone-900/90 p-5 shadow-xs transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-lime-700 dark:text-lime-400">Unripe / Green</span>
              <span className="h-4 w-4 rounded-full bg-lime-500 block"></span>
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-4xl font-black text-lime-600 dark:text-lime-400">{currentCounts.unripe}</span>
              <span className="text-xs font-bold text-lime-600 dark:text-lime-500">
                {currentCounts.total > 0
                  ? `${Math.round((currentCounts.unripe / currentCounts.total) * 100)}%`
                  : '0%'}
              </span>
            </div>
            <div className="mt-2 text-xs text-lime-600 dark:text-lime-500/90">Diverted to ripening room</div>
          </div>

          {/* BLIGHT */}
          <div className="rounded-2xl border border-red-200 dark:border-red-950 bg-white dark:bg-stone-900/90 p-5 shadow-xs transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-red-600 dark:text-red-400">Blight Detected</span>
              <div className="rounded-lg bg-red-100 dark:bg-red-950 p-1.5 text-red-700 dark:text-red-300">
                <ShieldAlert className="h-4 w-4 text-red-600 dark:text-red-400" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-4xl font-black text-red-600 dark:text-red-400">{currentCounts.blight}</span>
              <span className="text-xs font-bold text-red-600 dark:text-red-500">
                {metrics.blightRatePercent}%
              </span>
            </div>
            <div className="mt-2 text-xs text-red-600 dark:text-red-400/90">Auto-culled from stream</div>
          </div>
        </div>
      </div>

      {/* Analytics & Performance Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Real-time Quality & Harvest Estimation */}
        <div className="lg:col-span-2 space-y-6">
          {/* Recent Detection Stream Table */}
          <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900/90 p-5 shadow-xs transition-colors">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-stone-900 dark:text-white">
                  Recent Unique Tomato Detections
                </h3>
                <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                  Centroid-tracked unique items with bounding-box metrics
                </p>
              </div>
              <button
                onClick={() => onNavigate('live-stream')}
                className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center space-x-1"
              >
                <span>Live Feed</span>
                <ArrowRight className="h-3 w-3" />
              </button>
            </div>

            {recentDetections.length === 0 ? (
              <div className="py-8 text-center text-stone-500 text-xs">
                No detection events logged in current session. Launch the camera to begin.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-stone-200 dark:border-stone-800 text-stone-500 dark:text-stone-400">
                      <th className="pb-2 font-semibold">Time</th>
                      <th className="pb-2 font-semibold">Track ID</th>
                      <th className="pb-2 font-semibold">Class</th>
                      <th className="pb-2 font-semibold">Confidence</th>
                      <th className="pb-2 font-semibold">Est. Size & Weight</th>
                      <th className="pb-2 font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 dark:divide-stone-800/60">
                    {recentDetections.slice(0, 6).map((evt) => (
                      <tr key={evt.id} className="hover:bg-stone-50 dark:hover:bg-stone-800/30">
                        <td className="py-2.5 font-mono text-stone-600 dark:text-stone-400">
                          {new Date(evt.timestamp).toLocaleTimeString()}
                        </td>
                        <td className="py-2.5 font-mono font-bold text-stone-900 dark:text-stone-300">
                          #TRK-{evt.trackId}
                        </td>
                        <td className="py-2.5">
                          <span
                            className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                              evt.ripeness === 'ripe'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                : evt.ripeness === 'unripe'
                                ? 'bg-lime-100 text-lime-800 dark:bg-lime-950 dark:text-lime-300'
                                : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                            }`}
                          >
                            {evt.class}
                          </span>
                        </td>
                        <td className="py-2.5 font-semibold text-stone-800 dark:text-stone-200">{evt.confidence}%</td>
                        <td className="py-2.5">
                          <div className="flex items-center space-x-2">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded font-bold text-[11px] ${
                                evt.size === 'small'
                                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300'
                                  : evt.size === 'large'
                                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300'
                                  : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
                              }`}
                            >
                              {evt.size === 'small' ? 'Small' : evt.size === 'large' ? 'Large' : 'Medium'}
                            </span>
                            <span className="text-[10px] text-stone-600 dark:text-stone-300 font-mono font-semibold">
                              ~{evt.diameterMm}mm
                            </span>
                            <span className="text-[10px] text-stone-500 dark:text-stone-400 font-mono">
                              • {evt.weightGrams ?? (evt.size === 'small' ? 85 : evt.size === 'large' ? 200 : 140)}g
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5">
                          {evt.ripeness === 'blight' ? (
                            <span className="text-red-600 dark:text-red-400 font-bold">Cull</span>
                          ) : (
                            <span className="text-emerald-600 dark:text-emerald-400 font-bold">Accept</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right Col: Historical Sessions */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900/90 p-5 shadow-xs transition-colors">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <History className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-stone-900 dark:text-white">
                  Completed Sessions History
                </h3>
              </div>
              <button
                onClick={() => onNavigate('history')}
                className="text-xs font-bold text-amber-600 dark:text-amber-400 hover:underline"
              >
                View All
              </button>
            </div>

            {historicalSessions.length === 0 ? (
              <div className="py-6 text-center text-xs text-stone-500">
                No completed sessions stored yet.
              </div>
            ) : (
              <div className="space-y-3">
                {historicalSessions.slice(0, 4).map((s) => (
                  <div
                    key={s.id}
                    className="p-3 rounded-xl bg-stone-50 dark:bg-stone-950 border border-stone-200 dark:border-stone-800 text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-stone-900 dark:text-stone-200">{s.date}</span>
                      <span className="font-mono text-stone-500 dark:text-stone-400">{s.startTime} - {s.endTime || 'Ended'}</span>
                    </div>
                    <div className="flex items-center justify-between text-stone-600 dark:text-stone-400">
                      <span>Total: <strong className="text-stone-900 dark:text-white">{s.totalCount}</strong></span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{s.ripeCount} Ripe</span>
                      <span className="text-lime-600 dark:text-lime-400 font-semibold">{s.unripeCount} Unripe</span>
                      <span className="text-red-600 dark:text-red-400 font-semibold">{s.blightCount} Blight</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
