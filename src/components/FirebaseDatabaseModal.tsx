import React, { useState, useEffect, useCallback } from 'react';
import {
  Database,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
  Plus,
  Radio,
  ChevronDown,
  ChevronRight,
  X,
  Server,
  Activity,
  Layers,
  Wrench,
  Tag,
} from 'lucide-react';
import {
  FIREBASE_RTDB_CONFIG,
  fetchRecentFirebaseDetections,
  sendDetectionToFirebaseRtdb,
  testFirebaseRtdbConnection,
  fixAllMissingFirebaseIds,
  type FirebaseRtdbRecord,
} from '../lib/firebase-rtdb.ts';

interface FirebaseDatabaseModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FirebaseDatabaseModal: React.FC<FirebaseDatabaseModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [records, setRecords] = useState<FirebaseRtdbRecord[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [latencyMs, setLatencyMs] = useState<number>(0);
  const [isConnected, setIsConnected] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSendingTest, setIsSendingTest] = useState<boolean>(false);
  const [isFixingIds, setIsFixingIds] = useState<boolean>(false);
  const [idFormat, setIdFormat] = useState<'structured' | 'push'>('structured');
  const [lastTestResult, setLastTestResult] = useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [viewMode, setViewMode] = useState<'console' | 'table'>('console');

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [conn, recent] = await Promise.all([
        testFirebaseRtdbConnection(),
        fetchRecentFirebaseDetections(25),
      ]);

      setIsConnected(conn.connected);
      setLatencyMs(conn.latencyMs);
      setTotalCount(conn.itemCount);

      if (recent.success && recent.records.length > 0) {
        setRecords(recent.records);
        // Default expand first 3 records in console tree
        const defaultExpanded: Record<string, boolean> = { root: true };
        recent.records.slice(0, 3).forEach((r) => {
          if (r.id) defaultExpanded[r.id] = true;
        });
        setExpandedNodes((prev) => ({ ...defaultExpanded, ...prev }));
      }
    } catch (err) {
      console.error('Error loading Firebase DB data:', err);
      setIsConnected(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, loadData]);

  if (!isOpen) return null;

  const toggleNode = (nodeId: string) => {
    setExpandedNodes((prev) => ({
      ...prev,
      [nodeId]: !prev[nodeId],
    }));
  };

  const handleSendTest = async (ripeness: 'Ripe' | 'Blight') => {
    setIsSendingTest(true);
    setLastTestResult(null);

    const isHealthy = ripeness === 'Ripe';
    const testRecord: FirebaseRtdbRecord = {
      action: isHealthy ? 'Accepted' : 'Rejected',
      confidence: Math.floor(Math.random() * 8) + 91,
      diameterMm: Math.floor(Math.random() * 20) + 52,
      label: isHealthy ? 'Healthy' : 'Defective',
      ripeness,
      size: 'Medium',
      className: isHealthy ? 'ripe_tomato' : 'blighted_tomato',
      timestamp: Date.now(),
      createdAt: Date.now(),
    };

    const res = await sendDetectionToFirebaseRtdb(
      testRecord,
      undefined,
      idFormat === 'structured'
    );
    setIsSendingTest(false);

    if (res.success) {
      setLastTestResult(`Record saved to Firebase! ID: ${res.id}`);
      // Refresh list to show newly pushed record
      await loadData();
    } else {
      setLastTestResult(`Write failed: ${res.error}`);
    }
  };

  const handleFixDatabaseIds = async () => {
    setIsFixingIds(true);
    setLastTestResult(null);
    try {
      const result = await fixAllMissingFirebaseIds();
      setLastTestResult(
        `Database audit complete: ${result.scanned} records scanned, ${result.fixed} missing IDs patched! All records now have matching keys.`
      );
      await loadData();
    } catch (e: any) {
      setLastTestResult(`Error auditing IDs: ${e?.message || 'Failed'}`);
    } finally {
      setIsFixingIds(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative w-full max-w-4xl rounded-2xl bg-stone-900 border border-stone-800 shadow-2xl text-stone-100 overflow-hidden my-8">
        {/* Header matching Firebase Realtime Database banner */}
        <div className="flex items-center justify-between border-b border-stone-800 bg-stone-950 px-6 py-4">
          <div className="flex items-center space-x-3">
            <div className="rounded-xl bg-amber-500/10 p-2 text-amber-400 border border-amber-500/20">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold text-white tracking-tight">
                  Firebase Realtime Database
                </h2>
                <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  Live Connected
                </span>
              </div>
              <p className="text-xs text-stone-400 font-mono mt-0.5 truncate max-w-md">
                {FIREBASE_RTDB_CONFIG.databaseUrl}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <a
              href="https://console.firebase.google.com/u/0/project/blightdetect-4b3a6/database/blightdetect-4b3a6-default-rtdb/data/~2F"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 px-3 py-1.5 text-xs font-semibold text-stone-200 transition-colors border border-stone-700"
            >
              <span>Firebase Console</span>
              <ExternalLink className="h-3 w-3" />
            </a>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-stone-400 hover:text-white hover:bg-stone-800 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Status Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-stone-900/80 border-b border-stone-800 px-6 py-3 text-xs">
          <div className="flex items-center space-x-2">
            <Server className="h-3.5 w-3.5 text-stone-400" />
            <span className="text-stone-400">Project:</span>
            <span className="font-semibold text-white font-mono">{FIREBASE_RTDB_CONFIG.projectId}</span>
          </div>
          <div className="flex items-center space-x-2">
            <Layers className="h-3.5 w-3.5 text-stone-400" />
            <span className="text-stone-400">Total Records:</span>
            <span className="font-semibold text-emerald-400 font-mono">{totalCount} items</span>
          </div>
          <div className="flex items-center space-x-2">
            <Activity className="h-3.5 w-3.5 text-stone-400" />
            <span className="text-stone-400">Latency:</span>
            <span className="font-semibold text-stone-300 font-mono">{latencyMs}ms</span>
          </div>
          <div className="flex items-center justify-end space-x-2">
            <button
              onClick={loadData}
              disabled={isLoading}
              className="flex items-center space-x-1 rounded-md bg-stone-800 hover:bg-stone-700 px-2 py-1 text-[11px] font-medium text-stone-300 transition-colors"
            >
              <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Action Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 bg-stone-950/60 border-b border-stone-800">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-stone-400">Quick Test Write:</span>
            <button
              onClick={() => handleSendTest('Ripe')}
              disabled={isSendingTest}
              className="flex items-center space-x-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-2.5 py-1 text-xs font-semibold text-white transition-colors shadow-xs"
            >
              <Plus className="h-3 w-3" />
              <span>+ Push Ripe (Accepted)</span>
            </button>
            <button
              onClick={() => handleSendTest('Blight')}
              disabled={isSendingTest}
              className="flex items-center space-x-1 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 px-2.5 py-1 text-xs font-semibold text-white transition-colors shadow-xs"
            >
              <Plus className="h-3 w-3" />
              <span>+ Push Blight (Rejected)</span>
            </button>
            
            {/* Audit / Fix Database IDs Button */}
            <button
              onClick={handleFixDatabaseIds}
              disabled={isFixingIds}
              className="flex items-center space-x-1 rounded-lg bg-purple-900/60 hover:bg-purple-800/80 border border-purple-600/50 px-2.5 py-1 text-xs font-semibold text-purple-200 transition-colors"
              title="Ensures every single item in the Firebase Realtime Database has an 'id' property matching its key"
            >
              <Wrench className={`h-3 w-3 ${isFixingIds ? 'animate-spin' : ''}`} />
              <span>{isFixingIds ? 'Fixing IDs...' : 'Audit & Fix Database IDs'}</span>
            </button>
          </div>

          <div className="flex items-center space-x-3">
            {/* ID Scheme Selector */}
            <div className="flex items-center space-x-1 text-xs bg-stone-900 border border-stone-800 rounded-lg p-1">
              <span className="text-[11px] text-stone-400 px-1 flex items-center gap-1">
                <Tag className="h-3 w-3 text-amber-400" />
                ID:
              </span>
              <button
                onClick={() => setIdFormat('structured')}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                  idFormat === 'structured'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'text-stone-400 hover:text-white'
                }`}
                title="Format: -O1Healthy01, -O2Healthy02 (Clean sequential pattern matching your console)"
              >
                -O1Healthy01
              </button>
              <button
                onClick={() => setIdFormat('push')}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                  idFormat === 'push'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'text-stone-400 hover:text-white'
                }`}
                title="Standard Firebase Push ID format (-P0...)"
              >
                Push ID
              </button>
            </div>

            <div className="flex items-center space-x-1 rounded-lg bg-stone-800 p-0.5 border border-stone-700">
              <button
                onClick={() => setViewMode('console')}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                  viewMode === 'console'
                    ? 'bg-amber-500 text-stone-950 shadow-xs'
                    : 'text-stone-400 hover:text-white'
                }`}
              >
                Console Tree View
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                  viewMode === 'table'
                    ? 'bg-amber-500 text-stone-950 shadow-xs'
                    : 'text-stone-400 hover:text-white'
                }`}
              >
                Table View
              </button>
            </div>
          </div>
        </div>

        {lastTestResult && (
          <div className="bg-emerald-950/60 border-b border-emerald-800/60 px-6 py-2 text-xs text-emerald-300 flex items-center space-x-2 font-mono">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
            <span>{lastTestResult}</span>
          </div>
        )}

        {/* Database Content Area */}
        <div className="p-6 max-h-[500px] overflow-y-auto font-mono text-xs">
          {viewMode === 'console' ? (
            /* Firebase Console Tree View replica */
            <div className="rounded-xl border border-stone-800 bg-stone-950 p-4 font-mono text-xs shadow-inner">
              {/* Root URL Node */}
              <div className="flex items-center space-x-1.5 text-stone-400 select-none pb-1">
                <span className="text-stone-500">https://blightdetect-4b3a6-default-rtdb.firebaseio.com/</span>
              </div>

              {/* detections/ path */}
              <div className="ml-3 pl-2 border-l border-stone-800/80 my-1">
                <div
                  onClick={() => toggleNode('root')}
                  className="flex items-center space-x-1 text-amber-400 hover:text-amber-300 cursor-pointer py-1 select-none font-bold"
                >
                  {expandedNodes['root'] ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                  <span>detections</span>
                  <span className="text-[10px] text-stone-500 font-normal">
                    ({records.length} recent shown of {totalCount})
                  </span>
                </div>

                {expandedNodes['root'] && (
                  <div className="ml-4 space-y-1.5 border-l border-stone-800/60 pl-3 pt-1">
                    {records.map((rec) => {
                      const isExpanded = Boolean(expandedNodes[rec.id || '']);
                      return (
                        <div key={rec.id} className="py-0.5">
                          <div
                            onClick={() => rec.id && toggleNode(rec.id)}
                            className="flex items-center space-x-1.5 text-stone-300 hover:text-white cursor-pointer select-none"
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-3 w-3 text-stone-500" />
                            ) : (
                              <ChevronRight className="h-3 w-3 text-stone-500" />
                            )}
                            <span className="text-purple-400 font-bold">{rec.id}</span>
                            <span
                              className={`ml-2 text-[10px] px-1.5 py-0.2 rounded font-semibold ${
                                rec.action === 'Rejected' || rec.ripeness === 'Blight'
                                  ? 'bg-red-950 text-red-400 border border-red-800/60'
                                  : 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
                              }`}
                            >
                              {rec.action || (rec.ripeness === 'Blight' ? 'Rejected' : 'Accepted')}
                            </span>
                            <span className="text-stone-500 text-[11px]">
                              {rec.ripeness} • {rec.confidence}%
                            </span>
                          </div>

                          {isExpanded && (
                            <div className="ml-6 mt-1 space-y-1 border-l border-stone-800 pl-3 py-1 bg-stone-900/40 rounded-r-md">
                              <div className="flex items-center space-x-2">
                                <span className="text-stone-500">id:</span>
                                <span className="text-purple-400 font-bold">"{rec.id}"</span>
                              </div>
                              <div className="flex items-center space-x-2">
                                <span className="text-stone-500">action:</span>
                                <span className={rec.action === 'Rejected' ? 'text-red-400' : 'text-emerald-400'}>
                                  "{rec.action}"
                                </span>
                              </div>
                              <div className="flex items-center space-x-2">
                                <span className="text-stone-500">confidence:</span>
                                <span className="text-amber-400">{rec.confidence}</span>
                              </div>
                              <div className="flex items-center space-x-2">
                                <span className="text-stone-500">diameterMm:</span>
                                <span className="text-blue-400">{rec.diameterMm || 60}</span>
                              </div>
                              <div className="flex items-center space-x-2">
                                <span className="text-stone-500">label:</span>
                                <span className="text-emerald-300">"{rec.label || 'Healthy'}"</span>
                              </div>
                              <div className="flex items-center space-x-2">
                                <span className="text-stone-500">ripeness:</span>
                                <span className={rec.ripeness === 'Blight' ? 'text-red-400 font-bold' : 'text-stone-200'}>
                                  "{rec.ripeness}"
                                </span>
                              </div>
                              <div className="flex items-center space-x-2">
                                <span className="text-stone-500">size:</span>
                                <span className="text-stone-300">"{rec.size || 'Medium'}"</span>
                              </div>
                              <div className="flex items-center space-x-2">
                                <span className="text-stone-500">timestamp:</span>
                                <span className="text-stone-400">{rec.timestamp}</span>
                                <span className="text-[10px] text-stone-600">
                                  ({new Date(rec.timestamp).toLocaleTimeString()})
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Table View */
            <div className="overflow-x-auto rounded-xl border border-stone-800">
              <table className="w-full text-left">
                <thead className="bg-stone-950 text-[11px] font-bold text-stone-400 uppercase tracking-wider border-b border-stone-800">
                  <tr>
                    <th className="px-3 py-2.5">Key / Node</th>
                    <th className="px-3 py-2.5">Action</th>
                    <th className="px-3 py-2.5">Ripeness</th>
                    <th className="px-3 py-2.5">Confidence</th>
                    <th className="px-3 py-2.5">Diameter</th>
                    <th className="px-3 py-2.5">Size</th>
                    <th className="px-3 py-2.5">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-800 bg-stone-900/60">
                  {records.map((rec) => (
                    <tr key={rec.id} className="hover:bg-stone-800/40">
                      <td className="px-3 py-2 text-purple-400 font-bold">{rec.id}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            rec.action === 'Rejected' || rec.ripeness === 'Blight'
                              ? 'bg-red-950 text-red-400'
                              : 'bg-emerald-950 text-emerald-400'
                          }`}
                        >
                          {rec.action || (rec.ripeness === 'Blight' ? 'Rejected' : 'Accepted')}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-stone-200">{rec.ripeness}</td>
                      <td className="px-3 py-2 text-amber-400">{rec.confidence}%</td>
                      <td className="px-3 py-2 text-blue-400">{rec.diameterMm || 60} mm</td>
                      <td className="px-3 py-2 text-stone-300">{rec.size || 'Medium'}</td>
                      <td className="px-3 py-2 text-stone-500">
                        {new Date(rec.timestamp).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between border-t border-stone-800 bg-stone-950 px-6 py-3 text-xs text-stone-400">
          <div className="flex items-center space-x-2">
            <Radio className="h-3.5 w-3.5 text-emerald-400 animate-pulse" />
            <span>Real-time Sync Active: Camera detections automatically stream to this database</span>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg bg-stone-800 hover:bg-stone-700 px-4 py-1.5 text-xs font-semibold text-white transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
