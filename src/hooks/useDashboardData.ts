/**
 * Hook for Dashboard Data & Metrics
 * Preserves permanent historical sessions and tracks current live session
 */
import { useState, useEffect, useCallback } from 'react';
import type { DetectionSession, TomatoDetectionEvent, TomatoSessionCounts } from '../types.ts';
import { getHistoricalSessions, getRecentTomatoEvents } from '../lib/detection-sessions.ts';
import { calculateMetrics, type DashboardMetrics } from '../lib/dashboard-data.ts';

export function useDashboardData(currentCounts: TomatoSessionCounts, liveEvents: TomatoDetectionEvent[]) {
  const [historicalSessions, setHistoricalSessions] = useState<DetectionSession[]>([]);
  const [recentDetections, setRecentDetections] = useState<TomatoDetectionEvent[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Load history from permanent storage without wiping detection_sessions
  const refreshHistory = useCallback(async () => {
    try {
      const [sessions, events] = await Promise.all([
        getHistoricalSessions(),
        getRecentTomatoEvents(),
      ]);
      setHistoricalSessions(sessions);
      setRecentDetections(events);
    } catch (e) {
      console.error('Error fetching dashboard data:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshHistory();
  }, [refreshHistory]);

  // Combine live session events with stored recent detections
  const combinedEvents = [...liveEvents, ...recentDetections.filter(d => !liveEvents.some(le => le.id === d.id))].slice(0, 50);

  const metrics: DashboardMetrics = calculateMetrics(currentCounts, historicalSessions, combinedEvents);

  return {
    metrics,
    historicalSessions,
    recentDetections: combinedEvents,
    isLoading,
    refreshHistory,
  };
}
