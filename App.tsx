
import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppProvider, useApp } from './context/AppContext';
import { LandingScreen } from './components/LandingScreen';
import LoginScreen from './components/LoginScreen';
import InstallAppBanner from './components/InstallAppBanner';
import UpdateAppBanner from './components/UpdateAppBanner';
import { flushAnalyticsQueue, trackAnalyticsEvent } from './utils/analytics';
import type { CurrentLocationSnapshot } from './utils/location';
import {
  getDistanceMeters,
  getLocationErrorMessage,
  queryLocationPermissionState,
  watchLiveLocation
} from './utils/location';
import { estimateTravelSpeedMetersPerSecond, getStopAlertRadius } from './utils/stop-data';

type Tab = 'calc' | 'alerts' | 'tally' | 'logs' | 'setup';
const STARTED_STORAGE_KEY = 'psnti_started';
const INSTALL_BANNER_DISMISSED_KEY = 'psnti_install_banner_dismissed';
const SW_UPDATE_EVENT = 'psnti-sw-update';
const CalcScreen = React.lazy(() => import('./components/CalcScreen'));
const AlertsScreen = React.lazy(() => import('./components/AlertsScreen'));
const TallyScreen = React.lazy(() => import('./components/TallyScreen'));
const LogsScreen = React.lazy(() => import('./components/LogsScreen'));
const SetupScreen = React.lazy(() => import('./components/SetupScreen'));
const RouteSelectionScreen = React.lazy(() => import('./components/RouteSelectionScreen'));

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const playReminderTone = async () => {
  if (typeof window === 'undefined') {
    return;
  }

  const AudioContextClass =
    window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!AudioContextClass) {
    return;
  }

  const audioContext = new AudioContextClass();
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.value = 880;
  gainNode.gain.value = 0.05;
  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.22);

  window.setTimeout(() => {
    void audioContext.close();
  }, 350);
};

const ScreenFallback = () => (
  <div className="flex min-h-[60vh] items-center justify-center px-6">
    <div className="rounded-[1.75rem] bg-white px-5 py-4 text-center shadow-md dark:bg-night-charcoal">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Loading</p>
      <p className="mt-2 text-sm font-bold text-slate-600 dark:text-slate-300">Preparing the next screen...</p>
    </div>
  </div>
);

