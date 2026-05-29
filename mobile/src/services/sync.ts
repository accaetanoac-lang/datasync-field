import AsyncStorage from '@react-native-async-storage/async-storage';
import { startActivity, finishActivity, sendGeofence, searchOrgs, getOrgMachines } from './api';
import { PendingActivity, PendingVisit, OrgCache, MachinesCache } from '../types';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export const STORAGE_KEYS = {
  AUTH_TOKEN: 'auth_token',
  PENDING_ACTIVITIES: 'pending_activities',
  PENDING_VISITS: 'pending_visits',
  MACHINES_CACHE: 'machines_cache',
  ORGS_CACHE: 'orgs_cache',
} as const;

export async function syncPendingActivities(): Promise<void> {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.PENDING_ACTIVITIES);
  if (!raw) return;

  const pending: PendingActivity[] = JSON.parse(raw);
  if (pending.length === 0) return;

  const remaining: PendingActivity[] = [];

  for (const p of pending) {
    try {
      const activity = await startActivity({
        org_id: p.org_id,
        machine_id: p.machine_id,
        method: p.method,
        current_hours: p.current_hours,
        tech_lat: p.tech_lat,
        tech_lng: p.tech_lng,
        synced_offline: true,
      });

      if (p.status === 'completed' && activity.id) {
        await finishActivity(activity.id, p.notes);
      }
      // Synced successfully — do not add to remaining
    } catch {
      remaining.push(p);
    }
  }

  await AsyncStorage.setItem(STORAGE_KEYS.PENDING_ACTIVITIES, JSON.stringify(remaining));
}

export async function syncPendingVisits(): Promise<void> {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.PENDING_VISITS);
  if (!raw) return;

  const pending: PendingVisit[] = JSON.parse(raw);
  if (pending.length === 0) return;

  const remaining: PendingVisit[] = [];

  for (const v of pending) {
    try {
      await sendGeofence(v.tech_lat, v.tech_lng);
    } catch {
      remaining.push(v);
    }
  }

  await AsyncStorage.setItem(STORAGE_KEYS.PENDING_VISITS, JSON.stringify(remaining));
}

export async function queueActivity(activity: PendingActivity): Promise<void> {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.PENDING_ACTIVITIES);
  const pending: PendingActivity[] = raw ? JSON.parse(raw) : [];
  pending.push(activity);
  await AsyncStorage.setItem(STORAGE_KEYS.PENDING_ACTIVITIES, JSON.stringify(pending));
}

export async function queueVisit(visit: PendingVisit): Promise<void> {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.PENDING_VISITS);
  const pending: PendingVisit[] = raw ? JSON.parse(raw) : [];
  pending.push(visit);
  await AsyncStorage.setItem(STORAGE_KEYS.PENDING_VISITS, JSON.stringify(pending));
}

export async function getCachedOrgs(search: string): Promise<OrgCache | null> {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.ORGS_CACHE);
  if (!raw) return null;
  const cache: OrgCache = JSON.parse(raw);
  if (Date.now() - cache.timestamp > CACHE_TTL_MS) return null;
  return cache;
}

export async function setCachedOrgs(data: OrgCache['data']): Promise<void> {
  const cache: OrgCache = { data, timestamp: Date.now() };
  await AsyncStorage.setItem(STORAGE_KEYS.ORGS_CACHE, JSON.stringify(cache));
}

export async function getCachedMachines(orgId: number): Promise<MachinesCache[number] | null> {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.MACHINES_CACHE);
  if (!raw) return null;
  const cache: MachinesCache = JSON.parse(raw);
  const entry = cache[orgId];
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) return null;
  return entry;
}

export async function setCachedMachines(orgId: number, data: MachinesCache[number]['data']): Promise<void> {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.MACHINES_CACHE);
  const cache: MachinesCache = raw ? JSON.parse(raw) : {};
  cache[orgId] = { data, timestamp: Date.now() };
  await AsyncStorage.setItem(STORAGE_KEYS.MACHINES_CACHE, JSON.stringify(cache));
}

export async function refreshCaches(): Promise<void> {
  try {
    const orgs = await searchOrgs('');
    await setCachedOrgs(orgs);
  } catch {
    // Ignore — cache refresh is best-effort
  }
}

export async function runFullSync(): Promise<void> {
  await syncPendingActivities();
  await syncPendingVisits();
  await refreshCaches();
}
