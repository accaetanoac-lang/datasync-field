import axios, { AxiosInstance, AxiosError } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Organization, Machine, Activity, Technician } from '../types';

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

export async function finishActivity(id: number, notes?: string): Promise<Activity> {
  const res = await api.put<Activity>(`/activities/${id}/finish`, { notes });
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

// Geofence
export async function sendGeofence(tech_lat: number, tech_lng: number): Promise<void> {
  await api.post('/visits/geofence', { tech_lat, tech_lng });
}

export default api;
