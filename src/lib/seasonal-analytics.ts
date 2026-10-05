/**
 * Seasonal & Annual Yield Analytics
 * Grouping, metrics computation, peak season insights, YoY charts, and CSV exporting
 */
import type { DetectionSession } from '../types.ts';

export type SeasonGroupingMode = 'agri' | 'quarterly';

export interface SeasonalAggregate {
  id: string; // e.g. "2025-dry" or "2025-Q1"
  year: number;
  seasonKey: string; // "dry" | "wet" | "Q1" | "Q2" | "Q3" | "Q4"
  seasonName: string; // e.g. "Dry / Summer Season"
  seasonShort: string; // e.g. "Dry", "Wet", "Q1"
  sessionCount: number;
  totalCount: number;
  ripeCount: number;
  unripeCount: number;
  blightCount: number;
  estimatedWeightKg: number;
  blightRatePercent: number;
  ripeRatePercent: number;
  qualityScore: number;
  sessions: DetectionSession[];
}

export interface PeakSeasonInsights {
  peakProduction: SeasonalAggregate | null;
  lowestDefect: SeasonalAggregate | null;
  highestQuality: SeasonalAggregate | null;
  totalVolumeAllTime: number;
  totalWeightAllTimeKg: number;
  totalSessionsCount: number;
  overallBlightRate: number;
  yearsTracked: number[];
  yoyVolumeGrowth?: {
    prevYear: number;
    currentYear: number;
    growthPercent: number;
  };
}

/**
 * Identify year and season for any date string (YYYY-MM-DD) or timestamp
 */
export function getSeasonDetails(
  dateStrOrTs: string | number,
  mode: SeasonGroupingMode = 'agri'
): { year: number; seasonKey: string; seasonName: string; seasonShort: string } {
  let date: Date;
  if (typeof dateStrOrTs === 'number') {
    date = new Date(dateStrOrTs);
  } else if (typeof dateStrOrTs === 'string' && dateStrOrTs.includes('-')) {
    const parts = dateStrOrTs.split('-');
    date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]) || 1);
  } else {
    date = new Date();
  }

  const year = date.getFullYear() || 2026;
  const month = date.getMonth() + 1; // 1 to 12

  if (mode === 'quarterly') {
    if (month >= 1 && month <= 3) {
      return { year, seasonKey: 'Q1', seasonName: 'Q1 (Jan–Mar / Early Harvest)', seasonShort: 'Q1' };
    } else if (month >= 4 && month <= 6) {
      return { year, seasonKey: 'Q2', seasonName: 'Q2 (Apr–Jun / Mid-Year Flush)', seasonShort: 'Q2' };
    } else if (month >= 7 && month <= 9) {
      return { year, seasonKey: 'Q3', seasonName: 'Q3 (Jul–Sep / Monsoon Crop)', seasonShort: 'Q3' };
    } else {
      return { year, seasonKey: 'Q4', seasonName: 'Q4 (Oct–Dec / Late Harvest)', seasonShort: 'Q4' };
    }
  }

  // Agricultural Season (Dry vs. Wet Season)
  // Dry / Summer Season: Nov - Apr (Months 11, 12, 1, 2, 3, 4)
  // Wet / Rainy Season: May - Oct (Months 5, 6, 7, 8, 9, 10)
  if (month >= 5 && month <= 10) {
    return {
      year,
      seasonKey: 'wet',
      seasonName: 'Wet / Rainy Season (May–Oct)',
      seasonShort: 'Wet Season',
    };
  } else {
    return {
      year,
      seasonKey: 'dry',
      seasonName: 'Dry / Summer Season (Nov–Apr)',
      seasonShort: 'Dry Season',
    };
  }
}

/**
 * Group historical detection sessions automatically by Year and Season
 */
