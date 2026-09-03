/**
 * Session Lifecycle and Firestore / Persistent Storage Operations
 */
import {
  getFirestoreDb,
  isFirebaseConfigured,
} from './firebase-config.ts';
import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  query,
  orderBy,
  limit,
  STORAGE_KEYS,
} from './firebase.ts';
import type {
  DetectionSession,
  TomatoDetectionEvent,
  TomatoSessionCounts,
  TomatoRipeness,
} from '../types.ts';
import {
  formatTomatoForFirebase,
  sendDetectionToFirebaseRtdb,
  fetchRecentFirebaseDetections,
} from './firebase-rtdb.ts';

/**
 * Format today's date YYYY-MM-DD
 */
export function getFormattedDate(): string {
  const d = new Date();
  return d.toISOString().split('T')[0];
}

/**
 * Format current time HH:MM:SS
 */
export function getFormattedTime(): string {
  const d = new Date();
  return d.toTimeString().split(' ')[0];
}

/**
 * Creates a brand new DetectionSession with zeroed counters
 */
export async function createDetectionSession(): Promise<DetectionSession> {
  const now = Date.now();
  const sessionId = `session-${now}-${Math.random().toString(36).substring(2, 7)}`;
  
  const newSession: DetectionSession = {
    id: sessionId,
    date: getFormattedDate(),
    startTime: getFormattedTime(),
    createdAt: now,
    ripeCount: 0,
    unripeCount: 0,
    blightCount: 0,
    totalCount: 0,
    status: 'active',
  };

  // Persist locally as active session
  try {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_SESSION, JSON.stringify(newSession));
  } catch (e) {
    console.warn('Could not save active session to localStorage:', e);
  }

  // Persist to Firestore if available
  const db = getFirestoreDb();
  if (db && isFirebaseConfigured()) {
    try {
      const sessionRef = doc(db, 'detection_sessions', sessionId);
      await setDoc(sessionRef, newSession);
    } catch (e) {
      console.warn('Firestore create session error:', e);
    }
  }

  return newSession;
}

/**
 * Updates counts for an active session
 */
export async function updateSessionCounts(
  sessionId: string,
  counts: TomatoSessionCounts
): Promise<void> {
  const blightPercentage =
    counts.total > 0
      ? Number(((counts.blight / counts.total) * 100).toFixed(1))
      : 0;

  // Update localStorage active session
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ACTIVE_SESSION);
    if (raw) {
      const sess: DetectionSession = JSON.parse(raw);
      if (sess.id === sessionId) {
        sess.ripeCount = counts.ripe;
        sess.unripeCount = counts.unripe;
        sess.blightCount = counts.blight;
        sess.totalCount = counts.total;
        sess.blightPercentage = blightPercentage;
        localStorage.setItem(STORAGE_KEYS.ACTIVE_SESSION, JSON.stringify(sess));
      }
    }
  } catch (e) {
    console.warn('LocalStorage session update error:', e);
  }

  // Update in Firestore
  const db = getFirestoreDb();
  if (db && isFirebaseConfigured()) {
    try {
      const sessionRef = doc(db, 'detection_sessions', sessionId);
      await setDoc(
        sessionRef,
        {
          ripeCount: counts.ripe,
          unripeCount: counts.unripe,
          blightCount: counts.blight,
          totalCount: counts.total,
          blightPercentage,
        },
        { merge: true }
      );
    } catch (e) {
      console.warn('Firestore session update error:', e);
    }
  }
}

/**
 * Finalizes and saves a completed session permanently to detection_sessions
 */
export async function finalizeDetectionSession(
  sessionId: string,
  counts: TomatoSessionCounts
): Promise<DetectionSession | null> {
  const now = Date.now();
  let sessionToSave: DetectionSession | null = null;

  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ACTIVE_SESSION);
    if (raw) {
      const active: DetectionSession = JSON.parse(raw);
      if (active.id === sessionId) {
        sessionToSave = active;
      }
    }
  } catch (e) {
    console.warn('LocalStorage read error:', e);
  }

  if (!sessionToSave) {
    sessionToSave = {
      id: sessionId,
      date: getFormattedDate(),
      startTime: getFormattedTime(),
      createdAt: now - 60000,
      ripeCount: counts.ripe,
      unripeCount: counts.unripe,
      blightCount: counts.blight,
      totalCount: counts.total,
      status: 'completed',
    };
  }

  const durationSec = Math.max(1, Math.round((now - sessionToSave.createdAt) / 1000));
  const blightPercentage =
    counts.total > 0
      ? Number(((counts.blight / counts.total) * 100).toFixed(1))
      : 0;

  sessionToSave.status = 'completed';
  sessionToSave.endTime = getFormattedTime();
  sessionToSave.endedAt = now;
  sessionToSave.durationSeconds = durationSec;
  sessionToSave.ripeCount = counts.ripe;
  sessionToSave.unripeCount = counts.unripe;
  sessionToSave.blightCount = counts.blight;
  sessionToSave.totalCount = counts.total;
  sessionToSave.blightPercentage = blightPercentage;

  // Save to permanent sessions history in localStorage
  try {
    const rawSessions = localStorage.getItem(STORAGE_KEYS.SESSIONS);
    const sessions: DetectionSession[] = rawSessions ? JSON.parse(rawSessions) : [];
    
    // Remove if previously existing, then prepend
    const filtered = sessions.filter((s) => s.id !== sessionId);
    filtered.unshift(sessionToSave);
    localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(filtered));

    // Clear active session pointer
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_SESSION);
  } catch (e) {
    console.warn('LocalStorage save history error:', e);
  }

  // Save to Firestore
  const db = getFirestoreDb();
  if (db && isFirebaseConfigured()) {
    try {
      const sessionRef = doc(db, 'detection_sessions', sessionId);
      await setDoc(sessionRef, sessionToSave, { merge: true });
    } catch (e) {
      console.warn('Firestore finalize session error:', e);
    }
  }

  return sessionToSave;
}

