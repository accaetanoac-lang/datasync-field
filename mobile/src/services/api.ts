import axios, { AxiosInstance, AxiosError } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Organization, Machine, Activity, Technician, NearbyOrg, MachineSearchResult } from '../types';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001';

const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    if (error.response?.status === 401) {
      await AsyncStorage.removeItem('auth_token');
    }
    return Promise.reject(error);
  }
);

// Auth
export async function login(employee_id: string): Promise<{ token: string; technician: Technician }> {
  const res = await api.post<{ token: string; technician: Technician }>('/auth/login', { employee_id });
  return res.data;
}

export async function refreshToken(): Promise<string> {
  const res = await api.post<{ token: string }>('/auth/refresh');
  return res.data.token;
}

// Orgs
export async function searchOrgs(search: string): Promise<Organization[]> {
  const res = await api.get<Organization[]>('/orgs', { params: { search } });
  return res.data;
}

export async function getOrg(id: number): Promise<Organization> {
  const res = await api.get<Organization>(`/orgs/${id}`);
  return res.data;
}

export async function getOrgMachines(orgId: number): Promise<Machine[]> {
  const res = await api.get<Machine[]>(`/orgs/${orgId}/machines`);
  return res.data;
}

// Machines
export async function getMachineByPin(pin: string): Promise<Machine> {
  const res = await api.get<Machine>(`/machines/${encodeURIComponent(pin)}`);
  return res.data;
}

export async function createNonJDMachine(data: {
  org_id?: number;
  custom_name: string;
  custom_description?: string;
}): Promise<Machine> {
  const res = await api.post<Machine>('/machines/non-jd', data);
  return res.data;
}

// Activities
export async function startActivity(data: {
  org_id?: number;
  machine_id?: number;
  method: 'starlink_data_sync' | 'pen_drive';
  current_hours?: number;
  tech_lat?: number;
  tech_lng?: number;
  synced_offline?: boolean;
}): Promise<Activity> {
  const res = await api.post<Activity>('/activities', data);
  return res.data;
}

export async function startDiagnosisActivity(data: {
  org_id?: number;
  machine_id?: number;
  current_hours?: number;
  tech_lat?: number;
  tech_lng?: number;
}): Promise<Activity> {
  const res = await api.post<Activity>('/activities', {
    ...data,
    method: 'diagnosis',
    is_diagnosis: true,
    connectivity_issue: true,
  });
  return res.data;
}

export async function pauseActivity(id: number): Promise<{ paused_at: string }> {
  const res = await api.put<{ paused_at: string }>(`/activities/${id}/pause`);
  return res.data;
}

export async function resumeActivity(id: number): Promise<{ total_pause_minutes: number }> {
  const res = await api.put<{ total_pause_minutes: number }>(`/activities/${id}/resume`);
  return res.data;
}

export async function finishActivity(id: number, notes?: string): Promise<Activity> {
  const res = await api.put<Activity>(`/activities/${id}/finish`, { notes });
  return res.data;
}

export async function finishDiagnosisActivity(
  id: number,
  data: {
    diagnosis_result: string;
    diagnosis_checklist: boolean[] | Record<string, string | null>;
    total_pause_minutes: number;
    notes?: string;
  }
): Promise<Activity> {
  const res = await api.put<Activity>(`/activities/${id}/finish`, data);
  return res.data;
}

export async function uploadActivityPhoto(id: number, photoUri: string): Promise<{ photo_url: string }> {
  const token = await AsyncStorage.getItem('auth_token');

  const formData = new FormData();
  // React Native FormData requires this object shape; type cast is intentional
  formData.append('photo', {
    uri: photoUri,
    name: `panel_${id}_${Date.now()}.jpg`,
    type: 'image/jpeg',
  } as unknown as Blob);

  // Use fetch directly so React Native sets Content-Type + boundary automatically.
  // axios with a manual 'multipart/form-data' header omits the boundary, breaking multer.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(`${BASE_URL}/activities/${id}/photo`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token ?? ''}` },
      body: formData,
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error((body as { error?: string }).error ?? `Upload failed: ${response.status}`);
    }

    return (await response.json()) as { photo_url: string };
  } finally {
    clearTimeout(timer);
  }
}

export async function uploadConnectivityPhoto(id: number, photoUri: string): Promise<{ connectivity_photo_url: string }> {
  const token = await AsyncStorage.getItem('auth_token');
  const formData = new FormData();
  formData.append('photo', {
    uri: photoUri,
    name: `connectivity_${id}_${Date.now()}.jpg`,
    type: 'image/jpeg',
  } as unknown as Blob);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(`${BASE_URL}/activities/${id}/connectivity-photo`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token ?? ''}` },
      body: formData,
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error((body as { error?: string }).error ?? `Upload failed: ${response.status}`);
    }
    return (await response.json()) as { connectivity_photo_url: string };
  } finally {
    clearTimeout(timer);
  }
}

export async function finishDataCollection(id: number, data: {
  method: string;
  diagnosis_result?: string;
}): Promise<Activity> {
  const res = await api.put<Activity>(`/activities/${id}/finish`, data);
  return res.data;
}

export async function markNoUse(id: number): Promise<Activity> {
  const res = await api.put<Activity>(`/activities/${id}/no-use`);
  return res.data;
}

export async function createNoUseActivity(data: {
  org_id?: number;
  machine_id?: number;
  current_hours?: number;
  tech_lat?: number;
  tech_lng?: number;
  synced_offline?: boolean;
}): Promise<Activity> {
  const res = await api.post<Activity>('/activities/no-use-direct', data);
  return res.data;
}

// Machine search by PIN / chassis / org name
export async function searchMachines(pin: string): Promise<MachineSearchResult[]> {
  const res = await api.get<MachineSearchResult[]>('/machines/search', { params: { pin } });
  return res.data;
}

// Geofence
export async function sendGeofence(
  tech_lat: number,
  tech_lng: number,
): Promise<{ nearby_orgs: NearbyOrg[] }> {
  const res = await api.post<{ nearby_orgs: NearbyOrg[] }>('/visits/geofence', { tech_lat, tech_lng });
  return res.data;
}

// Non-JD machine registry
export async function searchNonJdMachine(serial: string): Promise<{
  found: boolean;
  machine: { id: number; serial_number?: string; custom_name: string; brand?: string; model?: string; description?: string; org_names?: string[] } | null;
}> {
  const res = await api.get('/non-jd-machines', { params: { serial } });
  return res.data;
}

export async function registerNonJdMachine(data: {
  serial_number?: string;
  custom_name: string;
  brand?: string;
  model?: string;
  description?: string;
  org_id?: number;
}): Promise<{ id: number; machine_id: number; custom_name: string; serial_number?: string; brand?: string; model?: string }> {
  const res = await api.post('/non-jd-machines', data);
  return res.data;
}

export async function getNonJdMachinesForOrg(orgId: number): Promise<{ id: number; custom_name: string; brand?: string; model?: string; serial_number?: string }[]> {
  const res = await api.get('/non-jd-machines', { params: { org_id: orgId } });
  return Array.isArray(res.data) ? res.data : [];
}

// Impediments
export async function recordImpediment(machineId: number, data: {
  reason: string;
  custom_reason?: string;
  notes?: string;
  tech_lat?: number;
  tech_lng?: number;
}): Promise<{ id: number; recorded_at: string }> {
  const res = await api.post<{ id: number; recorded_at: string }>(`/machines/${machineId}/impediment`, data);
  return res.data;
}

// Push notifications
export async function sendPushToken(push_token: string): Promise<void> {
  await api.post('/technicians/push-token', { push_token });
}

export default api;