export function groupSessionsBySeason(
  sessions: DetectionSession[],
  mode: SeasonGroupingMode = 'agri'
): SeasonalAggregate[] {
  if (!sessions || sessions.length === 0) return [];

  const map = new Map<string, SeasonalAggregate>();

  sessions.forEach((session) => {
    const { year, seasonKey, seasonName, seasonShort } = getSeasonDetails(
      session.date || session.createdAt,
      mode
    );

    const aggId = `${year}-${seasonKey}`;

    if (!map.has(aggId)) {
      map.set(aggId, {
        id: aggId,
        year,
        seasonKey,
        seasonName,
        seasonShort,
        sessionCount: 0,
        totalCount: 0,
        ripeCount: 0,
        unripeCount: 0,
        blightCount: 0,
        estimatedWeightKg: 0,
        blightRatePercent: 0,
        ripeRatePercent: 0,
        qualityScore: 100,
        sessions: [],
      });
    }

    const agg = map.get(aggId)!;
    agg.sessionCount += 1;
    agg.totalCount += session.totalCount || 0;
    agg.ripeCount += session.ripeCount || 0;
    agg.unripeCount += session.unripeCount || 0;
    agg.blightCount += session.blightCount || 0;
    agg.sessions.push(session);
  });

  // Calculate percentage rates and market quality index
  const results = Array.from(map.values()).map((agg) => {
    const total = agg.totalCount;
    const blightRatePercent =
      total > 0 ? Number(((agg.blightCount / total) * 100).toFixed(1)) : 0;
    const ripeRatePercent =
      total > 0 ? Number(((agg.ripeCount / total) * 100).toFixed(1)) : 0;

    // Market Quality Index: 100 - (blight% * 2.5) - (unripe% * 0.20)
    const unripeRatePercent =
      total > 0 ? (agg.unripeCount / total) * 100 : 0;
    const qualityScore =
      total > 0
        ? Math.max(
            0,
            Math.min(
              100,
              Math.round(100 - blightRatePercent * 2.5 - unripeRatePercent * 0.2)
            )
          )
        : 100;

    // Average tomato weight estimated at ~140g (0.14 kg)
    const estimatedWeightKg = Number((total * 0.14).toFixed(2));

    return {
      ...agg,
      blightRatePercent,
      ripeRatePercent,
      qualityScore,
      estimatedWeightKg,
    };
  });

  // Sort descending by Year, then season
  return results.sort((a, b) => {
    if (b.year !== a.year) return b.year - a.year;
    return a.seasonKey.localeCompare(b.seasonKey);
  });
}

/**
 * Compute Peak Season Insights:
 * - Peak Production Season (highest volume)
 * - Lowest Defect Season (lowest blight rate)
 * - Highest Quality Season
 * - YoY Growth metrics
 */
export function computePeakSeasonInsights(
  aggregates: SeasonalAggregate[]
): PeakSeasonInsights {
  if (!aggregates || aggregates.length === 0) {
    return {
      peakProduction: null,
      lowestDefect: null,
      highestQuality: null,
      totalVolumeAllTime: 0,
      totalWeightAllTimeKg: 0,
      totalSessionsCount: 0,
      overallBlightRate: 0,
      yearsTracked: [],
    };
  }

  // Filter aggregates with at least some tomato volume for meaningful defect/quality stats
  const validWithVolume = aggregates.filter((a) => a.totalCount > 0);

  // Peak Production: Maximum total volume
  let peakProduction: SeasonalAggregate | null = null;
  if (validWithVolume.length > 0) {
    peakProduction = [...validWithVolume].sort((a, b) => b.totalCount - a.totalCount)[0];
  }

  // Lowest Defect: Minimum blight rate
  let lowestDefect: SeasonalAggregate | null = null;
  if (validWithVolume.length > 0) {
    lowestDefect = [...validWithVolume].sort(
      (a, b) => a.blightRatePercent - b.blightRatePercent
    )[0];
  }

  // Highest Quality: Highest quality score
  let highestQuality: SeasonalAggregate | null = null;
  if (validWithVolume.length > 0) {
    highestQuality = [...validWithVolume].sort(
      (a, b) => b.qualityScore - a.qualityScore
    )[0];
  }

  const totalVolumeAllTime = aggregates.reduce((sum, a) => sum + a.totalCount, 0);
  const totalWeightAllTimeKg = Number(
    aggregates.reduce((sum, a) => sum + a.estimatedWeightKg, 0).toFixed(2)
  );
  const totalSessionsCount = aggregates.reduce((sum, a) => sum + a.sessionCount, 0);
  const totalBlight = aggregates.reduce((sum, a) => sum + a.blightCount, 0);
  const overallBlightRate =
    totalVolumeAllTime > 0
      ? Number(((totalBlight / totalVolumeAllTime) * 100).toFixed(1))
      : 0;

  const yearsSet = new Set<number>();
  aggregates.forEach((a) => yearsSet.add(a.year));
  const yearsTracked = Array.from(yearsSet).sort((a, b) => a - b);

  // Compute Year-over-Year volume growth if multiple years exist
  let yoyVolumeGrowth: PeakSeasonInsights['yoyVolumeGrowth'];
  if (yearsTracked.length >= 2) {
    const prevYear = yearsTracked[yearsTracked.length - 2];
    const currentYear = yearsTracked[yearsTracked.length - 1];

    const prevVolume = aggregates
      .filter((a) => a.year === prevYear)
      .reduce((s, a) => s + a.totalCount, 0);
    const currVolume = aggregates
      .filter((a) => a.year === currentYear)
      .reduce((s, a) => s + a.totalCount, 0);

    if (prevVolume > 0) {
      const growthPercent = Number(
        (((currVolume - prevVolume) / prevVolume) * 100).toFixed(1)
      );
      yoyVolumeGrowth = {
        prevYear,
        currentYear,
        growthPercent,
      };
    }
  }

  return {
    peakProduction,
    lowestDefect,
    highestQuality,
    totalVolumeAllTime,
    totalWeightAllTimeKg,
    totalSessionsCount,
    overallBlightRate,
    yearsTracked,
    yoyVolumeGrowth,
  };
}

