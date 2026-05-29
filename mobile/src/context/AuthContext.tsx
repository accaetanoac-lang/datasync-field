import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { login as apiLogin } from '../services/api';
import { Technician } from '../types';

const TOKEN_KEY = 'auth_token';
const TECH_KEY = 'auth_technician';

interface AuthState {
  technician: Technician | null;
  token: string | null;
  isAuthenticated: boolean;
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (employee_id: string) => Promise<void>;
  clearAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    technician: null,
    token: null,
    isAuthenticated: false,
    loading: true,
  });

  // On startup: restore session only when BOTH token and technician are present
  useEffect(() => {
    (async () => {
      try {
        const token = await AsyncStorage.getItem(TOKEN_KEY);
        const techRaw = await AsyncStorage.getItem(TECH_KEY);

        if (token && techRaw) {
          const technician: Technician = JSON.parse(techRaw);
          setState({ token, technician, isAuthenticated: true, loading: false });
        } else {
          // Missing either piece — force login
          await AsyncStorage.multiRemove([TOKEN_KEY, TECH_KEY]);
          setState({ token: null, technician: null, isAuthenticated: false, loading: false });
        }
      } catch {
        // Corrupt storage — clear and force login
        await AsyncStorage.multiRemove([TOKEN_KEY, TECH_KEY]);
        setState({ token: null, technician: null, isAuthenticated: false, loading: false });
      }
    })();
  }, []);

  const login = async (employee_id: string) => {
    const { token, technician } = await apiLogin(employee_id);
    await AsyncStorage.setItem(TOKEN_KEY, token);
    await AsyncStorage.setItem(TECH_KEY, JSON.stringify(technician));
    setState({ token, technician, isAuthenticated: true, loading: false });
  };

  // Clears all auth state from storage and memory — forces back to LoginScreen
  const clearAuth = async () => {
    await AsyncStorage.multiRemove([TOKEN_KEY, TECH_KEY]);
    setState({ token: null, technician: null, isAuthenticated: false, loading: false });
  };

  return (
    <AuthContext.Provider value={{ ...state, login, clearAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
