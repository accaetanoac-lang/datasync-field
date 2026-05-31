import React, { useEffect } from 'react';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { Alert, ActivityIndicator, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useAuth } from '../context/AuthContext';
import { getOrg } from '../services/api';
import LoginScreen from '../screens/LoginScreen';
import SearchOrgScreen from '../screens/SearchOrgScreen';
import MachineListScreen from '../screens/MachineListScreen';
import MachineDetailScreen from '../screens/MachineDetailScreen';
import ActivityScreen, { ACTIVE_ACTIVITY_KEY } from '../screens/ActivityScreen';
import DiagnosisScreen from '../screens/DiagnosisScreen';
import ConnectivityDiagnosisScreen from '../screens/ConnectivityDiagnosisScreen';
import NonJDMachineScreen from '../screens/NonJDMachineScreen';
import { Organization, Machine } from '../types';

type SavedActivity = {
  activityId: number;
  startedAt: string;
  machine: Machine;
  org: Organization;
  method: 'starlink_data_sync' | 'pen_drive';
};

export type RootStackParamList = {
  Login: undefined;
  SearchOrg: undefined;
  MachineList: { org: Organization };
  MachineDetail: { machine: Machine; org: Organization };
  Activity: {
    machine: Machine;
    org: Organization;
    activityId: number;
    method: 'starlink_data_sync' | 'pen_drive';
    startedAt: string;
  };
  Diagnosis: {
    machine: Machine;
    org: Organization;
    currentHours: number;
    hoursDiff: number;
  };
  ConnectivityDiagnosis: {
    machine: Machine;
    org: Organization;
    currentHours: number;
  };
  NonJDMachine: { org?: Organization; prefillPin?: string };
};

const Stack = createStackNavigator<RootStackParamList>();

const JD_GREEN = '#367C2B';

export default function AppNavigator() {
  const { isAuthenticated, loading } = useAuth();
  const navigationRef = useNavigationContainerRef<RootStackParamList>();

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(async (response) => {
      const data = response.notification.request.content.data as {
        screen?: string;
        org_id?: number;
        org_name?: string;
      };

      if (data.screen !== 'MachineList' || !data.org_id) return;

      try {
        const org = await getOrg(data.org_id);
        if (navigationRef.isReady()) {
          navigationRef.navigate('MachineList', { org });
        }
      } catch {
        // User not logged in or org fetch failed — ignore
      }
    });

    return () => subscription.remove();
  }, []);

  // After login: if the technician force-closed the app mid-activity, offer to resume
  useEffect(() => {
    if (loading || !isAuthenticated) return;

    let cancelled = false;

    async function checkActiveActivity() {
      try {
        const raw = await AsyncStorage.getItem(ACTIVE_ACTIVITY_KEY);
        if (!raw || cancelled) return;

        const saved: SavedActivity = JSON.parse(raw);
        if (!saved.activityId || !saved.startedAt) return;

        const machineName = saved.machine.pin ?? saved.machine.custom_name ?? '—';

        // Small delay so the navigation container is fully mounted
        setTimeout(() => {
          if (cancelled || !navigationRef.isReady()) return;
          Alert.alert(
            'Atividade em andamento',
            `Você tem uma coleta ativa em ${machineName} (${saved.org.name}). Deseja retornar?`,
            [
              {
                text: 'Descartar',
                style: 'destructive',
                onPress: () => AsyncStorage.removeItem(ACTIVE_ACTIVITY_KEY).catch(() => {}),
              },
              {
                text: 'Retornar',
                onPress: () =>
                  navigationRef.navigate('Activity', {
                    activityId: saved.activityId,
                    startedAt: saved.startedAt,
                    machine: saved.machine,
                    org: saved.org,
                    method: saved.method,
                  }),
              },
            ],
            { cancelable: false },
          );
        }, 600);
      } catch {
        // Ignore malformed AsyncStorage data
      }
    }

    checkActiveActivity();
    return () => { cancelled = true; };
  }, [isAuthenticated, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={JD_GREEN} />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: JD_GREEN },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: 'bold' },
        }}
      >
        {!isAuthenticated ? (
          // Not authenticated — Login is the only reachable screen
          <Stack.Screen
            name="Login"
            component={LoginScreen}
            options={{ headerShown: false }}
          />
        ) : (
          // Authenticated — main stack; Login is not reachable
          <>
            <Stack.Screen
              name="SearchOrg"
              component={SearchOrgScreen}
              options={{ title: 'Buscar Organização', headerLeft: () => null }}
            />
            <Stack.Screen
              name="MachineList"
              component={MachineListScreen}
              options={({ route }) => ({ title: route.params.org.name })}
            />
            <Stack.Screen
              name="MachineDetail"
              component={MachineDetailScreen}
              options={{ title: 'Detalhe da Máquina' }}
            />
            <Stack.Screen
              name="Activity"
              component={ActivityScreen}
              options={{ title: 'Atividade em Andamento' }}
            />
            <Stack.Screen
              name="Diagnosis"
              component={DiagnosisScreen}
              options={{ title: '🔧 Diagnóstico de Conectividade' }}
            />
            <Stack.Screen
              name="ConnectivityDiagnosis"
              component={ConnectivityDiagnosisScreen}
              options={{ title: '🔧 Diagnóstico de Conectividade' }}
            />
            <Stack.Screen
              name="NonJDMachine"
              component={NonJDMachineScreen}
              options={{ title: 'Máquina Não John Deere' }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
