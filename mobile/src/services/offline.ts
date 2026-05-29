import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { PendingActivity, PendingVisit } from '../types';
import { syncPendingActivities, syncPendingVisits } from './sync';

const ACTIVITY_QUEUE_KEY = 'pending_activities';
const VISIT_QUEUE_KEY = 'pending_visits';

export async function enqueueActivity(activity: PendingActivity): Promise<void> {
  const raw = await AsyncStorage.getItem(ACTIVITY_QUEUE_KEY);
  const queue: PendingActivity[] = raw ? JSON.parse(raw) : [];
  queue.push(activity);
  await AsyncStorage.setItem(ACTIVITY_QUEUE_KEY, JSON.stringify(queue));
}

export async function enqueueVisit(visit: PendingVisit): Promise<void> {
  const raw = await AsyncStorage.getItem(VISIT_QUEUE_KEY);
  const queue: PendingVisit[] = raw ? JSON.parse(raw) : [];
  queue.push(visit);
  await AsyncStorage.setItem(VISIT_QUEUE_KEY, JSON.stringify(queue));
}

export async function getPendingActivityCount(): Promise<number> {
  const raw = await AsyncStorage.getItem(ACTIVITY_QUEUE_KEY);
  if (!raw) return 0;
  const queue: PendingActivity[] = JSON.parse(raw);
  return queue.length;
}

export async function flushQueue(): Promise<void> {
  await syncPendingActivities();
  await syncPendingVisits();
}

export function startAutoSync(): () => void {
  let wasOffline = false;

  const unsubscribe = NetInfo.addEventListener((state) => {
    const online = Boolean(state.isConnected && state.isInternetReachable !== false);

    if (!online) {
      wasOffline = true;
    } else if (wasOffline) {
      wasOffline = false;
      flushQueue().catch(() => {});
    }
  });

  return unsubscribe;
}
