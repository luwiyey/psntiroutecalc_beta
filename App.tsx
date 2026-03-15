
import React, { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppProvider, useApp } from './context/AppContext';
import { LandingScreen } from './components/LandingScreen';
import LoginScreen from './components/LoginScreen';
import CalcScreen from './components/CalcScreen';
import BetweenStopsScreen from './components/BetweenStopsScreen';
import TallyScreen from './components/TallyScreen';
import LogsScreen from './components/LogsScreen';
import SetupScreen from './components/SetupScreen';
import RouteSelectionScreen from './components/RouteSelectionScreen';
import InstallAppBanner from './components/InstallAppBanner';
import UpdateAppBanner from './components/UpdateAppBanner';
import { flushAnalyticsQueue, trackAnalyticsEvent } from './utils/analytics';

type Tab = 'calc' | 'between' | 'tally' | 'logs' | 'setup';
const STARTED_STORAGE_KEY = 'psnti_started';
const INSTALL_BANNER_DISMISSED_KEY = 'psnti_install_banner_dismissed';
const SW_UPDATE_EVENT = 'psnti-sw-update';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const AppContent: React.FC = () => {
  const [hasStarted, setHasStarted] = useState(() => localStorage.getItem(STARTED_STORAGE_KEY) === 'true');
  const [activeTab, setActiveTab] = useState<Tab>('calc');
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [waitingRegistration, setWaitingRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const { authState } = useAuth();
  const { settings, showToast } = useApp();

  useEffect(() => {
    void flushAnalyticsQueue();

    const handleOnline = () => {
      void flushAnalyticsQueue();
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      ('standalone' in navigator && (navigator as Navigator & { standalone?: boolean }).standalone === true);

    if (isStandalone || localStorage.getItem(INSTALL_BANNER_DISMISSED_KEY) === 'true') {
      return;
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      void trackAnalyticsEvent({
        eventType: 'install_prompt_available',
        employeeId: authState.employeeId,
        employeeName: authState.employeeName,
        deviceId: authState.deviceId,
        routeId: settings.activeRouteId,
        appSurface: 'app-shell'
      });
    };

    const handleInstalled = () => {
      localStorage.setItem(INSTALL_BANNER_DISMISSED_KEY, 'true');
      setDeferredPrompt(null);
      showToast('App installed successfully');
      void trackAnalyticsEvent({
        eventType: 'app_installed',
        employeeId: authState.employeeId,
        employeeName: authState.employeeName,
        deviceId: authState.deviceId,
        routeId: settings.activeRouteId,
        appSurface: 'app-shell'
      });
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, [authState.deviceId, authState.employeeId, authState.employeeName, settings.activeRouteId, showToast]);

  useEffect(() => {
    const handleSwUpdate = (event: Event) => {
      const registration = (event as CustomEvent<ServiceWorkerRegistration>).detail;
      if (!registration?.waiting) return;
      setWaitingRegistration(registration);
      showToast('New version available', 'info');
      void trackAnalyticsEvent({
        eventType: 'update_available',
        employeeId: authState.employeeId,
        employeeName: authState.employeeName,
        deviceId: authState.deviceId,
        routeId: settings.activeRouteId,
        appSurface: 'app-shell'
      });
    };

    window.addEventListener(SW_UPDATE_EVENT, handleSwUpdate as EventListener);
    return () => {
      window.removeEventListener(SW_UPDATE_EVENT, handleSwUpdate as EventListener);
    };
  }, [authState.deviceId, authState.employeeId, authState.employeeName, settings.activeRouteId, showToast]);

  const dismissInstallBanner = () => {
    localStorage.setItem(INSTALL_BANNER_DISMISSED_KEY, 'true');
    setDeferredPrompt(null);
  };

  const handleRefreshToUpdate = () => {
    void trackAnalyticsEvent({
      eventType: 'update_refresh_requested',
      employeeId: authState.employeeId,
      employeeName: authState.employeeName,
      deviceId: authState.deviceId,
      routeId: settings.activeRouteId,
      appSurface: 'app-shell'
    });
    waitingRegistration?.waiting?.postMessage({ type: 'SKIP_WAITING' });
  };

  if (!hasStarted) {
    return <LandingScreen onFinish={() => {
      localStorage.setItem(STARTED_STORAGE_KEY, 'true');
      setHasStarted(true);
    }} />;
  }

  if (!authState.isAuthenticated) {
    return <LoginScreen />;
  }

  if (authState.pendingRouteSelection || !settings.hasAssignedRoute) {
    return <RouteSelectionScreen onComplete={() => setActiveTab('calc')} />;
  }

  const handleExit = () => setActiveTab('calc');

  const renderContent = () => {
    switch (activeTab) {
      case 'calc': return <CalcScreen />;
      case 'between': return <BetweenStopsScreen onExit={handleExit} />;
      case 'tally': return <TallyScreen onExit={handleExit} />;
      case 'logs': return <LogsScreen onExit={handleExit} />;
      case 'setup': return <SetupScreen onExit={handleExit} />;
      default: return <CalcScreen />;
    }
  };

  const navItems = [
    { id: 'calc', icon: 'calculate', label: 'FARE' },
    { id: 'tally', icon: 'fact_check', label: 'TALLY' },
    { id: 'between', icon: 'map', label: 'ROUTE' },
    { id: 'logs', icon: 'receipt_long', label: 'LOGS' },
    { id: 'setup', icon: 'settings', label: 'SETUP' }
  ];

  return (
    <div className="min-h-screen bg-[#f8f6f6] dark:bg-black transition-colors flex flex-col max-w-lg mx-auto relative shadow-[0_12px_36px_rgba(15,23,42,0.08)] dark:shadow-[0_12px_36px_rgba(0,0,0,0.35)]">
      <main className="flex-1 overflow-y-auto scrollbar-hide">
        {renderContent()}
      </main>

      {waitingRegistration ? (
        <UpdateAppBanner onRefresh={handleRefreshToUpdate} />
      ) : (
        <InstallAppBanner
          deferredPrompt={deferredPrompt}
          onDismiss={dismissInstallBanner}
          onInstalled={() => {
            localStorage.setItem(INSTALL_BANNER_DISMISSED_KEY, 'true');
            setDeferredPrompt(null);
          }}
        />
      )}

      <nav className="sticky bottom-0 left-0 right-0 z-50 bg-white/95 dark:bg-night-charcoal/95 flex items-center justify-around px-2 py-2 pb-[calc(env(safe-area-inset-bottom)+8px)] shadow-[0_-10px_30px_rgba(15,23,42,0.08)] backdrop-blur">
        {navItems.map(item => (
          <button 
            key={item.id}
            onClick={() => setActiveTab(item.id as Tab)}
            className={`flex flex-col items-center gap-1 flex-1 py-2 transition-all group ${activeTab === item.id ? 'text-primary' : 'text-slate-400 dark:text-slate-600'}`}
          >
            <span className="material-icons text-2xl">{item.icon}</span>
            <span className="text-[10px] font-black tracking-widest">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </AuthProvider>
  );
};

export default App;
