/**
 * Firebase Realtime Database Integration for BlightDetect+
 * Database URL: https://blightdetect-4b3a6-default-rtdb.firebaseio.com/
 * Project: blightdetect-4b3a6
 */

export interface FirebaseRtdbRecord {
  id?: string;
  action: 'Accepted' | 'Rejected';
  confidence: number; // e.g. 94
  diameterMm: number; // e.g. 61
  label: 'Healthy' | 'Defective' | 'Blight';
  ripeness: 'Ripe' | 'Unripe' | 'Blight';
  size: 'Small' | 'Medium' | 'Large';
  className?: string;
  timestamp: number;
  createdAt?: number;
}

export const FIREBASE_RTDB_CONFIG = {
  databaseUrl: 'https://blightdetect-4b3a6-default-rtdb.firebaseio.com',
  projectId: 'blightdetect-4b3a6',
  detectionsPath: 'detections',
};

/**
 * Normalizes tomato classification into Firebase Realtime Database schema format
 */
export function formatTomatoForFirebase(event: {
  ripeness: 'ripe' | 'unripe' | 'blight';
  confidence: number;
  bbox?: { width: number; height: number };
  box?: { width: number; height: number };
  diameterMm?: number;
  size?: string;
  timestamp?: number;
}): FirebaseRtdbRecord {
  const isHealthy = event.ripeness === 'ripe' || event.ripeness === 'unripe';
  const confidencePercent = Math.round(
    event.confidence > 1 ? event.confidence : event.confidence * 100
  );

  const b = event.bbox || event.box;
  const avgDim = b ? (b.width + b.height) / 2 : 0.5;
  const estimatedDiameterMm =
    event.diameterMm || Math.round(Math.max(35, Math.min(95, avgDim * 85 + 25)));

  let size: 'Small' | 'Medium' | 'Large' = 'Medium';
  if (event.size) {
    const s = event.size.toLowerCase();
    size = s === 'small' ? 'Small' : s === 'large' ? 'Large' : 'Medium';
  } else {
    size = estimatedDiameterMm < 52 ? 'Small' : estimatedDiameterMm < 72 ? 'Medium' : 'Large';
  }

  const ripenessLabel: 'Ripe' | 'Unripe' | 'Blight' =
    event.ripeness === 'ripe' ? 'Ripe' : event.ripeness === 'unripe' ? 'Unripe' : 'Blight';

  const className =
    event.ripeness === 'ripe'
      ? 'ripe_tomato'
      : event.ripeness === 'unripe'
      ? 'unripe_tomato'
      : 'blighted_tomato';

  return {
    action: isHealthy ? 'Accepted' : 'Rejected',
    confidence: confidencePercent,
    diameterMm: estimatedDiameterMm,
    label: isHealthy ? 'Healthy' : 'Defective',
    ripeness: ripenessLabel,
    size,
    className,
    timestamp: event.timestamp || Date.now(),
    createdAt: Date.now(),
  };
}

/**
 * Generates official Firebase 20-character push ID
 */
export function generateFirebasePushId(): string {
  const PUSH_CHARS = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';
  let now = Date.now();
  const timeStampChars = new Array(8);
  for (let i = 7; i >= 0; i--) {
    timeStampChars[i] = PUSH_CHARS.charAt(now % 64);
    now = Math.floor(now / 64);
  }
  let id = timeStampChars.join('');
  for (let i = 0; i < 12; i++) {
    id += PUSH_CHARS.charAt(Math.floor(Math.random() * 64));
  }
  return id;
}

/**
 * Calculates the next structured ID matching the format:
 * -O1Healthy01, -O2Healthy02, -O3EarlyBlight01, ... -O8Healthy05, -O9Healthy06
 */
