import React, { createContext, useContext, useEffect, useState } from 'react';
import { trackAnalyticsEvent } from '../utils/analytics';

interface AuthState {
  employeeName: string | null;
  employeeId: string | null;
  deviceId: string;
  isAuthenticated: boolean;
  pendingRouteSelection: boolean;
}

interface AuthContextType {
  authState: AuthState;
  login: (name: string, id: string) => void;
  completeRouteSelection: () => void;
  logout: () => void;
}

const AUTH_STORAGE_KEY = 'psnti_auth';
const DEVICE_STORAGE_KEY = 'psnti_device_id';

const createDeviceId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `PH-PSNTI-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  }

  return `PH-PSNTI-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
};

const getStoredDeviceId = () => {
  const savedDeviceId = localStorage.getItem(DEVICE_STORAGE_KEY);
  if (savedDeviceId) {
    return savedDeviceId;
  }

  const nextDeviceId = createDeviceId();
  localStorage.setItem(DEVICE_STORAGE_KEY, nextDeviceId);
  return nextDeviceId;
};

const getInitialAuthState = (): AuthState => {
  const deviceId = getStoredDeviceId();
  const savedAuth = localStorage.getItem(AUTH_STORAGE_KEY);

  if (!savedAuth) {
    return {
      employeeName: null,
      employeeId: null,
      deviceId,
      isAuthenticated: false,
      pendingRouteSelection: false
    };
  }

  try {
    const parsed = JSON.parse(savedAuth) as Partial<AuthState>;
    return {
      employeeName: parsed.employeeName ?? null,
      employeeId: parsed.employeeId ?? null,
      deviceId,
      isAuthenticated: Boolean(parsed.isAuthenticated && parsed.employeeName && parsed.employeeId),
      pendingRouteSelection: Boolean(parsed.pendingRouteSelection)
    };
  } catch {
    return {
      employeeName: null,
      employeeId: null,
      deviceId,
      isAuthenticated: false,
      pendingRouteSelection: false
    };
  }
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [authState, setAuthState] = useState<AuthState>(() => getInitialAuthState());

  useEffect(() => {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
      employeeName: authState.employeeName,
      employeeId: authState.employeeId,
      isAuthenticated: authState.isAuthenticated,
      pendingRouteSelection: authState.pendingRouteSelection
    }));
  }, [authState.employeeId, authState.employeeName, authState.isAuthenticated, authState.pendingRouteSelection]);

  const login = (name: string, id: string) => {
    void trackAnalyticsEvent({
      eventType: 'login',
      employeeId: id,
      employeeName: name,
      deviceId: authState.deviceId,
      appSurface: 'login'
    });
    setAuthState(prev => ({
      ...prev,
      employeeName: name,
      employeeId: id,
      isAuthenticated: true,
      pendingRouteSelection: true
    }));
  };

  const completeRouteSelection = () => {
    setAuthState(prev => ({ ...prev, pendingRouteSelection: false }));
  };

  const logout = () => {
    void trackAnalyticsEvent({
      eventType: 'logout',
      employeeId: authState.employeeId,
      employeeName: authState.employeeName,
      deviceId: authState.deviceId,
      appSurface: 'setup'
    });
    setAuthState(prev => ({
      ...prev,
      employeeName: null,
      employeeId: null,
      isAuthenticated: false,
      pendingRouteSelection: false
    }));
  };

  return (
    <AuthContext.Provider value={{ authState, login, completeRouteSelection, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