/**
 * Build YoY Comparison Chart Data
 * X-axis: Seasons (e.g. Dry Season, Wet Season)
 * Series: Years (e.g. 2025, 2026)
 */
export function generateYoYComparisonData(
  aggregates: SeasonalAggregate[],
  metric: 'totalCount' | 'ripeCount' | 'blightRatePercent' | 'estimatedWeightKg' = 'totalCount',
  mode: SeasonGroupingMode = 'agri'
): {
  chartData: Array<Record<string, string | number>>;
  years: number[];
  metricLabel: string;
} {
  const yearsSet = new Set<number>();
  aggregates.forEach((a) => yearsSet.add(a.year));
  const years = Array.from(yearsSet).sort((a, b) => a - b);

  const seasonKeys =
    mode === 'agri'
      ? [
          { key: 'dry', label: 'Dry / Summer' },
          { key: 'wet', label: 'Wet / Rainy' },
        ]
      : [
          { key: 'Q1', label: 'Q1 (Jan-Mar)' },
          { key: 'Q2', label: 'Q2 (Apr-Jun)' },
          { key: 'Q3', label: 'Q3 (Jul-Sep)' },
          { key: 'Q4', label: 'Q4 (Oct-Dec)' },
        ];

  const chartData = seasonKeys.map((s) => {
    const row: Record<string, string | number> = {
      season: s.label,
      seasonKey: s.key,
    };

    years.forEach((yr) => {
      const match = aggregates.find(
        (a) => a.year === yr && a.seasonKey === s.key
      );
      row[`${yr}`] = match ? match[metric] : 0;
    });

    return row;
  });

  const metricLabel =
    metric === 'totalCount'
      ? 'Total Volume (Units)'
      : metric === 'ripeCount'
      ? 'Ripe Grade-A Yield'
      : metric === 'blightRatePercent'
      ? 'Blight Rate (%)'
      : 'Estimated Weight (kg)';

  return { chartData, years, metricLabel };
}

/**
 * Export Aggregated Seasonal Report to CSV
 */
export function exportSeasonalAggregatesToCSV(
  aggregates: SeasonalAggregate[],
  modeLabel: string = 'Agri-Seasons'
): void {
  if (!aggregates || aggregates.length === 0) return;

  const headers = [
    'Year',
    'Season',
    'Inspection Runs',
    'Total Volume (Units)',
    'Est. Weight (kg)',
    'Ripe Count (Grade A)',
    'Unripe Count',
    'Blight Count (Defects)',
    'Blight Defect Rate (%)',
    'Ripe Rate (%)',
    'Market Quality Index (/100)',
  ].join(',');

  const rows = aggregates.map((a) =>
    [
      a.year,
      `"${a.seasonName}"`,
      a.sessionCount,
      a.totalCount,
      a.estimatedWeightKg,
      a.ripeCount,
      a.unripeCount,
      a.blightCount,
      `"${a.blightRatePercent}%"`,
      `"${a.ripeRatePercent}%"`,
      a.qualityScore,
    ].join(',')
  );

  const csvContent = `${headers}\n${rows.join('\n')}`;
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `blightdetect_seasonal_yield_report_${modeLabel.toLowerCase()}_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
