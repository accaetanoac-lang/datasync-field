export interface Organization {
  id: number;
  org_id_jd: string;
  name: string;
  engagement_level?: string;
  offline_machines?: number;
  last_visit?: string;
  last_technician?: string;
  machines_collected?: number;
  pending?: number;
}

export interface Machine {
  id: number;
  pin?: string;
  org_id: number;
  org_name?: string;
  is_john_deere: boolean;
  custom_name?: string;
  days_offline?: number;
  machine_hours?: number;
  last_call_date?: string;
  last_known_lat?: number;
  last_known_lng?: number;
  offline_range?: string;
}

export interface Technician {
  id: number;
  employee_id: string;
  name: string;
  email?: string;
  role: 'admin' | 'technician';
  active: boolean;
  created_at: string;
  total_activities?: number;
  last_activity?: string;
}

export interface Activity {
  id: number;
  created_at: string;
  technician_name?: string;
  employee_id?: string;
  org_name?: string;
  machine_pin?: string;
  machine_custom_name?: string;
  method: string;
  current_hours?: number;
  hours_diff?: number;
  duration_minutes?: number;
  status: string;
  notes?: string;
}

export interface BiRow {
  org_id: number;
  org_id_jd: string;
  org_name: string;
  engagement_level?: string;
  all_modems?: number;
  non_active_modems?: number;
  lg_ag_modems?: number;
  lg_ag_not_submitting?: number;
  lg_ag_connected_gen45?: number;
  risk_acres?: number;
  highly_engaged_acres?: number;
  prepare_acres?: number;
  plant_acres?: number;
  apply_acres?: number;
  harvest_acres?: number;
  vca_setup_file?: boolean;
  vca_work_plan?: boolean;
  vca_field_boundary?: boolean;
  vca_equipment_monitoring?: boolean;
  vca_work_details?: boolean;
  vca_agronomic_reports?: boolean;
  r12_vca_avg?: number;
  work_plans_created?: number;
  work_plans_completed?: number;
  fields_without_boundaries?: number;
  last_login_web?: string;
  last_login_mobile?: string;
  max_eh?: number;
  ytd_he?: number;
  gap_eh?: number;
  max_heh?: number;
  ytd_heh?: number;
  gap_heh?: number;
  max_prepare?: number;
  ytd_prepare?: number;
  gap_prepare?: number;
  max_plant?: number;
  ytd_plant?: number;
  gap_plant?: number;
  max_apply?: number;
  ytd_apply?: number;
  gap_apply?: number;
  max_harvest?: number;
  ytd_harvest?: number;
  gap_harvest?: number;
  offline_machines_count?: number;
}

export interface SummaryStats {
  machines: {
    total: number;
    range_30_60: number;
    range_61_365: number;
    range_365plus: number;
    no_connection_date: number;
  };
  hectares: {
    risk_acres: number;
    highly_engaged_acres: number;
  };
  organizations_total: number;
}

export interface TechnicianActivity {
  id: number;
  started_at: string;
  finished_at?: string;
  status: string;
  method: string;
  duration_minutes?: number;
  current_hours?: number;
  notes?: string;
  org_name?: string;
  machine_pin?: string;
  machine_custom_name?: string;
}

export interface TechnicianDetail {
  id: number;
  employee_id: string;
  name: string;
  total_visits: number;
  machines_collected: number;
  machines_no_use: number;
  starlink_minutes: number;
  pen_drive_minutes: number;
  total_minutes: number;
  activities: TechnicianActivity[];
}

export interface TechnicianReport {
  id: number;
  employee_id: string;
  name: string;
  visits: number;
  machines_collected: number;
  total_minutes: number;
  starlink_count: number;
  pen_drive_count: number;
  starlink_minutes: number;
  pen_drive_minutes: number;
  last_activity?: string;
}

export interface FieldVisitNoCollection {
  id: number;
  created_at: string;
  technician_name?: string;
  employee_id?: string;
  org_name?: string;
  visit_lat?: number;
  visit_lng?: number;
  machines_pending?: number;
}

export interface VisitManagement {
  id: number;
  detected_at: string;
  visit_lat?: number;
  visit_lng?: number;
  machines_pending: number;
  machines_collected: number;
  machines_not_collected: number;
  machine_pins_pending?: string[];
  machine_pins_collected?: string[];
  machine_pins_missed?: string[];
  visit_status: 'full_collection' | 'partial_collection' | 'no_collection' | 'pending';
  technician_name?: string;
  employee_id?: string;
  technician_id?: number;
  org_name?: string;
  org_id?: number;
}

export interface UploadHistory {
  id: number;
  processed_at: string;
  reference_month: string;
  uploaded_by_name?: string;
  machines_processed?: number;
  orgs_processed?: number;
  status: 'processing' | 'done' | 'error';
}
