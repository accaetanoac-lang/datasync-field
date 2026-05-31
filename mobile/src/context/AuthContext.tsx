import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import { login as apiLogin, sendPushToken } from '../services/api';
import { registerBackgroundTask } from '../services/backgroundLocation';
import { Technician } from '../types';

const TOKEN_KEY = 'auth_token';
const TECH_KEY = 'auth_technician';

const EXPO_PROJECT_ID = 'ee547311-b614-4bf5-981a-9f127f7ff445';

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

async function setupNotifications(): Promise<void> {
  try {
    const { status: notifStatus } = await Notifications.requestPermissionsAsync();
    if (notifStatus !== 'granted') return;

    const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
    if (fgStatus !== 'granted') return;

    const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId: EXPO_PROJECT_ID });
    await sendPushToken(tokenData.data);

    if (bgStatus === 'granted') {
      await registerBackgroundTask();
    }
  } catch (err) {
    console.warn('[AuthContext] Notification setup failed:', err);
  }
}

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
    // Request permissions and register push token without blocking navigation
    setupNotifications().catch(() => {});
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
