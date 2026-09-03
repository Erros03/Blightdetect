import { useEffect, useRef, useState, useCallback } from 'react';
import type { DetectionSession, TomatoDetectionEvent, TomatoSessionCounts } from '../types.ts';

export const SESSION_AUTO_SAVE_KEY = 'blightdetect_active_session_stats_v1';
export const SESSION_ACTIVE_KEY = 'blightdetect_active_session_v2';

export interface SavedSessionSnapshot {
  session: DetectionSession | null;
  counts: TomatoSessionCounts;
  recentEvents?: TomatoDetectionEvent[];
  lastSavedAt: number;
  isActive: boolean;
}

export interface AutoSaveOptions {
  session: DetectionSession | null;
  counts: TomatoSessionCounts;
  recentEvents?: TomatoDetectionEvent[];
  isActive?: boolean;
  intervalMs?: number;
  enabled?: boolean;
  onAutoSave?: (snapshot: SavedSessionSnapshot) => void;
}

/**
 * Utility to retrieve saved session snapshot from localStorage
 */
export function getStoredSessionStats(): SavedSessionSnapshot | null {
  try {
    const raw = localStorage.getItem(SESSION_AUTO_SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedSessionSnapshot;
    return parsed;
  } catch (err) {
    console.warn('[useAutoSaveSessionStats] Failed to parse saved session from localStorage:', err);
    return null;
  }
}

/**
 * Utility to clear the auto-saved session snapshot from localStorage
 */
export function clearStoredSessionStats(): void {
  try {
    localStorage.removeItem(SESSION_AUTO_SAVE_KEY);
  } catch (err) {
    console.warn('[useAutoSaveSessionStats] Failed to clear saved session from localStorage:', err);
  }
}

/**
 * Custom hook to periodically auto-save current detection session stats to localStorage
 * so that state and counts persist even if the browser tab or page is refreshed.
 */
export function useAutoSaveSessionStats({
  session,
  counts,
  recentEvents = [],
  isActive = false,
  intervalMs = 3000,
  enabled = true,
  onAutoSave,
}: AutoSaveOptions) {
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Store latest values in refs to avoid interval teardowns
  const sessionRef = useRef(session);
  const countsRef = useRef(counts);
  const eventsRef = useRef(recentEvents);
  const isActiveRef = useRef(isActive);
  const lastSavedHashRef = useRef<string>('');

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    countsRef.current = counts;
  }, [counts]);

  useEffect(() => {
    eventsRef.current = recentEvents;
  }, [recentEvents]);

  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  // Core save function
  const saveSnapshotToStorage = useCallback((): boolean => {
    const currentSession = sessionRef.current;
    const currentCounts = countsRef.current;
    const currentEvents = eventsRef.current;
    const currentlyActive = isActiveRef.current;

    // Only save if there is an active session or non-zero counts
    if (!currentSession && currentCounts.total === 0 && !currentlyActive) {
      return false;
    }

    // Quick hash comparison to skip redundant writes
    const stateHash = JSON.stringify({
      id: currentSession?.id,
      r: currentCounts.ripe,
      u: currentCounts.unripe,
      b: currentCounts.blight,
      t: currentCounts.total,
      eLen: currentEvents.length,
      act: currentlyActive,
    });

    if (stateHash === lastSavedHashRef.current) {
      return false;
    }

    try {
      setIsSaving(true);
      const now = Date.now();
      const snapshot: SavedSessionSnapshot = {
        session: currentSession,
        counts: currentCounts,
        recentEvents: currentEvents.slice(0, 50),
        lastSavedAt: now,
        isActive: currentlyActive,
      };

      // Save primary stats snapshot
      localStorage.setItem(SESSION_AUTO_SAVE_KEY, JSON.stringify(snapshot));

      // Also ensure active session object is synced
      if (currentSession) {
        localStorage.setItem(SESSION_ACTIVE_KEY, JSON.stringify(currentSession));
      }

      lastSavedHashRef.current = stateHash;
      setLastSavedAt(now);
      if (onAutoSave) {
        onAutoSave(snapshot);
      }
      return true;
    } catch (err) {
      console.warn('[useAutoSaveSessionStats] Failed to save session stats to localStorage:', err);
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [onAutoSave]);

  // Periodic interval auto-save
  useEffect(() => {
    if (!enabled) return;

    const intervalId = window.setInterval(() => {
      saveSnapshotToStorage();
    }, intervalMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [enabled, intervalMs, saveSnapshotToStorage]);

  // Immediate save on page visibility change / tab blur / unload
  useEffect(() => {
    if (!enabled) return;

    const handleBeforeUnload = () => {
      saveSnapshotToStorage();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        saveSnapshotToStorage();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, saveSnapshotToStorage]);

  return {
    lastSavedAt,
    isSaving,
    forceSave: saveSnapshotToStorage,
    clearSavedStats: clearStoredSessionStats,
  };
}
