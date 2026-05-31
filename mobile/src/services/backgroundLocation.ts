import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NearbyOrg } from '../types';

export const BACKGROUND_LOCATION_TASK = 'BACKGROUND_LOCATION_TASK';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001';

// Show notifications when app is foregrounded
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Must be defined at module top level so it is registered on app launch
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async () => {
  try {
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    const token = await AsyncStorage.getItem('auth_token');
    if (!token) return BackgroundFetch.BackgroundFetchResult.NoData;

    const response = await fetch(`${BASE_URL}/visits/geofence`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        tech_lat: location.coords.latitude,
        tech_lng: location.coords.longitude,
      }),
    });

    if (!response.ok) return BackgroundFetch.BackgroundFetchResult.Failed;

    const data = (await response.json()) as { nearby_orgs: NearbyOrg[] };
    const nearbyOrgs = data.nearby_orgs ?? [];

    for (const org of nearbyOrgs) {
      const count = org.pending_machines?.length ?? 0;
      const distance = org.distance_km?.toFixed(1) ?? '?';

      await Notifications.scheduleNotificationAsync({
        content: {
          title: '🚨 Máquinas para coletar!',
          body: `Você está próximo de ${org.org_name} - ${count} máquina(s) pendente(s) a ${distance}km`,
          data: {
            org_id: org.org_id,
            org_name: org.org_name,
            screen: 'MachineList',
          },
        },
        trigger: null,
      });
    }

    return nearbyOrgs.length > 0
      ? BackgroundFetch.BackgroundFetchResult.NewData
      : BackgroundFetch.BackgroundFetchResult.NoData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export async function registerBackgroundTask(): Promise<void> {
  const status = await BackgroundFetch.getStatusAsync();
  if (
    status === BackgroundFetch.BackgroundFetchStatus.Restricted ||
    status === BackgroundFetch.BackgroundFetchStatus.Denied
  ) {
    return;
  }

  const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
  if (!isRegistered) {
    await BackgroundFetch.registerTaskAsync(BACKGROUND_LOCATION_TASK, {
      minimumInterval: 15 * 60,
      stopOnTerminate: false,
      startOnBoot: true,
    });
  }
}

export async function unregisterBackgroundTask(): Promise<void> {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
  if (isRegistered) {
    await BackgroundFetch.unregisterTaskAsync(BACKGROUND_LOCATION_TASK);
  }
}
