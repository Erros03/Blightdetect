/**
 * Dashboard & Yield Monitoring Data Analytics
 */
import type {
  DetectionSession,
  TomatoDetectionEvent,
  TomatoSessionCounts,
} from '../types.ts';

export interface DashboardMetrics {
  currentSession: TomatoSessionCounts;
  blightRatePercent: number;
  qualityScore: number;
  estimatedYieldKg: number;
  harvestReadinessPercent: number;
  totalHistoricalSessionsCount: number;
  lifetimeTomatoesCounted: number;
  averageSessionBlightRate: number;
}

export function calculateMetrics(
  currentCounts: TomatoSessionCounts,
  history: DetectionSession[],
  recentEvents: TomatoDetectionEvent[]
): DashboardMetrics {
  const total = currentCounts.total;
  const blightRatePercent = total > 0 ? Number(((currentCounts.blight / total) * 100).toFixed(1)) : 0;
  const ripeRate = total > 0 ? (currentCounts.ripe / total) : 0;
  
  // Quality Score (0 - 100)
  const qualityScore = total > 0
    ? Math.max(0, Math.min(100, Math.round(100 - (blightRatePercent * 2.5) - ((currentCounts.unripe / total) * 20))))
    : 100;

  // Commercial slicing standard weight basis:
  // Medium: 60-75mm (2.5-3.0 in), 110-170g (4-6 oz)
  // Small: <60mm (<2.5 in), <110g (<4 oz)
  // Large: >75mm (>3.0 in), >170g (>6 oz)
  let estimatedYieldKg = 0;
  if (recentEvents.length > 0) {
    estimatedYieldKg = recentEvents.reduce((acc, ev) => {
      if (ev.weightGrams) {
        return acc + ev.weightGrams / 1000;
      }
      if (ev.size === 'small') return acc + 0.085;
      if (ev.size === 'medium') return acc + 0.140;
      return acc + 0.205;
    }, 0);
  } else {
    estimatedYieldKg = total * 0.14; // Default medium slicing tomato basis (~140g)
  }
  estimatedYieldKg = Number(estimatedYieldKg.toFixed(2));

  const harvestReadinessPercent = total > 0 ? Math.round(ripeRate * 100) : 0;

  // Lifetime aggregates from completed historical sessions
  const lifetimeTomatoes = history.reduce((sum, s) => sum + (s.totalCount || 0), 0) + total;
  const lifetimeBlight = history.reduce((sum, s) => sum + (s.blightCount || 0), 0) + currentCounts.blight;
  const averageSessionBlightRate = lifetimeTomatoes > 0
    ? Number(((lifetimeBlight / lifetimeTomatoes) * 100).toFixed(1))
    : 0;

  return {
    currentSession: currentCounts,
    blightRatePercent,
    qualityScore,
    estimatedYieldKg,
    harvestReadinessPercent,
    totalHistoricalSessionsCount: history.length,
    lifetimeTomatoesCounted: lifetimeTomatoes,
    averageSessionBlightRate,
  };
}

export function getSizeDistribution(events: TomatoDetectionEvent[]) {
  const dist = {
    small: 0,
    medium: 0,
    large: 0,
  };

  events.forEach((e) => {
    if (e.size in dist) {
      dist[e.size as keyof typeof dist]++;
    }
  });

  return [
    { name: 'Small (<60mm / <4 oz)', count: dist.small, color: '#f59e0b' },
    { name: 'Medium (60-75mm / 4-6 oz)', count: dist.medium, color: '#10b981' },
    { name: 'Large (>75mm / >6 oz)', count: dist.large, color: '#3b82f6' },
  ];
}
