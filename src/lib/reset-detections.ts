/**
 * Safe Live-State Reset Utility
 * 
 * IMPORTANT: This clears ONLY temporary live stream buffers or in-memory caches.
 * It NEVER deletes permanent historical records in `detection_sessions`.
 */
import { STORAGE_KEYS } from './firebase.ts';

export async function resetLiveSessionBuffer(): Promise<void> {
  try {
    // Clear active session pointer so a fresh session starts at 0
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_SESSION);
    // Note: Do NOT remove STORAGE_KEYS.SESSIONS! Permanent history is preserved.
  } catch (e) {
    console.warn('Reset live buffer error:', e);
  }
}