/**
 * Saves a single unique tomato detection event (1 event per physical tomato counted)
 */
export async function saveUniqueTomatoEvent(event: TomatoDetectionEvent): Promise<void> {
  // Save to localStorage
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DETECTIONS);
    const detections: TomatoDetectionEvent[] = raw ? JSON.parse(raw) : [];
    detections.unshift(event);
    // Keep max 500 recent events in local buffer
    if (detections.length > 500) detections.length = 500;
    localStorage.setItem(STORAGE_KEYS.DETECTIONS, JSON.stringify(detections));
  } catch (e) {
    console.warn('LocalStorage save tomato event error:', e);
  }

  // Save to Firestore if configured
  const db = getFirestoreDb();
  if (db && isFirebaseConfigured()) {
    try {
      const detRef = doc(db, 'detections', event.id);
      await setDoc(detRef, event);
    } catch (e) {
      console.warn('Firestore save tomato event error:', e);
    }
  }

  // Save to Firebase Realtime Database (blightdetect-4b3a6-default-rtdb)
  try {
    const rtdbRecord = formatTomatoForFirebase({
      ripeness: event.ripeness,
      confidence: event.confidence,
      bbox: event.bbox,
      diameterMm: event.diameterMm,
      size: event.size,
      timestamp: event.timestamp,
    });
    await sendDetectionToFirebaseRtdb(rtdbRecord);
  } catch (rtdbErr) {
    console.warn('Firebase RTDB sync warning:', rtdbErr);
  }
}

/**
 * Fetches all permanent historical detection sessions
 */
export async function getHistoricalSessions(): Promise<DetectionSession[]> {
  const db = getFirestoreDb();

  // Try Firestore first if configured
  if (db && isFirebaseConfigured()) {
    try {
      const q = query(
        collection(db, 'detection_sessions'),
        orderBy('createdAt', 'desc'),
        limit(50)
      );
      const snapshot = await getDocs(q);
      const sessions: DetectionSession[] = [];
      snapshot.forEach((docSnap) => {
        sessions.push(docSnap.data() as DetectionSession);
      });
      if (sessions.length > 0) {
        return sessions;
      }
    } catch (e) {
      console.warn('Firestore fetch historical sessions fallback to localStorage:', e);
    }
  }

  // Fallback to localStorage permanent history
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SESSIONS);
    if (raw) {
      const list: DetectionSession[] = JSON.parse(raw);
      return list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    }
  } catch (e) {
    console.warn('LocalStorage read sessions error:', e);
  }

  return [];
}

/**
 * Fetches detection events (optionally filtered by sessionId)
 */
export async function getRecentTomatoEvents(sessionId?: string): Promise<TomatoDetectionEvent[]> {
  const db = getFirestoreDb();

  if (db && isFirebaseConfigured()) {
    try {
      const q = query(
        collection(db, 'detections'),
        orderBy('timestamp', 'desc'),
        limit(100)
      );
      const snapshot = await getDocs(q);
      const events: TomatoDetectionEvent[] = [];
      snapshot.forEach((docSnap) => {
        events.push(docSnap.data() as TomatoDetectionEvent);
      });
      if (sessionId) {
        return events.filter((e) => e.sessionId === sessionId);
      }
      return events;
    } catch (e) {
      console.warn('Firestore fetch events fallback:', e);
    }
  }

  // Fetch real live records from Firebase Realtime Database
  try {
    const rtdbRes = await fetchRecentFirebaseDetections(50);
    if (rtdbRes.success && rtdbRes.records.length > 0) {
      const events: TomatoDetectionEvent[] = rtdbRes.records.map((r, i) => {
        const isBlight =
          r.label?.toLowerCase().includes('blight') ||
          r.ripeness?.toLowerCase().includes('blight') ||
          r.action === 'Rejected';
        const isUnripe = r.ripeness === 'Unripe';
        const ripeness: TomatoRipeness = isBlight ? 'blight' : isUnripe ? 'unripe' : 'ripe';
        const ts = r.timestamp || r.createdAt || Date.now();

        return {
          id: r.id || `rtdb-${i}`,
          sessionId: sessionId || 'session-rtdb',
          timestamp: ts,
          createdAt: new Date(ts).toISOString(),
          class: r.className || (isBlight ? 'blighted_tomato' : 'ripe_tomato'),
          ripeness,
          confidence: (r.confidence || 90) / 100,
          size: (r.size?.toLowerCase() || 'medium') as any,
          diameterMm: r.diameterMm || 60,
          bbox: { x: 320, y: 240, width: 100, height: 100 },
          trackId: i + 1,
        };
      });

      if (sessionId) {
        return events.filter((e) => e.sessionId === sessionId);
      }
      return events;
    }
  } catch (e) {
    console.warn('RTDB fetch events fallback to localStorage:', e);
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DETECTIONS);
    if (raw) {
      const events: TomatoDetectionEvent[] = JSON.parse(raw);
      if (sessionId) {
        return events.filter((e) => e.sessionId === sessionId);
      }
      return events;
    }
  } catch (e) {
    console.warn('LocalStorage read detections error:', e);
  }

  return [];
}
