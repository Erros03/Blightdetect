/**
 * Yield Monitoring Route - Real-time Tomato Quality & Harvest Estimation
 */
import React from 'react';
import {
  BarChart3,
  Scale,
  Percent,
  HelpCircle,
  TrendingUp,
  PieChart as PieIcon,
  Layers,
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
      {/* Route Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <BarChart3 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            <h1 className="text-2xl font-black tracking-tight text-stone-900 dark:text-white sm:text-3xl">
              Yield & Quality Monitoring
            </h1>
          </div>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            Automated grade classification, sizing distribution, and volume estimation
          </p>
        </div>

        {/* Model vs Estimate Disclaimer */}
        <div className="flex items-center space-x-2 rounded-xl bg-white border border-stone-200 dark:bg-stone-900 dark:border-stone-800 p-2.5 px-4 text-xs text-stone-600 dark:text-stone-400 shadow-xs">
          <HelpCircle className="h-4 w-4 text-blue-500 dark:text-blue-400" />
          <span>
            Classes: <strong className="text-stone-900 dark:text-stone-200">Roboflow Model</strong> • Dimensions: <strong className="text-stone-900 dark:text-stone-200">Pixel Geometry Estimate</strong>
          </span>
        </div>
      </div>

      {/* Yield Metrics Top Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900/90 p-5 shadow-xs transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">Total Analyzed</span>
            <Layers className="h-4 w-4 text-blue-500 dark:text-blue-400" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-3xl font-black text-stone-900 dark:text-white">{currentCounts.total}</span>
            <span className="text-xs text-stone-500 dark:text-stone-400">Session items</span>
          </div>
          <p className="mt-2 text-xs text-stone-500">Tracked via computer vision</p>
        </div>

        <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900/90 p-5 shadow-xs transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Est. Weight</span>
            <Scale className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-3xl font-black text-emerald-600 dark:text-emerald-400">{metrics.estimatedYieldKg}</span>
            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-500">kg total</span>
          </div>
          <p className="mt-2 text-xs text-stone-500">Based on bbox volume calculations</p>
        </div>

        <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900/90 p-5 shadow-xs transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">Avg. Diameter</span>
            <span className="text-xs font-mono text-stone-500 dark:text-stone-400">Ø mm</span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-3xl font-black text-stone-900 dark:text-white">~{avgDiameter}</span>
            <span className="text-xs text-stone-500 dark:text-stone-400">millimeters</span>
          </div>
          <p className="mt-2 text-xs text-stone-500">Standard table tomato size</p>
        </div>

        <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900/90 p-5 shadow-xs transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">Market Quality Index</span>
            <Percent className="h-4 w-4 text-amber-500 dark:text-amber-400" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-3xl font-black text-amber-600 dark:text-amber-400">{metrics.qualityScore}</span>
            <span className="text-xs font-bold text-stone-500 dark:text-stone-400">/ 100</span>
          </div>
          <p className="mt-2 text-xs text-stone-500">Defect penalty factored</p>
        </div>
      </div>

      {/* Chart Visualizations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ripeness Breakdown Donut Chart */}
        <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900/90 p-5 shadow-xs flex flex-col justify-between transition-colors">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold uppercase tracking-wider text-stone-900 dark:text-white">
                Ripeness Distribution
              </h3>
              <PieIcon className="h-4 w-4 text-stone-400" />
            </div>
            <p className="text-xs text-stone-500 dark:text-stone-400 mb-4">
              Breakdown of current session harvest readiness
            </p>
          </div>

          <div className="h-64 w-full flex items-center justify-center">
            {ripenessData.length === 0 ? (
              <div className="text-center text-stone-400 dark:text-stone-500 text-xs">
                No tomatoes detected yet in this session. Start the camera to populate yield charts.
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
              <span className="text-stone-500 dark:text-stone-400 text-[10px]">Ripe Grade A</span>
            </div>
            <div>
              <span className="text-lime-600 dark:text-lime-400 font-bold block">{currentCounts.unripe}</span>
              <span className="text-stone-500 dark:text-stone-400 text-[10px]">Unripe / Raw</span>
            </div>
            <div>
              <span className="text-red-600 dark:text-red-400 font-bold block">{currentCounts.blight}</span>
              <span className="text-stone-500 dark:text-stone-400 text-[10px]">Blight Defect</span>
            </div>
          </div>
        </div>

        {/* Size Distribution Bar Chart */}
        <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900/90 p-5 shadow-xs flex flex-col justify-between transition-colors">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold uppercase tracking-wider text-stone-900 dark:text-white">
                Size Classification Breakdown
              </h3>
              <BarChart3 className="h-4 w-4 text-stone-400" />
            </div>
            <p className="text-xs text-stone-500 dark:text-stone-400 mb-4">
              Estimated physical diameter sorting categories
            </p>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sizeData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis dataKey="name" stroke={axisStroke} fontSize={10} angle={-15} textAnchor="end" />
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

          <div className="mt-2 text-[11px] text-stone-500 text-center">
            * Calibrated optical estimation from bounding box dimensions at 40cm focal distance
          </div>
        </div>
      </div>

      {/* Historical Yield Runs Chart */}
      {sessionYieldData.length > 0 && (
        <div className="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900/90 p-5 shadow-xs transition-colors">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-stone-900 dark:text-white">
                Historical Run Performance Trends
              </h3>
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                Total throughput and defect incidence across past completed sessions
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
  );
};
