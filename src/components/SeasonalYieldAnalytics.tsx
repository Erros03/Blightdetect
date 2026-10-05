/**
 * Seasonal & Annual Yield Analytics Component
 * Yearly & Seasonal data grouping, peak season insights, YoY charts, and CSV report export
 */
import React, { useState, useMemo } from 'react';
import {
  CalendarRange,
  TrendingUp,
  Award,
  ShieldCheck,
  Download,
  Filter,
  Sun,
  CloudRain,
  ChevronDown,
  Sparkles,
  BarChart2,
  Calendar,
  Layers,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { DetectionSession } from '../types.ts';
import {
  type SeasonGroupingMode,
  type SeasonalAggregate,
  groupSessionsBySeason,
  computePeakSeasonInsights,
  generateYoYComparisonData,
  exportSeasonalAggregatesToCSV,
} from '../lib/seasonal-analytics.ts';
import { useTheme } from '../context/ThemeContext.tsx';

interface SeasonalYieldAnalyticsProps {
  sessions: DetectionSession[];
}

export const SeasonalYieldAnalytics: React.FC<SeasonalYieldAnalyticsProps> = ({
  sessions,
}) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const [groupingMode, setGroupingMode] = useState<SeasonGroupingMode>('agri');
  const [selectedMetric, setSelectedMetric] = useState<
    'totalCount' | 'ripeCount' | 'estimatedWeightKg' | 'blightRatePercent'
  >('totalCount');
  const [filterYear, setFilterYear] = useState<string>('all');
  const [filterSeason, setFilterSeason] = useState<string>('all');

  // Compute seasonal aggregates based on current grouping mode
  const aggregates = useMemo(() => {
    return groupSessionsBySeason(sessions, groupingMode);
  }, [sessions, groupingMode]);

  // Compute peak insights across all recorded seasons
  const insights = useMemo(() => {
    return computePeakSeasonInsights(aggregates);
  }, [aggregates]);

  // Generate Year-over-Year comparison data for Recharts
  const { chartData, years, metricLabel } = useMemo(() => {
    return generateYoYComparisonData(aggregates, selectedMetric, groupingMode);
  }, [aggregates, selectedMetric, groupingMode]);

  // Unique years for filtering
  const availableYears = useMemo(() => {
    const set = new Set<number>();
    aggregates.forEach((a) => set.add(a.year));
    return Array.from(set).sort((a, b) => b - a);
  }, [aggregates]);

  // Filtered seasonal aggregates for the summary table
  const filteredAggregates = useMemo(() => {
    return aggregates.filter((a) => {
      const matchYear = filterYear === 'all' || a.year.toString() === filterYear;
      const matchSeason = filterSeason === 'all' || a.seasonKey === filterSeason;
      return matchYear && matchSeason;
    });
  }, [aggregates, filterYear, filterSeason]);

  // Color palette for years in YoY chart
  const yearColors = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899'];

  const tooltipStyle = {
    backgroundColor: isDark ? '#1c1917' : '#ffffff',
    borderColor: isDark ? '#44403c' : '#e7e5e4',
    borderRadius: '12px',
    color: isDark ? '#ffffff' : '#1c1917',
    boxShadow: isDark
      ? '0 10px 15px -3px rgba(0, 0, 0, 0.5)'
      : '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
  };

  const gridStroke = isDark ? '#292524' : '#e7e5e4';
  const axisStroke = isDark ? '#78716c' : '#a8a29e';

  return (
    <div className="space-y-6">
      {/* Analytics Sub-Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900/90 p-5 shadow-xs transition-colors">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-400">
              <CalendarRange className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-stone-900 dark:text-white flex items-center gap-2">
                Seasonal & Annual Yield Analytics
                <span className="text-[11px] font-semibold uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                  YoY Intelligence
                </span>
              </h2>
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                Multi-year climate grouping, peak throughput windows, and seasonal defect trends
              </p>
            </div>
          </div>
        </div>

        {/* Grouping Mode Toggle & CSV Export */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Grouping Mode Pill Toggle */}
          <div className="inline-flex rounded-xl bg-stone-100 dark:bg-stone-800 p-1 text-xs font-semibold">
            <button
              id="btn-group-mode-agri"
              onClick={() => {
                setGroupingMode('agri');
                setFilterSeason('all');
              }}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg transition-all ${
                groupingMode === 'agri'
                  ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-white shadow-xs font-bold'
                  : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white'
              }`}
            >
              <Sun className="h-3.5 w-3.5 text-amber-500" />
              <span>Dry / Wet Season</span>
            </button>
            <button
              id="btn-group-mode-quarterly"
              onClick={() => {
                setGroupingMode('quarterly');
                setFilterSeason('all');
              }}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg transition-all ${
                groupingMode === 'quarterly'
                  ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-white shadow-xs font-bold'
                  : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white'
              }`}
            >
              <Calendar className="h-3.5 w-3.5 text-blue-500" />
              <span>Quarterly (Q1–Q4)</span>
            </button>
          </div>

          {/* Export Aggregated Seasonal CSV */}
          <button
            id="btn-export-seasonal-csv"
            onClick={() => exportSeasonalAggregatesToCSV(aggregates, groupingMode === 'agri' ? 'Dry-Wet-Seasons' : 'Quarterly')}
            disabled={aggregates.length === 0}
            className="flex items-center space-x-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-3.5 py-2 text-xs font-bold text-white transition-colors shadow-xs"
            title="Export Aggregated Seasonal & Annual Report to CSV"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export Seasonal Report (CSV)</span>
          </button>
        </div>
      </div>

      {/* Peak Season Insights Banners */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Peak Production Season */}
        <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900/60 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent p-5 shadow-xs transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
              <Award className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              Peak Production Season
            </span>
            <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              Highest Yield
            </span>
          </div>

          {insights.peakProduction ? (
            <div className="mt-3">
              <div className="flex items-baseline space-x-2">
                <span className="text-2xl font-black text-stone-900 dark:text-white">
                  {insights.peakProduction.seasonShort} {insights.peakProduction.year}
                </span>
              </div>
              <div className="mt-2 text-xs text-stone-600 dark:text-stone-300 space-y-1">
                <p>
                  <strong className="text-emerald-700 dark:text-emerald-400 font-bold">
                    {insights.peakProduction.totalCount.toLocaleString()}
                  </strong>{' '}
                  tomatoes processed (~{insights.peakProduction.estimatedWeightKg.toLocaleString()} kg)
                </p>
                <p className="text-[11px] text-stone-500 dark:text-stone-400">
                  Across {insights.peakProduction.sessionCount} inspection runs • {insights.peakProduction.ripeRatePercent}% Grade-A Ripe
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-3 text-xs text-stone-500">No session data recorded yet.</div>
          )}
        </div>

        {/* Lowest Defect Season */}
        <div className="rounded-2xl border border-blue-200 dark:border-blue-900/60 bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-transparent p-5 shadow-xs transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-800 dark:text-blue-300 flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              Lowest Defect Season
            </span>
            <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
              Min Blight
            </span>
          </div>

          {insights.lowestDefect ? (
            <div className="mt-3">
              <div className="flex items-baseline space-x-2">
                <span className="text-2xl font-black text-stone-900 dark:text-white">
                  {insights.lowestDefect.seasonShort} {insights.lowestDefect.year}
                </span>
              </div>
              <div className="mt-2 text-xs text-stone-600 dark:text-stone-300 space-y-1">
                <p>
                  Only{' '}
                  <strong className="text-blue-700 dark:text-blue-400 font-bold">
                    {insights.lowestDefect.blightRatePercent}%
                  </strong>{' '}
                  blight defect incidence ({insights.lowestDefect.blightCount} rejected)
                </p>
                <p className="text-[11px] text-stone-500 dark:text-stone-400">
                  Market Quality Index: <strong className="text-stone-800 dark:text-stone-200">{insights.lowestDefect.qualityScore}/100</strong>
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-3 text-xs text-stone-500">No session data recorded yet.</div>
          )}
        </div>

        {/* All-Time Volume & YoY Growth */}
        <div className="rounded-2xl border border-amber-200 dark:border-amber-900/60 bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent p-5 shadow-xs transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              Annual Multi-Year Growth
            </span>
            <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
              {insights.yearsTracked.length} Years Logged
            </span>
          </div>

          <div className="mt-3">
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-black text-stone-900 dark:text-white">
                {insights.totalVolumeAllTime.toLocaleString()}
              </span>
              <span className="text-xs font-bold text-amber-700 dark:text-amber-400">
                {insights.totalWeightAllTimeKg.toLocaleString()} kg total
              </span>
            </div>
            <div className="mt-2 text-xs text-stone-600 dark:text-stone-300 space-y-1">
              {insights.yoyVolumeGrowth ? (
                <p>
                  <strong className={insights.yoyVolumeGrowth.growthPercent >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}>
                    {insights.yoyVolumeGrowth.growthPercent >= 0 ? '+' : ''}
                    {insights.yoyVolumeGrowth.growthPercent}% YoY Growth
                  </strong>{' '}
                  ({insights.yoyVolumeGrowth.currentYear} vs {insights.yoyVolumeGrowth.prevYear})
                </p>
              ) : (
                <p>Recorded across {insights.totalSessionsCount} total conveyor inspection runs</p>
              )}
              <p className="text-[11px] text-stone-500 dark:text-stone-400">
                All-time average defect incidence: {insights.overallBlightRate}%
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Year-over-Year (YoY) Comparison Chart */}
      <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900/90 p-5 shadow-xs transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center space-x-2">
              <BarChart2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-stone-900 dark:text-white">
                Year-over-Year (YoY) Seasonal Yield Comparison
              </h3>
            </div>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
              Compare harvest throughput, grade yields, and blight rates across recorded calendar years
            </p>
          </div>

          {/* Metric Selector for YoY Chart */}
          <div className="flex items-center space-x-1.5 bg-stone-100 dark:bg-stone-800 p-1 rounded-xl text-xs font-semibold">
            <button
              id="btn-yoy-metric-total"
              onClick={() => setSelectedMetric('totalCount')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                selectedMetric === 'totalCount'
                  ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-white shadow-xs font-bold'
                  : 'text-stone-600 dark:text-stone-400 hover:text-stone-900'
              }`}
            >
              Total Volume
            </button>
            <button
              id="btn-yoy-metric-ripe"
              onClick={() => setSelectedMetric('ripeCount')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                selectedMetric === 'ripeCount'
                  ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-white shadow-xs font-bold'
                  : 'text-stone-600 dark:text-stone-400 hover:text-stone-900'
              }`}
            >
              Ripe (Grade A)
            </button>
            <button
              id="btn-yoy-metric-weight"
              onClick={() => setSelectedMetric('estimatedWeightKg')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                selectedMetric === 'estimatedWeightKg'
                  ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-white shadow-xs font-bold'
                  : 'text-stone-600 dark:text-stone-400 hover:text-stone-900'
              }`}
            >
              Est. Weight (kg)
            </button>
            <button
              id="btn-yoy-metric-blight"
              onClick={() => setSelectedMetric('blightRatePercent')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                selectedMetric === 'blightRatePercent'
                  ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-white shadow-xs font-bold'
                  : 'text-stone-600 dark:text-stone-400 hover:text-stone-900'
              }`}
            >
              Blight Rate %
            </button>
          </div>
        </div>

        {/* Chart */}
        <div className="h-72 w-full">
          {chartData.length === 0 || years.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-stone-400">
              No historical data available to plot YoY comparison.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 15, right: 25, left: -5, bottom: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis dataKey="season" stroke={axisStroke} fontSize={12} fontStyle="bold" />
                <YAxis stroke={axisStroke} fontSize={11} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value: any) => [
                    selectedMetric === 'blightRatePercent'
                      ? `${value}%`
                      : selectedMetric === 'estimatedWeightKg'
                      ? `${value} kg`
                      : Number(value).toLocaleString(),
                    metricLabel,
                  ]}
                />
                <Legend />
                {years.map((yr, idx) => (
                  <Bar
                    key={yr}
                    dataKey={`${yr}`}
                    name={`Year ${yr}`}
                    fill={yearColors[idx % yearColors.length]}
                    radius={[6, 6, 0, 0]}
                    maxBarSize={45}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Aggregated Seasonal Breakdown Table with Year & Season Filter */}
      <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900/90 shadow-xs overflow-hidden transition-colors">
        {/* Table Filter Bar */}
        <div className="p-4 sm:p-5 border-b border-stone-100 dark:border-stone-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-stone-900 dark:text-white flex items-center gap-2">
              <Layers className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              Seasonal Metrics Audit Table
            </h3>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
              Aggregated volume, sorting classifications, and market grade index by season
            </p>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center space-x-1 text-xs text-stone-500">
              <Filter className="h-3.5 w-3.5" />
              <span>Filter:</span>
            </div>

            {/* Year Dropdown */}
            <select
              id="select-filter-year"
              value={filterYear}
              onChange={(e) => setFilterYear(e.target.value)}
              className="rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3 py-1.5 text-xs font-semibold text-stone-800 dark:text-stone-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="all">All Recorded Years</option>
              {availableYears.map((yr) => (
                <option key={yr} value={yr.toString()}>
                  Year {yr}
                </option>
              ))}
            </select>

            {/* Season Dropdown */}
            <select
              id="select-filter-season"
              value={filterSeason}
              onChange={(e) => setFilterSeason(e.target.value)}
              className="rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 px-3 py-1.5 text-xs font-semibold text-stone-800 dark:text-stone-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="all">All Seasons</option>
              {groupingMode === 'agri' ? (
                <>
                  <option value="dry">Dry / Summer Season</option>
                  <option value="wet">Wet / Rainy Season</option>
                </>
              ) : (
                <>
                  <option value="Q1">Q1 (Jan–Mar)</option>
                  <option value="Q2">Q2 (Apr–Jun)</option>
                  <option value="Q3">Q3 (Jul–Sep)</option>
                  <option value="Q4">Q4 (Oct–Dec)</option>
                </>
              )}
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-stone-50 dark:bg-stone-800/60 text-stone-500 dark:text-stone-400 uppercase font-bold text-[11px] border-b border-stone-100 dark:border-stone-800">
              <tr>
                <th className="px-5 py-3.5">Year</th>
                <th className="px-5 py-3.5">Season Window</th>
                <th className="px-5 py-3.5 text-center">Inspection Runs</th>
                <th className="px-5 py-3.5 text-right">Total Volume</th>
                <th className="px-5 py-3.5 text-right">Est. Weight</th>
                <th className="px-5 py-3.5 text-right">Ripe (Grade A)</th>
                <th className="px-5 py-3.5 text-right">Unripe</th>
                <th className="px-5 py-3.5 text-right">Blight Count</th>
                <th className="px-5 py-3.5 text-right">Blight Rate</th>
                <th className="px-5 py-3.5 text-center">Market Quality</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800/60 font-medium">
              {filteredAggregates.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-5 py-8 text-center text-stone-400">
                    No seasonal aggregates match the selected filter criteria.
                  </td>
                </tr>
              ) : (
                filteredAggregates.map((agg) => {
                  const isPeak = insights.peakProduction?.id === agg.id;
                  const isMinDefect = insights.lowestDefect?.id === agg.id;

                  return (
                    <tr
                      key={agg.id}
                      className="hover:bg-stone-50/80 dark:hover:bg-stone-800/40 transition-colors"
                    >
                      <td className="px-5 py-3.5 font-bold text-stone-900 dark:text-white">
                        {agg.year}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center space-x-2">
                          {agg.seasonKey === 'dry' ? (
                            <Sun className="h-4 w-4 text-amber-500 shrink-0" />
                          ) : agg.seasonKey === 'wet' ? (
                            <CloudRain className="h-4 w-4 text-blue-500 shrink-0" />
                          ) : (
                            <Calendar className="h-4 w-4 text-emerald-500 shrink-0" />
                          )}
                          <div>
                            <span className="font-bold text-stone-900 dark:text-stone-100">
                              {agg.seasonName}
                            </span>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              {isPeak && (
                                <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                  ★ Peak Volume
                                </span>
                              )}
                              {isMinDefect && (
                                <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                                  ✓ Lowest Blight
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-center font-mono text-stone-600 dark:text-stone-300">
                        {agg.sessionCount} runs
                      </td>
                      <td className="px-5 py-3.5 text-right font-black text-stone-900 dark:text-white">
                        {agg.totalCount.toLocaleString()}
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono text-emerald-700 dark:text-emerald-400 font-bold">
                        {agg.estimatedWeightKg.toLocaleString()} kg
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">
                          {agg.ripeCount.toLocaleString()}
                        </span>
                        <span className="text-[10px] text-stone-400 ml-1">
                          ({agg.ripeRatePercent}%)
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right text-lime-700 dark:text-lime-400 font-mono">
                        {agg.unripeCount.toLocaleString()}
                      </td>
                      <td className="px-5 py-3.5 text-right text-red-600 dark:text-red-400 font-mono font-bold">
                        {agg.blightCount.toLocaleString()}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <span
                          className={`font-mono font-bold px-2 py-0.5 rounded ${
                            agg.blightRatePercent > 10
                              ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-400'
                              : agg.blightRatePercent > 5
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-400'
                              : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400'
                          }`}
                        >
                          {agg.blightRatePercent}%
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                            agg.qualityScore >= 80
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : agg.qualityScore >= 60
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                              : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                          }`}
                        >
                          {agg.qualityScore} / 100
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
