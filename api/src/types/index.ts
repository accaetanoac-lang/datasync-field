export interface Organization {
  id: number;
  org_id_jd: string;
  name: string;
  zip_code?: string;
  org_type?: string;
  org_sub_type?: string;
  engagement_level?: string;
  created_at: Date;
  updated_at: Date;
}

export interface Machine {
  id: number;
  pin?: string;
  org_id: number;
  is_john_deere: boolean;
  custom_name?: string;
  custom_description?: string;
  last_call_date?: Date;
  machine_hours?: number;
  last_known_lat?: number;
  last_known_lng?: number;
  days_offline?: number;
  offline_range?: string;
  created_at: Date;
  updated_at: Date;
}

export interface Technician {
  id: number;
  employee_id: string;
  name: string;
  email?: string;
  role: 'admin' | 'technician';
  active: boolean;
  created_at: Date;
}

export interface Activity {
  id: number;
  technician_id: number;
  machine_id: number;
  org_id: number;
  method: 'starlink_data_sync' | 'pen_drive';
  status: 'in_progress' | 'completed' | 'no_use';
  current_hours?: number;
  hours_diff?: number;
  tech_lat?: number;
  tech_lng?: number;
  started_at?: Date;
  finished_at?: Date;
  duration_minutes?: number;
  notes?: string;
  synced_offline: boolean;
  created_at: Date;
}

export interface CustomerHealth {
  id: number;
  org_id: number;
  upload_month: Date;
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
  created_at: Date;
}

export interface HectaresGap {
  id: number;
  org_id: number;
  upload_month: Date;
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
  created_at: Date;
}

export interface ExcelUpload {
  id: number;
  uploaded_by: number;
  reference_month: Date;
  file_mlc_path?: string;
  file_cde_path?: string;
  file_gap_path?: string;
  machines_processed?: number;
  orgs_processed?: number;
  processed_at: Date;
  status: 'processing' | 'done' | 'error';
}

export interface FieldVisitNoCollection {
  id: number;
  technician_id: number;
  org_id: number;
  visit_lat?: number;
  visit_lng?: number;
  detected_at?: Date;
  machines_pending?: number;
  created_at: Date;
}

export interface JwtPayload {
  id: number;
  employee_id: string;
  role: 'admin' | 'technician';
  iat?: number;
  exp?: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}
