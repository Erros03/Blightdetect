/**
 * Navbar component for BlightDetect+ Tomato Vision Stream
 */
import React, { useState, useEffect } from 'react';
import {
  Camera,
  LayoutDashboard,
  History,
  BarChart3,
  Activity,
  ShieldAlert,
  Sun,
  Moon,
  Cpu,
} from 'lucide-react';
import type { CameraStatus, TomatoSessionCounts } from '../types.ts';
import { useTheme } from '../context/ThemeContext.tsx';
import { BrandLogo } from './BrandLogo.tsx';
import { arduinoSerial } from '../lib/arduino-serial.ts';

interface NavbarProps {
  currentRoute: string;
  onNavigate: (route: string) => void;
  cameraStatus: CameraStatus;
  sessionCounts: TomatoSessionCounts;
  onOpenArduinoModal?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentRoute,
  onNavigate,
  cameraStatus,
  sessionCounts,
  onOpenArduinoModal,
}) => {
  const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme();
  const [arduinoConnected, setArduinoConnected] = useState<boolean>(arduinoSerial.getConnected());

  useEffect(() => {
    const unsub = arduinoSerial.subscribe((_, connected) => {
      setArduinoConnected(connected);
    });
    return () => unsub();
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-stone-200 bg-white/95 text-stone-900 shadow-xs backdrop-blur-md dark:border-stone-800 dark:bg-stone-900/95 dark:text-stone-100 transition-colors duration-200">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-2.5 sm:px-6">
        {/* Brand identity */}
        <div 
          className="flex cursor-pointer items-center space-x-3" 
          onClick={() => onNavigate('dashboard')}
          id="brand-logo-btn"
        >
          <BrandLogo size="md" />
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-base font-bold tracking-tight text-stone-900 dark:text-white">
                BlightDetect<span className="text-red-500 font-extrabold">+</span>
              </span>
              <span className="rounded-md bg-stone-100 dark:bg-stone-800 px-1.5 py-0.5 text-[10px] font-semibold text-stone-600 dark:text-stone-300 border border-stone-200 dark:border-stone-700">
                Vision Stream
              </span>
            </div>
            <p className="text-[11px] text-stone-500 dark:text-stone-400">Tomato Sorter & Blight Detection</p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="hidden md:flex items-center space-x-1 rounded-xl bg-stone-100 p-1 border border-stone-200/80 dark:bg-stone-800/90 dark:border-stone-700/60 transition-colors">
          <button
            id="nav-dashboard-tab"
            onClick={() => onNavigate('dashboard')}
            className={`flex items-center space-x-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${
              currentRoute === 'dashboard'
                ? 'bg-white text-stone-900 shadow-xs dark:bg-stone-700 dark:text-white font-semibold'
                : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/60 dark:text-stone-300 dark:hover:bg-stone-700/50 dark:hover:text-white'
            }`}
          >
            <LayoutDashboard className="h-3.5 w-3.5 text-stone-500 dark:text-stone-300" />
            <span>Dashboard</span>
          </button>

          <button
            id="nav-live-tab"
            onClick={() => onNavigate('live-stream')}
            className={`relative flex items-center space-x-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${
              currentRoute === 'live-stream'
                ? 'bg-red-600 text-white shadow-xs font-semibold'
                : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/60 dark:text-stone-300 dark:hover:bg-stone-700/50 dark:hover:text-white'
            }`}
          >
            <Camera className="h-3.5 w-3.5" />
            <span>Live Stream</span>
            {cameraStatus === 'live' && (
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
              </span>
            )}
          </button>

          <button
            id="nav-yield-tab"
            onClick={() => onNavigate('yield-monitoring')}
            className={`flex items-center space-x-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${
              currentRoute === 'yield-monitoring'
                ? 'bg-white text-stone-900 shadow-xs dark:bg-stone-700 dark:text-white font-semibold'
                : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/60 dark:text-stone-300 dark:hover:bg-stone-700/50 dark:hover:text-white'
            }`}
          >
            <BarChart3 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Yield Monitoring</span>
          </button>

          <button
            id="nav-history-tab"
            onClick={() => onNavigate('history')}
            className={`flex items-center space-x-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${
              currentRoute === 'history'
                ? 'bg-white text-stone-900 shadow-xs dark:bg-stone-700 dark:text-white font-semibold'
                : 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/60 dark:text-stone-300 dark:hover:bg-stone-700/50 dark:hover:text-white'
            }`}
          >
            <History className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
            <span>History</span>
          </button>
        </nav>

        {/* Right Tools: Theme Switcher & Camera / Hardware Status */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          {/* Arduino / IoT Size Sorter Button */}
          <button
            id="nav-btn-arduino"
            onClick={onOpenArduinoModal}
            className={`flex items-center space-x-1.5 rounded-xl px-2.5 py-1.5 border text-xs font-semibold transition-all cursor-pointer ${
              arduinoConnected
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-300 dark:border-emerald-700 shadow-xs'
                : 'bg-stone-100 text-stone-700 border-stone-200 hover:bg-stone-200/80 dark:bg-stone-800 dark:text-stone-300 dark:border-stone-700/60 dark:hover:bg-stone-700'
            }`}
            title="Open Arduino Tomato Size Sorter Actuator Controller"
          >
            <Cpu className={`h-4 w-4 ${arduinoConnected ? 'text-emerald-600 dark:text-emerald-400 animate-pulse' : 'text-stone-500 dark:text-stone-400'}`} />
            <span className="hidden sm:inline">Arduino Sorter</span>
            <span className={`h-2 w-2 rounded-full ${arduinoConnected ? 'bg-emerald-500' : 'bg-stone-400'}`}></span>
          </button>

          {/* Clean Single Theme Toggle Button */}
          <button
            id="btn-theme-toggle"
            onClick={toggleTheme}
            className="p-2 rounded-xl text-stone-600 hover:text-stone-900 bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:text-white border border-stone-200 dark:border-stone-700/60 transition-colors cursor-pointer"
            title={`Switch to ${resolvedTheme === 'dark' ? 'Light' : 'Dark'} mode`}
          >
            {resolvedTheme === 'dark' ? (
              <Sun className="h-4 w-4 text-amber-400" />
            ) : (
              <Moon className="h-4 w-4 text-stone-600" />
            )}
          </button>

          {/* Camera Status Badge */}
          <div className="flex items-center">
            {cameraStatus === 'live' && (
              <div className="flex items-center space-x-1.5 rounded-full bg-emerald-100 dark:bg-emerald-950/80 px-2.5 py-1 border border-emerald-300 dark:border-emerald-600/60 text-[11px] font-bold text-emerald-800 dark:text-emerald-300 shadow-xs">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>LIVE</span>
              </div>
            )}
            {cameraStatus === 'requesting' && (
              <div className="flex items-center space-x-1.5 rounded-full bg-amber-100 dark:bg-amber-950/80 px-2.5 py-1 border border-amber-300 dark:border-amber-600/60 text-[11px] font-semibold text-amber-800 dark:text-amber-300">
                <Activity className="h-3 w-3 animate-spin text-amber-600 dark:text-amber-400" />
                <span className="hidden sm:inline">WAITING CAMERA</span>
                <span className="sm:hidden">WAIT</span>
              </div>
            )}
            {cameraStatus === 'blocked' && (
              <div className="flex items-center space-x-1.5 rounded-full bg-red-100 dark:bg-red-950/80 px-2.5 py-1 border border-red-300 dark:border-red-600/60 text-[11px] font-bold text-red-800 dark:text-red-300">
                <span className="h-2 w-2 rounded-full bg-red-500"></span>
                <span>BLOCKED</span>
              </div>
            )}
            {cameraStatus === 'no_device' && (
              <div className="flex items-center space-x-1.5 rounded-full bg-stone-100 dark:bg-stone-800 px-2.5 py-1 border border-stone-300 dark:border-stone-700 text-[11px] font-medium text-stone-700 dark:text-stone-300">
                <span>NO CAMERA</span>
              </div>
            )}
            {cameraStatus === 'off' && (
              <div className="flex items-center space-x-1.5 rounded-full bg-stone-100 dark:bg-stone-800 px-2.5 py-1 border border-stone-200 dark:border-stone-700 text-[11px] font-medium text-stone-600 dark:text-stone-400">
                <span className="h-1.5 w-1.5 rounded-full bg-stone-400 dark:bg-stone-500"></span>
                <span>STANDBY</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Navigation bar */}
      <div className="flex md:hidden border-t border-stone-200 dark:border-stone-800 bg-white/95 dark:bg-stone-950/90 px-2 py-1.5 justify-around text-xs transition-colors">
        <button
          onClick={() => onNavigate('dashboard')}
          className={`flex flex-col items-center py-1 px-3 rounded ${
            currentRoute === 'dashboard' ? 'text-red-600 dark:text-red-400 font-bold' : 'text-stone-500 dark:text-stone-400'
          }`}
        >
          <LayoutDashboard className="h-4 w-4" />
          <span className="text-[10px] mt-0.5">Dashboard</span>
        </button>
        <button
          onClick={() => onNavigate('live-stream')}
          className={`flex flex-col items-center py-1 px-3 rounded ${
            currentRoute === 'live-stream' ? 'text-red-600 dark:text-red-400 font-bold' : 'text-stone-500 dark:text-stone-400'
          }`}
        >
          <Camera className="h-4 w-4" />
          <span className="text-[10px] mt-0.5">Live Camera</span>
        </button>
        <button
          onClick={() => onNavigate('yield-monitoring')}
          className={`flex flex-col items-center py-1 px-2 rounded ${
            currentRoute === 'yield-monitoring' ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-stone-500 dark:text-stone-400'
          }`}
        >
          <BarChart3 className="h-4 w-4" />
          <span className="text-[10px] mt-0.5">Yield</span>
        </button>
        <button
          onClick={() => onNavigate('history')}
          className={`flex flex-col items-center py-1 px-3 rounded ${
            currentRoute === 'history' ? 'text-amber-600 dark:text-amber-400 font-bold' : 'text-stone-500 dark:text-stone-400'
          }`}
        >
          <History className="h-4 w-4" />
          <span className="text-[10px] mt-0.5">History</span>
        </button>
      </div>
    </header>
  );
};

