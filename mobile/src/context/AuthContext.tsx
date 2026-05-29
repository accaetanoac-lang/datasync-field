import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { login as apiLogin } from '../services/api';
import { Technician } from '../types';
import { STORAGE_KEYS } from '../services/sync';

interface AuthState {
  technician: Technician | null;
  token: string | null;
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (employee_id: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    technician: null,
    token: null,
    loading: true,
  });

  useEffect(() => {
    (async () => {
      const token = await AsyncStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
      const techRaw = await AsyncStorage.getItem('auth_technician');
      if (token && techRaw) {
        setState({ token, technician: JSON.parse(techRaw), loading: false });
      } else {
        setState((s) => ({ ...s, loading: false }));
      }
    })();
  }, []);

  const login = async (employee_id: string) => {
    const { token, technician } = await apiLogin(employee_id);
    await AsyncStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, token);
    await AsyncStorage.setItem('auth_technician', JSON.stringify(technician));
    setState({ token, technician, loading: false });
  };

  const logout = async () => {
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.AUTH_TOKEN,
      'auth_technician',
    ]);
    setState({ token: null, technician: null, loading: false });
  };

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
