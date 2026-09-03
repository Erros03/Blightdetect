/**
 * Hook to manage the active tomato detection session with auto-save persistence
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import type {
  DetectionSession,
  TomatoDetectionEvent,
  TomatoSessionCounts,
} from '../types.ts';
import {
  createDetectionSession,
  updateSessionCounts,
  finalizeDetectionSession,
  saveUniqueTomatoEvent,
} from '../lib/detection-sessions.ts';
import {
  useAutoSaveSessionStats,
  getStoredSessionStats,
  clearStoredSessionStats,
} from './useAutoSaveSessionStats.ts';

export function useDetectionSession() {
  // Initialize state with stored snapshot if available (persists through refresh)
  const initialSnapshot = getStoredSessionStats();

  const [session, setSession] = useState<DetectionSession | null>(() => {
    return initialSnapshot?.session ?? null;
  });

  const [counts, setCounts] = useState<TomatoSessionCounts>(() => {
    return initialSnapshot?.counts ?? {
      ripe: 0,
      unripe: 0,
      blight: 0,
      total: 0,
    };
  });

  const [recentEvents, setRecentEvents] = useState<TomatoDetectionEvent[]>(() => {
    return initialSnapshot?.recentEvents ?? [];
  });

  const [isSessionActive, setIsSessionActive] = useState<boolean>(() => {
    return initialSnapshot?.isActive ?? Boolean(initialSnapshot?.session);
  });

  const sessionRef = useRef<DetectionSession | null>(session);
  const countsRef = useRef<TomatoSessionCounts>(counts);
  const isCreatingRef = useRef<boolean>(false);

  // Synchronize ref
  useEffect(() => {
    countsRef.current = counts;
  }, [counts]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  // Hook to periodically auto-save active session stats to localStorage
  const { lastSavedAt, isSaving, forceSave } = useAutoSaveSessionStats({
    session,
    counts,
    recentEvents,
    isActive: isSessionActive,
    intervalMs: 2500, // Periodically auto-save every 2.5 seconds
    enabled: true,
  });

  // Start / initialize a fresh session (all counters 0)
  const startNewSession = useCallback(async () => {
    if (isCreatingRef.current) return;
    isCreatingRef.current = true;

    try {
      const newSession = await createDetectionSession();
      setSession(newSession);
      sessionRef.current = newSession;

      const initialCounts: TomatoSessionCounts = {
        ripe: 0,
        unripe: 0,
        blight: 0,
        total: 0,
      };
      setCounts(initialCounts);
      countsRef.current = initialCounts;
      setRecentEvents([]);
      setIsSessionActive(true);
    } catch (e) {
      console.error('Failed to start new detection session:', e);
    } finally {
      isCreatingRef.current = false;
    }
  }, []);

  // Handle a new unique tomato detected by the tracker
  const recordUniqueTomato = useCallback((event: TomatoDetectionEvent) => {
    setCounts((prev) => {
      const updated: TomatoSessionCounts = {
        ripe: prev.ripe + (event.ripeness === 'ripe' ? 1 : 0),
        unripe: prev.unripe + (event.ripeness === 'unripe' ? 1 : 0),
        blight: prev.blight + (event.ripeness === 'blight' ? 1 : 0),
        total: prev.total + 1,
      };
      countsRef.current = updated;

      // Update Firestore / persistence
      if (sessionRef.current) {
        updateSessionCounts(sessionRef.current.id, updated).catch(console.warn);
      }

      return updated;
    });

    setRecentEvents((prev) => [event, ...prev.slice(0, 49)]);

    // Save individual tomato event
    saveUniqueTomatoEvent(event).catch(console.warn);
  }, []);

  // Finalize session on stop or leave
  const endSession = useCallback(async () => {
    if (!sessionRef.current || !isSessionActive) return;
    const currentSessId = sessionRef.current.id;
    const finalCounts = countsRef.current;

    setIsSessionActive(false);
    clearStoredSessionStats();

    try {
      const completed = await finalizeDetectionSession(currentSessId, finalCounts);
      if (completed) {
        setSession(completed);
      }
    } catch (e) {
      console.error('Failed to finalize detection session:', e);
    }
  }, [isSessionActive]);

  return {
    session,
    counts,
    recentEvents,
    isSessionActive,
    lastSavedAt,
    isSaving,
    startNewSession,
    recordUniqueTomato,
    endSession,
    forceSave,
    setCounts,
  };
}
