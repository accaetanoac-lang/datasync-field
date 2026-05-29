import 'react-native-gesture-handler';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from './src/context/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';
import { useNetworkSync } from './src/hooks/useNetworkSync';

function InnerApp() {
  useNetworkSync();
  return (
    <>
      <StatusBar style="light" />
      <AppNavigator />
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <InnerApp />
    </AuthProvider>
  );
}
