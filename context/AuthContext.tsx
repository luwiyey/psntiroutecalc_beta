
import React, { createContext, useContext, useState } from 'react';

interface AuthState {
  employeeName: string;
  employeeId: string;
  deviceId: string;
  isLoggedIn: boolean;
}

interface AuthContextType {
  authState: AuthState;
  login: (name: string, id: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [authState, setAuthState] = useState<AuthState>({
    employeeName: 'Mark Joseph M. Galvan',
    employeeId: '03-4450',
    deviceId: 'PH-PSNTI-9092',
    isLoggedIn: true
  });

  const login = (name: string, id: string) => {
    setAuthState(prev => ({ ...prev, employeeName: name, employeeId: id, isLoggedIn: true }));
  };

  const logout = () => {
    setAuthState(prev => ({ ...prev, isLoggedIn: false }));
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
