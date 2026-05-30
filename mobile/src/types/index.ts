export interface Organization {
  id: number;
  org_id_jd: string;
  name: string;
  engagement_level?: string;
  offline_machine_count?: number;
}

export interface Machine {
  id: number;
  pin?: string;
  org_id: number;
  is_john_deere: boolean;
  custom_name?: string;
  custom_description?: string;
  last_call_date?: string;
  machine_hours?: number;
  last_known_lat?: number;
  last_known_lng?: number;
  days_offline?: number;
  offline_range?: string;
}

export interface Technician {
  id: number;
  employee_id: string;
  name: string;
  role: 'admin' | 'technician';
}

export interface Activity {
  id: number;
  technician_id: number;
  machine_id?: number;
  org_id?: number;
  method: 'starlink_data_sync' | 'pen_drive';
  status: 'in_progress' | 'completed' | 'no_use';
  current_hours?: number;
  hours_diff?: number;
  tech_lat?: number;
  tech_lng?: number;
  started_at?: string;
  finished_at?: string;
  duration_minutes?: number;
  notes?: string;
  synced_offline: boolean;
}

export interface PendingActivity {
  tempId: string;
  org_id?: number;
  machine_id?: number;
  method: 'starlink_data_sync' | 'pen_drive';
  current_hours?: number;
  tech_lat?: number;
  tech_lng?: number;
  notes?: string;
  status: 'in_progress' | 'completed' | 'no_use';
  started_at: string;
  finished_at?: string;
  duration_minutes?: number;
  synced_offline: true;
}

export interface PendingVisit {
  tempId: string;
  tech_lat: number;
  tech_lng: number;
  recorded_at: string;
}

export interface NearbyPendingMachine {
  pin?: string;
  days_offline?: number;
  machine_hours?: number;
}

export interface NearbyOrg {
  org_id: number;
  org_name: string;
  distance_km: number;
  pending_machines: NearbyPendingMachine[];
}

export interface OrgCache {
  data: Organization[];
  timestamp: number;
}

export interface MachinesCache {
  [orgId: number]: {
    data: Machine[];
    timestamp: number;
  };
}

export type OfflineRangeBadge = 'yellow' | 'red' | 'black';

export function getOfflineBadge(daysOffline?: number): OfflineRangeBadge {
  if (!daysOffline || daysOffline > 365) return 'black';
  if (daysOffline > 60) return 'red';
  return 'yellow';
}

export function formatDaysOffline(days?: number): string {
  if (!days) return 'Sem data';
  if (days === 1) return '1 dia offline';
  return `${days} dias offline`;
}