export async function getNextStructuredId(label: 'Healthy' | 'Defective' | 'Blight' | 'Early Blight' | 'Late Blight'): Promise<string> {
  try {
    const url = `${FIREBASE_RTDB_CONFIG.databaseUrl}/${FIREBASE_RTDB_CONFIG.detectionsPath}.json?shallow=true`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Shallow query failed');
    const data = await res.json();
    const keys: string[] = data ? Object.keys(data) : [];

    // Find all -O structured keys
    const oKeys = keys.filter((k) => /^-O\d+/i.test(k));
    
    let maxOverallIndex = 0;
    let categoryCount = 0;

    const normalizedCategory =
      label === 'Early Blight' || label === 'Late Blight' || label === 'Defective' || label === 'Blight'
        ? 'Blight'
        : 'Healthy';

    for (const key of oKeys) {
      const match = key.match(/^-O(\d+)([A-Za-z]+)(\d+)/i);
      if (match) {
        const overallIdx = parseInt(match[1], 10);
        const keyCat = match[2];
        const subIdx = parseInt(match[3], 10);
        if (overallIdx > maxOverallIndex) {
          maxOverallIndex = overallIdx;
        }
        if (keyCat.toLowerCase().includes(normalizedCategory.toLowerCase())) {
          if (subIdx > categoryCount) categoryCount = subIdx;
        }
      }
    }

    const nextOverall = maxOverallIndex + 1;
    const nextSub = categoryCount + 1;
    const tag = normalizedCategory === 'Healthy' ? 'Healthy' : 'EarlyBlight';
    const paddedSub = String(nextSub).padStart(2, '0');

    return `-O${nextOverall}${tag}${paddedSub}`;
  } catch (err) {
    // Fallback based on timestamp
    const now = new Date();
    const tag = label === 'Healthy' ? 'Healthy' : 'Defective';
    return `-O${now.getMinutes()}${now.getSeconds()}${tag}01`;
  }
}

/**
 * Pushes a new detection record to Firebase Realtime Database with a guaranteed matching id
 */
export async function sendDetectionToFirebaseRtdb(
  record: FirebaseRtdbRecord,
  customKey?: string,
  useStructuredId: boolean = true
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    let targetKey = customKey;

    if (!targetKey) {
      if (useStructuredId) {
        targetKey = await getNextStructuredId(
          record.label === 'Healthy' ? 'Healthy' : 'Early Blight'
        );
      } else {
        targetKey = generateFirebasePushId();
      }
    }

    // Always ensure the record's inner 'id' property matches the database node key
    const payload: FirebaseRtdbRecord = {
      ...record,
      id: targetKey,
    };

    const url = `${FIREBASE_RTDB_CONFIG.databaseUrl}/${FIREBASE_RTDB_CONFIG.detectionsPath}/${targetKey}.json`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`Firebase RTDB HTTP ${res.status}: ${res.statusText}`);
    }

    return { success: true, id: targetKey };
  } catch (err: any) {
    console.warn('Firebase RTDB write error:', err);
    return { success: false, error: err?.message || 'Failed to write to Firebase' };
  }
}

/**
 * Scans all existing records in Firebase and fixes any record that is missing its 'id' field,
 * or re-indexes any legacy '-P0...' keys into clean '-O1Healthy01' structured format.
 */
export async function fixAllMissingFirebaseIds(): Promise<{
  scanned: number;
  fixed: number;
  errors: number;
}> {
  try {
    const url = `${FIREBASE_RTDB_CONFIG.databaseUrl}/${FIREBASE_RTDB_CONFIG.detectionsPath}.json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Fetch failed with ${res.status}`);
    const data = await res.json();
    if (!data || typeof data !== 'object') {
      return { scanned: 0, fixed: 0, errors: 0 };
    }

    const entries = Object.entries(data);
    let fixed = 0;
    let errors = 0;

    for (const [key, val] of entries) {
      const record = val as any;
      // If legacy -P0 key found, convert to structured -O key
      if (key.startsWith('-P0')) {
        try {
          const newKey = await getNextStructuredId(
            record.label === 'Healthy' ? 'Healthy' : 'Early Blight'
          );
          const putRes = await fetch(
            `${FIREBASE_RTDB_CONFIG.databaseUrl}/${FIREBASE_RTDB_CONFIG.detectionsPath}/${newKey}.json`,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...record, id: newKey }),
            }
          );
          if (putRes.ok) {
            await fetch(
              `${FIREBASE_RTDB_CONFIG.databaseUrl}/${FIREBASE_RTDB_CONFIG.detectionsPath}/${key}.json`,
              { method: 'DELETE' }
            );
            fixed++;
          } else {
            errors++;
          }
        } catch {
          errors++;
        }
      } else if (!record.id || record.id !== key) {
        try {
          const patchRes = await fetch(
            `${FIREBASE_RTDB_CONFIG.databaseUrl}/${FIREBASE_RTDB_CONFIG.detectionsPath}/${key}.json`,
            {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: key }),
            }
          );
          if (patchRes.ok) {
            fixed++;
          } else {
            errors++;
          }
        } catch {
          errors++;
        }
      }
    }

    return { scanned: entries.length, fixed, errors };
  } catch (e) {
    console.error('Failed to fix database IDs:', e);
    return { scanned: 0, fixed: 0, errors: 1 };
  }
}

