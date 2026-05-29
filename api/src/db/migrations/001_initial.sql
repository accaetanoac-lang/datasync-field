-- DataSync Field — Initial schema migration

CREATE TABLE IF NOT EXISTS organizations (
  id SERIAL PRIMARY KEY,
  org_id_jd VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(200) NOT NULL,
  zip_code VARCHAR(20),
  org_type VARCHAR(50),
  org_sub_type VARCHAR(50),
  engagement_level VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS machines (
  id SERIAL PRIMARY KEY,
  pin VARCHAR(30) UNIQUE,
  org_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
  is_john_deere BOOLEAN DEFAULT TRUE,
  custom_name VARCHAR(100),
  custom_description VARCHAR(200),
  last_call_date DATE,
  machine_hours DECIMAL(10,2),
  last_known_lat DECIMAL(10,6),
  last_known_lng DECIMAL(10,6),
  days_offline INTEGER,
  offline_range VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customer_health (
  id SERIAL PRIMARY KEY,
  org_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
  upload_month DATE NOT NULL,
  all_modems INTEGER,
  non_active_modems INTEGER,
  lg_ag_modems INTEGER,
  lg_ag_not_submitting INTEGER,
  lg_ag_connected_gen45 INTEGER,
  risk_acres DECIMAL(12,2),
  highly_engaged_acres DECIMAL(12,2),
  prepare_acres DECIMAL(12,2),
  plant_acres DECIMAL(12,2),
  apply_acres DECIMAL(12,2),
  harvest_acres DECIMAL(12,2),
  vca_setup_file BOOLEAN,
  vca_work_plan BOOLEAN,
  vca_field_boundary BOOLEAN,
  vca_equipment_monitoring BOOLEAN,
  vca_work_details BOOLEAN,
  vca_agronomic_reports BOOLEAN,
  r12_vca_avg DECIMAL(5,2),
  work_plans_created INTEGER,
  work_plans_completed INTEGER,
  fields_without_boundaries INTEGER,
  last_login_web VARCHAR(20),
  last_login_mobile VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(org_id, upload_month)
);

CREATE TABLE IF NOT EXISTS hectares_gap (
  id SERIAL PRIMARY KEY,
  org_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
  upload_month DATE NOT NULL,
  max_eh DECIMAL(12,2),
  ytd_he DECIMAL(12,2),
  gap_eh DECIMAL(12,2),
  max_heh DECIMAL(12,2),
  ytd_heh DECIMAL(12,2),
  gap_heh DECIMAL(12,2),
  max_prepare DECIMAL(12,2),
  ytd_prepare DECIMAL(12,2),
  gap_prepare DECIMAL(12,2),
  max_plant DECIMAL(12,2),
  ytd_plant DECIMAL(12,2),
  gap_plant DECIMAL(12,2),
  max_apply DECIMAL(12,2),
  ytd_apply DECIMAL(12,2),
  gap_apply DECIMAL(12,2),
  max_harvest DECIMAL(12,2),
  ytd_harvest DECIMAL(12,2),
  gap_harvest DECIMAL(12,2),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(org_id, upload_month)
);

CREATE TABLE IF NOT EXISTS technicians (
  id SERIAL PRIMARY KEY,
  employee_id VARCHAR(7) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100),
  role VARCHAR(20) NOT NULL DEFAULT 'technician',
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activities (
  id SERIAL PRIMARY KEY,
  technician_id INTEGER REFERENCES technicians(id) ON DELETE SET NULL,
  machine_id INTEGER REFERENCES machines(id) ON DELETE SET NULL,
  org_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
  method VARCHAR(20) NOT NULL,
  status VARCHAR(20) DEFAULT 'in_progress',
  current_hours DECIMAL(10,2),
  hours_diff DECIMAL(10,2),
  tech_lat DECIMAL(10,6),
  tech_lng DECIMAL(10,6),
  started_at TIMESTAMP,
  finished_at TIMESTAMP,
  duration_minutes INTEGER,
  notes TEXT,
  synced_offline BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS excel_uploads (
  id SERIAL PRIMARY KEY,
  uploaded_by INTEGER REFERENCES technicians(id) ON DELETE SET NULL,
  reference_month DATE NOT NULL,
  file_mlc_path VARCHAR(300),
  file_cde_path VARCHAR(300),
  file_gap_path VARCHAR(300),
  machines_processed INTEGER,
  orgs_processed INTEGER,
  processed_at TIMESTAMP DEFAULT NOW(),
  status VARCHAR(20) DEFAULT 'processing'
);

CREATE TABLE IF NOT EXISTS field_visits_no_collection (
  id SERIAL PRIMARY KEY,
  technician_id INTEGER REFERENCES technicians(id) ON DELETE SET NULL,
  org_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
  visit_lat DECIMAL(10,6),
  visit_lng DECIMAL(10,6),
  detected_at TIMESTAMP,
  machines_pending INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_machines_org_id ON machines(org_id);
CREATE INDEX IF NOT EXISTS idx_machines_days_offline ON machines(days_offline);
CREATE INDEX IF NOT EXISTS idx_machines_pin ON machines(pin);
CREATE INDEX IF NOT EXISTS idx_activities_technician_id ON activities(technician_id);
CREATE INDEX IF NOT EXISTS idx_activities_org_id ON activities(org_id);
CREATE INDEX IF NOT EXISTS idx_activities_created_at ON activities(created_at);
CREATE INDEX IF NOT EXISTS idx_customer_health_org_month ON customer_health(org_id, upload_month);
CREATE INDEX IF NOT EXISTS idx_hectares_gap_org_month ON hectares_gap(org_id, upload_month);
CREATE INDEX IF NOT EXISTS idx_field_visits_tech ON field_visits_no_collection(technician_id);
CREATE INDEX IF NOT EXISTS idx_organizations_name ON organizations(name);