const AppContent: React.FC = () => {
  const [hasStarted, setHasStarted] = useState(() => localStorage.getItem(STARTED_STORAGE_KEY) === 'true');
  const [activeTab, setActiveTab] = useState<Tab>('calc');
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [waitingRegistration, setWaitingRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const { authState } = useAuth();
  const {
    settings,
    showToast,
    activeRoute,
    stopReminders,
    setStopReminders,
    reminderSettings
  } = useApp();
  const lastReminderLocationRef = useRef<CurrentLocationSnapshot | null>(null);
  const reminderErrorShownRef = useRef(false);
  const activeRouteRef = useRef(activeRoute);
  const reminderSettingsRef = useRef(reminderSettings);

  useEffect(() => {
    activeRouteRef.current = activeRoute;
  }, [activeRoute]);

  useEffect(() => {
    reminderSettingsRef.current = reminderSettings;
  }, [reminderSettings]);

  const activeReminderCount = useMemo(
    () =>
      stopReminders.filter(
        reminder =>
          reminder.routeId === activeRoute.id &&
          reminder.enabled &&
          reminder.status !== 'done'
      ).length,
    [activeRoute.id, stopReminders]
  );

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

  useEffect(() => {
    if (!reminderSettings.enabled || activeReminderCount === 0) {
      lastReminderLocationRef.current = null;
      return;
    }

    let stopWatching: (() => void) | undefined;
    let isCancelled = false;
    reminderErrorShownRef.current = false;

    const triggerReminderFeedback = async (message: string) => {
      showToast(message, 'info');

      if (reminderSettingsRef.current.vibrationEnabled && typeof navigator.vibrate === 'function') {
        navigator.vibrate([180, 120, 180]);
      }

      if (reminderSettingsRef.current.soundEnabled) {
        await playReminderTone();
      }
    };

    const startReminderWatch = async () => {
      try {
        stopWatching = await watchLiveLocation(
          {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 0
          },
          snapshot => {
            if (isCancelled) {
              return;
            }

            const previousSnapshot = lastReminderLocationRef.current;
            lastReminderLocationRef.current = snapshot;
            const speedMetersPerSecond = estimateTravelSpeedMetersPerSecond(previousSnapshot, snapshot);
            const currentRoute = activeRouteRef.current;
            const alertMessages: string[] = [];

            setStopReminders(prev => {
              let changed = false;

              const nextReminders = prev.map(reminder => {
                if (
                  reminder.routeId !== currentRoute.id ||
                  !reminder.enabled ||
                  reminder.status === 'done'
                ) {
                  return reminder;
                }

                const matchedStop = currentRoute.stops.find(stop => stop.name === reminder.stopName);

                if (!matchedStop?.latitude || !matchedStop?.longitude) {
                  return reminder;
                }

                const distanceMeters = getDistanceMeters(
                  snapshot.latitude,
                  snapshot.longitude,
                  matchedStop.latitude,
                  matchedStop.longitude
                );
                const etaSeconds =
                  speedMetersPerSecond && speedMetersPerSecond > 1
                    ? distanceMeters / speedMetersPerSecond
                    : null;
                const arrivalRadius = getStopAlertRadius(matchedStop, snapshot.accuracy);

                if (!reminder.alertsTriggered.arrival && distanceMeters <= arrivalRadius) {
                  changed = true;
                  alertMessages.push(
                    `Arriving now: ${reminder.passengerCount} pax for ${reminder.stopName}`
                  );
                  return {
                    ...reminder,
                    status: 'arriving',
                    alertsTriggered: {
                      twoMinute: true,
                      oneMinute: true,
                      arrival: true
                    }
                  };
                }

                if (
                  etaSeconds !== null &&
                  etaSeconds <= 60 &&
                  !reminder.alertsTriggered.oneMinute
                ) {
                  changed = true;
                  alertMessages.push(
                    `About 1 min away: ${reminder.passengerCount} pax for ${reminder.stopName}`
                  );
                  return {
                    ...reminder,
                    alertsTriggered: {
                      twoMinute: true,
                      oneMinute: true,
                      arrival: false
                    }
                  };
                }

                if (
                  etaSeconds !== null &&
                  etaSeconds <= 120 &&
                  !reminder.alertsTriggered.twoMinute
                ) {
                  changed = true;
                  alertMessages.push(
                    `About 2 min away: ${reminder.passengerCount} pax for ${reminder.stopName}`
                  );
                  return {
                    ...reminder,
                    alertsTriggered: {
                      ...reminder.alertsTriggered,
                      twoMinute: true
                    }
                  };
                }

                return reminder;
              });

              return changed ? nextReminders : prev;
            });

            alertMessages.forEach(message => {
              void triggerReminderFeedback(message);
            });
          },
          async error => {
            if (reminderErrorShownRef.current || isCancelled) {
              return;
            }

            reminderErrorShownRef.current = true;
            const permissionState = await queryLocationPermissionState();
            showToast(getLocationErrorMessage(error, permissionState, false), 'info');
          }
        );
      } catch (error) {
        if (isCancelled) {
          return;
        }

        const permissionState = await queryLocationPermissionState();
        showToast(
          getLocationErrorMessage(
            error instanceof Error ? error : new Error('Unable to start drop-off alerts.'),
            permissionState,
            false
          ),
          'info'
        );
      }
    };

    void startReminderWatch();

    return () => {
      isCancelled = true;
      lastReminderLocationRef.current = null;
      if (stopWatching) {
        stopWatching();
      }
    };
  }, [activeReminderCount, reminderSettings.enabled, setStopReminders, showToast]);

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
    return (
      <Suspense fallback={<ScreenFallback />}>
        <RouteSelectionScreen onComplete={() => setActiveTab('calc')} />
      </Suspense>
    );
  }

  const handleExit = () => setActiveTab('calc');

  const renderContent = () => {
    switch (activeTab) {
      case 'calc': return <CalcScreen />;
      case 'alerts': return <AlertsScreen onExit={handleExit} />;
      case 'tally': return <TallyScreen onExit={handleExit} />;
      case 'logs': return <LogsScreen onExit={handleExit} />;
      case 'setup': return <SetupScreen onExit={handleExit} />;
      default: return <CalcScreen />;
    }
  };

  const navItems = [
    { id: 'calc', icon: 'calculate', label: 'FARE' },
    { id: 'tally', icon: 'fact_check', label: 'TALLY' },
    { id: 'alerts', icon: 'notifications_active', label: 'ALERTS' },
    { id: 'logs', icon: 'receipt_long', label: 'LOGS' },
    { id: 'setup', icon: 'settings', label: 'SETUP' }
  ];

  return (
    <div className="min-h-screen bg-[#f8f6f6] dark:bg-black transition-colors flex flex-col max-w-lg mx-auto relative shadow-[0_12px_36px_rgba(15,23,42,0.08)] dark:shadow-[0_12px_36px_rgba(0,0,0,0.35)]">
      <main className="flex-1 overflow-y-auto scrollbar-hide">
        <Suspense fallback={<ScreenFallback />}>
          {renderContent()}
        </Suspense>
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
