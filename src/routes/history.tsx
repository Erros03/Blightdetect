/**
 * Detection History Route - Permanent Historical Sessions
 */
import React, { useState, useEffect } from 'react';
import {
  History,
  Download,
  Calendar,
  Clock,
  Search,
  RefreshCw,
} from 'lucide-react';
import type { DetectionSession, TomatoDetectionEvent } from '../types.ts';
import { getHistoricalSessions, getRecentTomatoEvents } from '../lib/detection-sessions.ts';

export const HistoryRoute: React.FC = () => {
  const [sessions, setSessions] = useState<DetectionSession[]>([]);
  const [allEvents, setAllEvents] = useState<TomatoDetectionEvent[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedSession, setSelectedSession] = useState<DetectionSession | null>(null);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const [fetchedSessions, fetchedEvents] = await Promise.all([
        getHistoricalSessions(),
        getRecentTomatoEvents(),
      ]);
      setSessions(fetchedSessions);
      setAllEvents(fetchedEvents);
    } catch (e) {
      console.error('Error fetching history:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const filteredSessions = sessions.filter((s) => {
    const term = searchTerm.toLowerCase();
    return (
      (s.id && s.id.toLowerCase().includes(term)) ||
      (s.date && s.date.toLowerCase().includes(term)) ||
      (s.startTime && s.startTime.toLowerCase().includes(term))
    );
  });

  // Export sessions to CSV
  const exportToCSV = () => {
    if (sessions.length === 0) return;
    const headers = 'Session ID,Date,Start Time,End Time,Total,Ripe,Unripe,Blight,Blight %\n';
    const rows = sessions
      .map(
        (s) =>
          `"${s.id}","${s.date}","${s.startTime}","${s.endTime || 'N/A'}",${s.totalCount},${s.ripeCount},${s.unripeCount},${s.blightCount},"${s.blightPercentage || 0}%"`
      )
      .join('\n');

    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `blightdetect_sessions_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const sessionEvents = selectedSession
    ? allEvents.filter((e) => e.sessionId === selectedSession.id)
    : [];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <History className="h-6 w-6 text-amber-600 dark:text-amber-400" />
            <h1 className="text-2xl font-black tracking-tight text-stone-900 dark:text-white sm:text-3xl">
              Detection History & Logs
            </h1>
          </div>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            Permanent audit record of completed conveyor detection runs and defect incidence
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={fetchHistory}
            className="flex items-center space-x-1.5 rounded-xl bg-white border border-stone-200 hover:bg-stone-50 dark:bg-stone-800 dark:border-stone-700 dark:hover:bg-stone-700 px-3.5 py-2 text-xs font-semibold text-stone-700 dark:text-stone-300 transition-colors shadow-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={exportToCSV}
            disabled={sessions.length === 0}
            className="flex items-center space-x-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-3.5 py-2 text-xs font-bold text-white transition-colors shadow-xs"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex items-center space-x-3 rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900/90 p-3 shadow-xs transition-colors">
        <Search className="h-4 w-4 text-stone-400 ml-1" />
        <input
          type="text"
          placeholder="Search by date (YYYY-MM-DD) or session ID..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-transparent text-sm text-stone-900 dark:text-white placeholder-stone-400 dark:placeholder-stone-500 focus:outline-none"
        />
      </div>

      {/* Historical Sessions Table */}
      <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900/90 p-5 shadow-xs transition-colors">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-stone-900 dark:text-white">
            Historical Detection Sessions ({filteredSessions.length})
          </h3>
          <span className="text-xs text-stone-500 dark:text-stone-400">Stored permanently in Firestore & Local DB</span>
        </div>

        {loading ? (
          <div className="py-12 text-center text-stone-500 text-sm">
            <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-amber-500" />
            Loading historical sessions...
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="py-12 text-center text-stone-400 dark:text-stone-500 text-sm">
            No completed sessions match your filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-stone-200 dark:border-stone-800 text-stone-500 dark:text-stone-400">
                  <th className="pb-3 font-semibold">Date & Time</th>
                  <th className="pb-3 font-semibold">Session ID</th>
                  <th className="pb-3 font-semibold">Duration</th>
                  <th className="pb-3 font-semibold text-center">Total</th>
                  <th className="pb-3 font-semibold text-emerald-600 dark:text-emerald-400 text-center">Ripe</th>
                  <th className="pb-3 font-semibold text-lime-600 dark:text-lime-400 text-center">Unripe</th>
                  <th className="pb-3 font-semibold text-red-600 dark:text-red-400 text-center">Blight</th>
                  <th className="pb-3 font-semibold text-center">Blight %</th>
                  <th className="pb-3 font-semibold text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-stone-800/60">
                {filteredSessions.map((s) => (
                  <tr key={s.id} className="hover:bg-stone-50 dark:hover:bg-stone-800/30 transition-colors">
                    <td className="py-3 font-mono text-stone-800 dark:text-stone-300">
                      <div className="flex items-center space-x-1.5 font-bold text-stone-900 dark:text-white">
                        <Calendar className="h-3.5 w-3.5 text-stone-400" />
                        <span>{s.date}</span>
                      </div>
                      <div className="text-[11px] text-stone-500 dark:text-stone-400 flex items-center space-x-1 mt-0.5">
                        <Clock className="h-3 w-3" />
                        <span>{s.startTime} → {s.endTime || 'Completed'}</span>
                      </div>
                    </td>

                    <td className="py-3 font-mono text-stone-500 dark:text-stone-400">
                      {s.id.substring(0, 18)}...
                    </td>

                    <td className="py-3 text-stone-600 dark:text-stone-400 font-mono">
                      {s.durationSeconds ? `${Math.round(s.durationSeconds / 60)}m ${s.durationSeconds % 60}s` : 'Active'}
                    </td>

                    <td className="py-3 font-bold text-stone-900 dark:text-white text-center text-sm">
                      {s.totalCount}
                    </td>

                    <td className="py-3 font-semibold text-emerald-600 dark:text-emerald-400 text-center">
                      {s.ripeCount}
                    </td>

                    <td className="py-3 font-semibold text-lime-600 dark:text-lime-400 text-center">
                      {s.unripeCount}
                    </td>

                    <td className="py-3 font-semibold text-red-600 dark:text-red-400 text-center">
                      {s.blightCount}
                    </td>

                    <td className="py-3 text-center">
                      <span
                        className={`inline-block rounded px-2 py-0.5 font-bold ${
                          (s.blightPercentage || 0) > 10
                            ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 border border-red-200 dark:border-red-800'
                            : 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300'
                        }`}
                      >
                        {s.blightPercentage || (s.totalCount > 0 ? ((s.blightCount / s.totalCount) * 100).toFixed(1) : 0)}%
                      </span>
                    </td>

                    <td className="py-3 text-right">
                      <button
                        onClick={() => setSelectedSession(selectedSession?.id === s.id ? null : s)}
                        className="rounded-lg bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 px-2.5 py-1 text-xs font-semibold text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-700 transition-colors"
                      >
                        {selectedSession?.id === s.id ? 'Close' : 'View'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Selected Session Detail Modal / Card */}
      {selectedSession && (
        <div className="rounded-2xl border border-amber-300 dark:border-amber-800/60 bg-white dark:bg-stone-900 p-6 shadow-xl space-y-4 transition-colors">
          <div className="flex items-center justify-between border-b border-stone-200 dark:border-stone-800 pb-3">
            <div>
              <h3 className="text-base font-bold text-stone-900 dark:text-white">
                Session Inspection: <span className="font-mono text-amber-600 dark:text-amber-400">{selectedSession.id}</span>
              </h3>
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                Recorded on {selectedSession.date} from {selectedSession.startTime} to {selectedSession.endTime || 'End'}
              </p>
            </div>
            <button
              onClick={() => setSelectedSession(null)}
              className="text-stone-400 hover:text-stone-800 dark:hover:text-white text-xs font-bold"
            >
              ✕ Close
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="rounded-xl bg-stone-50 dark:bg-stone-950 p-3 text-center border border-stone-200 dark:border-stone-800">
              <span className="text-xs text-stone-500 dark:text-stone-400">Total Counted</span>
              <div className="text-2xl font-black text-stone-900 dark:text-white">{selectedSession.totalCount}</div>
            </div>
            <div className="rounded-xl bg-stone-50 dark:bg-stone-950 p-3 text-center border border-stone-200 dark:border-stone-800">
              <span className="text-xs text-emerald-600 dark:text-emerald-400">Ripe</span>
              <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{selectedSession.ripeCount}</div>
            </div>
            <div className="rounded-xl bg-stone-50 dark:bg-stone-950 p-3 text-center border border-stone-200 dark:border-stone-800">
              <span className="text-xs text-lime-600 dark:text-lime-400">Unripe</span>
              <div className="text-2xl font-black text-lime-600 dark:text-lime-400">{selectedSession.unripeCount}</div>
            </div>
            <div className="rounded-xl bg-stone-50 dark:bg-stone-950 p-3 text-center border border-stone-200 dark:border-stone-800">
              <span className="text-xs text-red-600 dark:text-red-400">Blight Culled</span>
              <div className="text-2xl font-black text-red-600 dark:text-red-400">{selectedSession.blightCount}</div>
            </div>
          </div>

          {/* Session Detection Events Table */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-stone-600 dark:text-stone-400 mb-2">
              Individual Unique Tomato Records ({sessionEvents.length})
            </h4>
            {sessionEvents.length === 0 ? (
              <p className="text-xs text-stone-500 py-3">
                No individual bounding-box events recorded for this historical session.
              </p>
            ) : (
              <div className="max-h-60 overflow-y-auto rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950 p-2">
                <table className="w-full text-left text-xs">
                  <thead className="text-stone-500 border-b border-stone-200 dark:border-stone-800">
                    <tr>
                      <th className="pb-1.5 font-semibold">Time</th>
                      <th className="pb-1.5 font-semibold">Track ID</th>
                      <th className="pb-1.5 font-semibold">Class</th>
                      <th className="pb-1.5 font-semibold">Confidence</th>
                      <th className="pb-1.5 font-semibold">Size</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200 dark:divide-stone-800/40">
                    {sessionEvents.map((e) => (
                      <tr key={e.id}>
                        <td className="py-1.5 font-mono text-stone-600 dark:text-stone-400">{new Date(e.timestamp).toLocaleTimeString()}</td>
                        <td className="py-1.5 font-mono text-stone-900 dark:text-stone-300">#TRK-{e.trackId}</td>
                        <td className="py-1.5 text-stone-800 dark:text-stone-200 font-medium">{e.class}</td>
                        <td className="py-1.5 font-bold text-stone-900 dark:text-stone-300">{e.confidence}%</td>
                        <td className="py-1.5 text-stone-600 dark:text-stone-400 capitalize">{e.size} (~{e.diameterMm}mm)</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
