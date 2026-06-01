CREATE TABLE IF NOT EXISTS non_jd_machines (
  id SERIAL PRIMARY KEY,
  serial_number VARCHAR(100) UNIQUE,
  custom_name VARCHAR(100) NOT NULL,
  brand VARCHAR(100),
  model VARCHAR(100),
  description TEXT,
  org_id INTEGER REFERENCES organizations(id),
  registered_by INTEGER REFERENCES technicians(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS non_jd_machine_orgs (
  id SERIAL PRIMARY KEY,
  non_jd_machine_id INTEGER REFERENCES non_jd_machines(id),
  org_id INTEGER REFERENCES organizations(id),
  first_seen_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(non_jd_machine_id, org_id)
);

ALTER TABLE activities ADD COLUMN IF NOT EXISTS non_jd_machine_id INTEGER REFERENCES non_jd_machines(id);

CREATE INDEX IF NOT EXISTS idx_non_jd_machines_serial ON non_jd_machines(serial_number);
CREATE INDEX IF NOT EXISTS idx_non_jd_machine_orgs_org ON non_jd_machine_orgs(org_id);
CREATE INDEX IF NOT EXISTS idx_activities_non_jd_machine ON activities(non_jd_machine_id);
