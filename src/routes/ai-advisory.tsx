/**
 * AI Advisory & Agricultural LLM Route for BlightDetect+
 * Dedicated page for the DA-CVRC Agricultural LLM Expert (Google Gemini 3.8 Flash)
 */
import React from 'react';
import {
  BrainCircuit,
  MapPin,
  Cpu,
  Sparkles,
  ShieldCheck,
} from 'lucide-react';
import type { TomatoSessionCounts, TomatoDetectionEvent } from '../types.ts';
import { AgriculturalAdvisoryPanel } from '../components/AgriculturalAdvisoryPanel.tsx';

interface AIAdvisoryRouteProps {
  currentCounts: TomatoSessionCounts;
  liveEvents?: TomatoDetectionEvent[];
}

export const AIAdvisoryRoute: React.FC<AIAdvisoryRouteProps> = ({
  currentCounts,
  liveEvents = [],
}) => {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 space-y-8">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-stone-200 dark:border-stone-800">
        <div>
          <div className="flex items-center space-x-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400 mb-1">
            <BrainCircuit className="h-4 w-4" />
            <span>DA-CVRC Agricultural AI Advisory</span>
            <span>•</span>
            <span className="font-mono bg-emerald-100 dark:bg-emerald-950 px-2 py-0.5 rounded text-[11px]">
              Gemini 3.8 Flash
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-stone-900 dark:text-white tracking-tight flex items-center gap-2">
            <span>DA-CVRC Agricultural AI Expert Hub</span>
          </h1>
          <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-400 max-w-3xl mt-1">
            Department of Agriculture – Cagayan Valley Research Center (Baligatan, City of Ilagan, Isabela).
            Simple, real-time AI guidance analyzing conveyor sorter telemetry to recommend culling steps, cleaning protocols, and cold storage settings.
          </p>
        </div>
      </div>

      {/* Facility Meta Specs Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-xs flex items-center space-x-3">
          <div className="p-3 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-xl">
            <MapPin className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[11px] font-medium text-stone-500 dark:text-stone-400">Target Facility</div>
            <div className="text-xs font-bold text-stone-900 dark:text-white">DA-CVRC, Ilagan, Isabela</div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-xs flex items-center space-x-3">
          <div className="p-3 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-xl">
            <Cpu className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[11px] font-medium text-stone-500 dark:text-stone-400">Vision Engine Sync</div>
            <div className="text-xs font-bold text-stone-900 dark:text-white">YOLOv11 Conveyor Telemetry</div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-xs flex items-center space-x-3">
          <div className="p-3 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-xl">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[11px] font-medium text-stone-500 dark:text-stone-400">Active AI Model</div>
            <div className="text-xs font-bold text-stone-900 dark:text-white">Gemini 3.8 Flash</div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-xs flex items-center space-x-3">
          <div className="p-3 bg-purple-500/10 text-purple-600 dark:text-purple-400 rounded-xl">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[11px] font-medium text-stone-500 dark:text-stone-400">Standard Guidelines</div>
            <div className="text-xs font-bold text-stone-900 dark:text-white">DA-CVRC Post-Harvest Protocol</div>
          </div>
        </div>
      </div>

      {/* Main Advisory Panel Component */}
      <AgriculturalAdvisoryPanel currentCounts={currentCounts} liveEvents={liveEvents} />
    </div>
  );
};
