import React, { useEffect } from 'react';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { ActivityIndicator, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useAuth } from '../context/AuthContext';
import { getOrg } from '../services/api';
import LoginScreen from '../screens/LoginScreen';
import SearchOrgScreen from '../screens/SearchOrgScreen';
import MachineListScreen from '../screens/MachineListScreen';
import MachineDetailScreen from '../screens/MachineDetailScreen';
import ActivityScreen from '../screens/ActivityScreen';
import NonJDMachineScreen from '../screens/NonJDMachineScreen';
import { Organization, Machine } from '../types';

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
  NonJDMachine: { org?: Organization };
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
