/**
 * BlightDetect+ Tomato Vision Stream Main Application
 */
import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar.tsx';
import { DashboardRoute } from './routes/index.tsx';
import { LiveStreamRoute } from './routes/live-stream.tsx';
import { HistoryRoute } from './routes/history.tsx';
import { YieldMonitoringRoute } from './routes/yield-monitoring.tsx';
import { ArduinoConnectorModal } from './components/ArduinoConnectorModal.tsx';
import { FirebaseDatabaseModal } from './components/FirebaseDatabaseModal.tsx';
import { useDetectionSession } from './hooks/useDetectionSession.ts';
import { ThemeProvider } from './context/ThemeContext.tsx';
import type { CameraStatus } from './types.ts';

function AppContent() {
  const [currentRoute, setCurrentRoute] = useState<string>('dashboard');
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('off');
  const [isArduinoModalOpen, setIsArduinoModalOpen] = useState<boolean>(false);
  const [isFirebaseModalOpen, setIsFirebaseModalOpen] = useState<boolean>(false);

  const {
    session,
    counts,
    recentEvents,
    startNewSession,
    recordUniqueTomato,
    endSession,
  } = useDetectionSession();

  // Sync route with URL Hash if present
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '').trim();
      if (['dashboard', 'live-stream', 'yield-monitoring', 'history'].includes(hash)) {
        setCurrentRoute(hash);
      }
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleNavigate = (route: string) => {
    setCurrentRoute(route);
    window.location.hash = route;
    // Auto-scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // If navigating to live-stream and not yet started, create session
    if (route === 'live-stream' && !session) {
      startNewSession();
    }
  };

  // Start new session when camera starts
  const handleStartCamera = () => {
    startNewSession();
  };

  const handleStopCamera = () => {
    endSession();
  };

  return (
    <div className="min-h-screen bg-stone-100 dark:bg-stone-950 text-stone-900 dark:text-stone-100 flex flex-col font-sans selection:bg-red-500 selection:text-white transition-colors duration-200">
      {/* Navigation Header */}
      <Navbar
        currentRoute={currentRoute}
        onNavigate={handleNavigate}
        cameraStatus={cameraStatus}
        sessionCounts={counts}
        onOpenArduinoModal={() => setIsArduinoModalOpen(true)}
      />

      {/* Main Content View Container */}
      <main className="flex-1 pb-16">
        {currentRoute === 'dashboard' && (
          <DashboardRoute
            currentCounts={counts}
            liveEvents={recentEvents}
            cameraStatus={cameraStatus}
            session={session}
            onNavigate={handleNavigate}
            onStartLiveSession={startNewSession}
          />
        )}

        {currentRoute === 'live-stream' && (
          <LiveStreamRoute
            session={session}
            counts={counts}
            recentEvents={recentEvents}
            cameraStatus={cameraStatus}
            setCameraStatus={setCameraStatus}
            onTomatoCounted={recordUniqueTomato}
            onStopCamera={handleStopCamera}
            onStartCamera={handleStartCamera}
            onNavigate={handleNavigate}
            onOpenArduinoModal={() => setIsArduinoModalOpen(true)}
          />
        )}

        {currentRoute === 'yield-monitoring' && (
          <YieldMonitoringRoute
            currentCounts={counts}
            liveEvents={recentEvents}
          />
        )}

        {currentRoute === 'history' && <HistoryRoute />}
      </main>

      {/* Arduino & IoT Size Sorter Modal */}
      <ArduinoConnectorModal
        isOpen={isArduinoModalOpen}
        onClose={() => setIsArduinoModalOpen(false)}
      />

      {/* Firebase Realtime Database Inspector Modal */}
      <FirebaseDatabaseModal
        isOpen={isFirebaseModalOpen}
        onClose={() => setIsFirebaseModalOpen(false)}
      />

      {/* Footer */}
      <footer className="border-t border-stone-200 dark:border-stone-900 bg-white dark:bg-stone-950 py-6 text-center text-xs text-stone-500 dark:text-stone-400 transition-colors">
        <div className="mx-auto max-w-7xl px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <span className="font-bold text-stone-800 dark:text-stone-300">BlightDetect+</span>
            <span>• Tomato Vision Stream & Conveyor Sorter</span>
          </div>
          <div className="flex items-center space-x-4 text-[11px] text-stone-500 dark:text-stone-400">
            <span>Centroid Multi-Object Tracker</span>
            <span>•</span>
            <span>YOLOv11 Inference Engine</span>
            <span>•</span>
            <span>Firestore History Storage</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

