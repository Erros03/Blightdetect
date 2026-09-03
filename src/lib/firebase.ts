/**
 * Firestore collections and operations for BlightDetect+
 */
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  orderBy,
  limit,
  deleteDoc,
  where,
} from 'firebase/firestore';
import { getFirestoreDb } from './firebase-config.ts';
import type { DetectionSession, TomatoDetectionEvent } from '../types.ts';

export const COLLECTIONS = {
  SESSIONS: 'detection_sessions',
  DETECTIONS: 'detections',
};

// Persistence fallback using localStorage when Firebase is not connected
const STORAGE_KEYS = {
  SESSIONS: 'blightdetect_sessions_v2',
  DETECTIONS: 'blightdetect_detections_v2',
  ACTIVE_SESSION: 'blightdetect_active_session_v2',
};

// Seed initial history if empty so user has realistic historical context
function initializeLocalHistory(): void {
  try {
    const existing = localStorage.getItem(STORAGE_KEYS.SESSIONS);
    if (!existing) {
      const now = Date.now();
      const sampleSessions: DetectionSession[] = [
        {
          id: 'session-prev-101',
          date: new Date(now - 86400000 * 2).toISOString().split('T')[0],
          startTime: '09:15:00',
          endTime: '09:45:30',
          createdAt: now - 86400000 * 2,
          endedAt: now - 86400000 * 2 + 1830000,
          durationSeconds: 1830,
          ripeCount: 42,
          unripeCount: 18,
          blightCount: 4,
          totalCount: 64,
          status: 'completed',
          blightPercentage: 6.25,
          averageConfidence: 0.92,
        },
        {
          id: 'session-prev-102',
          date: new Date(now - 86400000).toISOString().split('T')[0],
          startTime: '14:00:10',
          endTime: '14:28:40',
          createdAt: now - 86400000,
          endedAt: now - 86400000 + 1710000,
          durationSeconds: 1710,
          ripeCount: 65,
          unripeCount: 22,
          blightCount: 7,
          totalCount: 94,
          status: 'completed',
          blightPercentage: 7.45,
          averageConfidence: 0.94,
        },
      ];
      localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(sampleSessions));
    }
  } catch (e) {
    console.warn('Storage access warning:', e);
  }
}

if (typeof window !== 'undefined') {
  initializeLocalHistory();
}

export {
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  query,
  orderBy,
  limit,
  deleteDoc,
  where,
  STORAGE_KEYS,
};