/**
 * Fetches the latest detection records from Firebase Realtime Database
 */
export async function fetchRecentFirebaseDetections(
  limit: number = 30
): Promise<{ success: boolean; records: FirebaseRtdbRecord[]; totalCount: number }> {
  try {
    const url = `${FIREBASE_RTDB_CONFIG.databaseUrl}/${FIREBASE_RTDB_CONFIG.detectionsPath}.json?limitToLast=${limit}&orderBy="$key"`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Firebase RTDB HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    if (!data || typeof data !== 'object') {
      return { success: true, records: [], totalCount: 0 };
    }

    // Fetch total shallow count to know real database size
    let totalCount = 0;
    try {
      const shallowRes = await fetch(
        `${FIREBASE_RTDB_CONFIG.databaseUrl}/${FIREBASE_RTDB_CONFIG.detectionsPath}.json?shallow=true`
      );
      if (shallowRes.ok) {
        const shallowData = await shallowRes.json();
        if (shallowData) totalCount = Object.keys(shallowData).length;
      }
    } catch {
      // Fallback
    }

    const entries = Object.entries(data);
    if (totalCount === 0) totalCount = entries.length;

    // Convert keys to array and sort chronologically (newest first)
    const records: FirebaseRtdbRecord[] = entries
      .map(([key, val]: [string, any]) => ({
        id: key,
        ...val,
        timestamp: val.timestamp || val.createdAt || Date.now(),
      }))
      .sort((a, b) => {
        // First sort by timestamp if different
        const diff = (b.timestamp || 0) - (a.timestamp || 0);
        if (diff !== 0) return diff;
        // Otherwise sort by numerical ID in -O{N}
        const numA = parseInt((a.id || '').replace(/^-O(\d+).*/, '$1'), 10) || 0;
        const numB = parseInt((b.id || '').replace(/^-O(\d+).*/, '$1'), 10) || 0;
        return numB - numA;
      });

    return { success: true, records, totalCount };
  } catch (err) {
    console.warn('Firebase RTDB fetch error:', err);
    return { success: false, records: [], totalCount: 0 };
  }
}

/**
 * Checks connectivity and returns database metadata
 */
export async function testFirebaseRtdbConnection(): Promise<{
  connected: boolean;
  itemCount: number;
  latencyMs: number;
  databaseUrl: string;
}> {
  const start = performance.now();
  try {
    const url = `${FIREBASE_RTDB_CONFIG.databaseUrl}/${FIREBASE_RTDB_CONFIG.detectionsPath}.json?shallow=true`;
    const res = await fetch(url);
    const latencyMs = Math.round(performance.now() - start);

    if (!res.ok) {
      return {
        connected: false,
        itemCount: 0,
        latencyMs,
        databaseUrl: FIREBASE_RTDB_CONFIG.databaseUrl,
      };
    }

    const data = await res.json();
    const count = data && typeof data === 'object' ? Object.keys(data).length : 0;

    return {
      connected: true,
      itemCount: count,
      latencyMs,
      databaseUrl: FIREBASE_RTDB_CONFIG.databaseUrl,
    };
  } catch {
    return {
      connected: false,
      itemCount: 0,
      latencyMs: Math.round(performance.now() - start),
      databaseUrl: FIREBASE_RTDB_CONFIG.databaseUrl,
    };
  }
}
