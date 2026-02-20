
import React, { createContext, useContext, useState } from 'react';

interface AuthState {
  employeeName: string | null;
  employeeId: string | null;
  deviceId: string;
  isAuthenticated: boolean;
}

interface AuthContextType {
  authState: AuthState;
  login: (name: string, id: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [authState, setAuthState] = useState<AuthState>({
    employeeName: null,
    employeeId: null,
    deviceId: 'PH-PSNTI-9092',
    isAuthenticated: false
  });

  const login = (name: string, id: string) => {
    setAuthState(prev => ({ ...prev, employeeName: name, employeeId: id, isAuthenticated: true }));
  };

  const logout = () => {
    setAuthState(prev => ({ ...prev, employeeName: null, employeeId: null, isAuthenticated: false }));
  };

  return (
    <AuthContext.Provider value={{ authState, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};
