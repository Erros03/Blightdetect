/**
 * Yield Monitoring Route - Real-time Tomato Quality & Harvest Estimation
 */
import React, { useState } from 'react';
import {
  BarChart3,
  Percent,
  TrendingUp,
  PieChart as PieIcon,
  Layers,
  CalendarRange,
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { TomatoSessionCounts, TomatoDetectionEvent } from '../types.ts';
import { useDashboardData } from '../hooks/useDashboardData.ts';
import { getSizeDistribution } from '../lib/dashboard-data.ts';
import { useTheme } from '../context/ThemeContext.tsx';
import { SeasonalYieldAnalytics } from '../components/SeasonalYieldAnalytics.tsx';

interface YieldMonitoringRouteProps {
  currentCounts: TomatoSessionCounts;
  liveEvents: TomatoDetectionEvent[];
}

export const YieldMonitoringRoute: React.FC<YieldMonitoringRouteProps> = ({
  currentCounts,
  liveEvents,
}) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const [activeTab, setActiveTab] = useState<'batch' | 'seasonal'>('batch');

  const { metrics, historicalSessions, recentDetections } = useDashboardData(
    currentCounts,
    liveEvents
  );

  const sizeData = getSizeDistribution(recentDetections);

  // Ripeness Distribution Data
  const ripenessData = [
    { name: 'Ripe / Grade A', value: currentCounts.ripe, color: '#10b981' },
    { name: 'Unripe / Green', value: currentCounts.unripe, color: '#84cc16' },
    { name: 'Blight / Defect', value: currentCounts.blight, color: '#ef4444' },
  ].filter((d) => d.value > 0);

  // Historical batch yield comparison
  const sessionYieldData = historicalSessions.slice(0, 7).reverse().map((s) => ({
    name: `Run ${s.startTime.substring(0, 5)}`,
    date: s.date,
    Ripe: s.ripeCount,
    Unripe: s.unripeCount,
    Blight: s.blightCount,
    Total: s.totalCount,
  }));

  // Calculate average diameter
  const avgDiameter = recentDetections.length > 0
    ? Math.round(
        recentDetections.reduce((sum, e) => sum + (e.diameterMm || 65), 0) /
          recentDetections.length
      )
    : 65;

  const tooltipStyle = {
    backgroundColor: isDark ? '#1c1917' : '#ffffff',
    borderColor: isDark ? '#44403c' : '#e7e5e4',
    borderRadius: '10px',
    color: isDark ? '#ffffff' : '#1c1917',
    boxShadow: isDark ? '0 10px 15px -3px rgba(0, 0, 0, 0.5)' : '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
  };

  const gridStroke = isDark ? '#292524' : '#e7e5e4';
  const axisStroke = isDark ? '#78716c' : '#a8a29e';

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 space-y-6">
      {/* Route Header & View Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <BarChart3 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            <h1 className="text-2xl font-black tracking-tight text-stone-900 dark:text-white sm:text-3xl">
              Yield & Quality Monitoring
            </h1>
          </div>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            Real-time harvest statistics, sizing distribution, and quality grading
          </p>
        </div>

        {/* View Mode Tabs */}
        <div className="flex items-center bg-stone-100 dark:bg-stone-800 p-1.5 rounded-2xl text-xs font-semibold shadow-xs">
          <button
            id="tab-btn-batch-metrics"
            onClick={() => setActiveTab('batch')}
            className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl transition-all cursor-pointer ${
              activeTab === 'batch'
                ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-white shadow-xs font-bold'
                : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white'
            }`}
          >
            <Layers className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <span>Active Batch</span>
          </button>

          <button
            id="tab-btn-seasonal-analytics"
            onClick={() => setActiveTab('seasonal')}
            className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl transition-all cursor-pointer ${
              activeTab === 'seasonal'
                ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-white shadow-xs font-bold'
                : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white'
            }`}
          >
            <CalendarRange className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <span>Seasonal Analytics</span>
          </button>
        </div>
      </div>

      {activeTab === 'seasonal' ? (
        <SeasonalYieldAnalytics sessions={historicalSessions} />
      ) : (
        <div className="space-y-6">
          {/* Yield Metrics Top Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900/90 p-5 shadow-xs transition-colors">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">Total Analyzed</span>
                <Layers className="h-4 w-4 text-blue-500 dark:text-blue-400" />
              </div>
              <div className="mt-3 flex items-baseline justify-between">
                <span className="text-3xl font-black text-stone-900 dark:text-white">{currentCounts.total}</span>
                <span className="text-xs text-stone-500 dark:text-stone-400">items</span>
              </div>
            </div>

            <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900/90 p-5 shadow-xs transition-colors">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Marketable Rate</span>
                <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="mt-3 flex items-baseline justify-between">
                <span className="text-3xl font-black text-emerald-600 dark:text-emerald-400">
                  {currentCounts.total > 0
                    ? Math.round(((currentCounts.ripe + currentCounts.unripe) / currentCounts.total) * 100)
                    : 100}%
                </span>
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-500">non-defective</span>
              </div>
            </div>

            <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900/90 p-5 shadow-xs transition-colors">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">Avg. Diameter</span>
                <span className="text-xs font-mono text-stone-500 dark:text-stone-400">Ø cm</span>
              </div>
              <div className="mt-3 flex items-baseline justify-between">
                <span className="text-3xl font-black text-stone-900 dark:text-white">{(avgDiameter / 10).toFixed(1)}</span>
                <span className="text-xs text-stone-500 dark:text-stone-400">cm</span>
              </div>
            </div>

            <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900/90 p-5 shadow-xs transition-colors">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">Quality Index</span>
                <Percent className="h-4 w-4 text-amber-500 dark:text-amber-400" />
              </div>
              <div className="mt-3 flex items-baseline justify-between">
                <span className="text-3xl font-black text-amber-600 dark:text-amber-400">{metrics.qualityScore}</span>
                <span className="text-xs font-bold text-stone-500 dark:text-stone-400">/ 100</span>
              </div>
            </div>
          </div>

          {/* Post-Harvest Grading & Conveyor Sorting Matrix */}
          <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900/90 p-5 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-stone-900 dark:text-white">
                  Post-Harvest Grading & Sorting
                </h3>
                <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                  Current batch breakdown by quality grade and routing destination
                </p>
              </div>
              <span className="text-xs font-mono px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-semibold">
                95% Threshold
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/50 dark:bg-emerald-950/20">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                    Grade A (Table Market)
                  </span>
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-emerald-200 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200">
                    ACCEPT
                  </span>
                </div>
                <div className="text-3xl font-black font-mono text-emerald-900 dark:text-emerald-100 mb-1">
                  {currentCounts.gradeA ?? currentCounts.ripe}
                </div>
                <p className="text-xs text-emerald-700 dark:text-emerald-400/90">
                  Ripe, defect-free tomatoes approved for commercial market.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-lime-200 dark:border-lime-800/60 bg-lime-50/50 dark:bg-lime-950/20">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-lime-800 dark:text-lime-300">
                    Grade B (Ripening)
                  </span>
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-lime-200 dark:bg-lime-900 text-lime-800 dark:text-lime-200">
                    SERVO 1
                  </span>
                </div>
                <div className="text-3xl font-black font-mono text-lime-900 dark:text-lime-100 mb-1">
                  {currentCounts.gradeB ?? currentCounts.unripe}
                </div>
                <p className="text-xs text-lime-700 dark:text-lime-400/90">
                  Unripe green fruit sorted into the ripening container.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-red-200 dark:border-red-800/60 bg-red-50/50 dark:bg-red-950/20">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-red-800 dark:text-red-300">
                    Grade C (Defect / Blight)
                  </span>
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-red-200 dark:bg-red-900 text-red-800 dark:text-red-200">
                    STRAIGHT
                  </span>
                </div>
                <div className="text-3xl font-black font-mono text-red-900 dark:text-red-100 mb-1">
                  {currentCounts.gradeC ?? currentCounts.blight}
                </div>
                <p className="text-xs text-red-700 dark:text-red-400/90">
                  Blight or diseased fruit routed straight through to quarantine.
                </p>
              </div>
            </div>
          </div>

          {/* Chart Visualizations */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Ripeness Breakdown Donut Chart */}
            <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900/90 p-5 shadow-xs flex flex-col justify-between transition-colors">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold uppercase tracking-wider text-stone-900 dark:text-white">
                  Ripeness Distribution
                </h3>
                <PieIcon className="h-4 w-4 text-stone-400" />
              </div>

              <div className="h-64 w-full flex items-center justify-center">
                {ripenessData.length === 0 ? (
                  <div className="text-center text-stone-400 dark:text-stone-500 text-xs">
                    No detections recorded in this session.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={ripenessData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {ripenessData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-stone-100 dark:border-stone-800 pt-3 text-center text-xs">
                <div>
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold block">{currentCounts.ripe}</span>
                  <span className="text-stone-500 dark:text-stone-400 text-[10px]">Ripe</span>
                </div>
                <div>
                  <span className="text-lime-600 dark:text-lime-400 font-bold block">{currentCounts.unripe}</span>
                  <span className="text-stone-500 dark:text-stone-400 text-[10px]">Unripe</span>
                </div>
                <div>
                  <span className="text-red-600 dark:text-red-400 font-bold block">{currentCounts.blight}</span>
                  <span className="text-stone-500 dark:text-stone-400 text-[10px]">Blight</span>
                </div>
              </div>
            </div>

            {/* Size Distribution Bar Chart */}
            <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900/90 p-5 shadow-xs flex flex-col justify-between transition-colors">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold uppercase tracking-wider text-stone-900 dark:text-white">
                  Size Breakdown (cm)
                </h3>
                <BarChart3 className="h-4 w-4 text-stone-400" />
              </div>

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sizeData} margin={{ top: 10, right: 10, left: -20, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                    <XAxis dataKey="name" stroke={axisStroke} fontSize={11} />
                    <YAxis stroke={axisStroke} fontSize={11} allowDecimals={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]}>
                      {sizeData.map((entry, index) => (
                        <Cell key={`bar-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-stone-100 dark:border-stone-800 pt-3 text-center text-xs">
                <div>
                  <span className="text-amber-600 dark:text-amber-400 font-bold block">
                    {sizeData.find((s) => s.name.includes('Small'))?.count ?? 0}
                  </span>
                  <span className="text-stone-500 dark:text-stone-400 text-[10px]">Small (&lt;6.0 cm)</span>
                </div>
                <div>
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold block">
                    {sizeData.find((s) => s.name.includes('Medium'))?.count ?? 0}
                  </span>
                  <span className="text-stone-500 dark:text-stone-400 text-[10px]">Medium (6.0 - 7.5 cm)</span>
                </div>
                <div>
                  <span className="text-blue-600 dark:text-blue-400 font-bold block">
                    {sizeData.find((s) => s.name.includes('Large'))?.count ?? 0}
                  </span>
                  <span className="text-stone-500 dark:text-stone-400 text-[10px]">Large (&gt;7.5 cm)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Historical Yield Runs Chart */}
          {sessionYieldData.length > 0 && (
            <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900/90 p-5 shadow-xs transition-colors">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-stone-900 dark:text-white">
                    Historical Session Trends
                  </h3>
                  <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                    Throughput and classification counts from previous runs
                  </p>
                </div>
                <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sessionYieldData} margin={{ top: 10, right: 20, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                    <XAxis dataKey="name" stroke={axisStroke} fontSize={11} />
                    <YAxis stroke={axisStroke} fontSize={11} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend />
                    <Bar dataKey="Ripe" stackId="a" fill="#10b981" />
                    <Bar dataKey="Unripe" stackId="a" fill="#84cc16" />
                    <Bar dataKey="Blight" stackId="a" fill="#ef4444" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
