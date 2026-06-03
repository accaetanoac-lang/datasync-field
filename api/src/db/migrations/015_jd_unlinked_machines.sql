CREATE TABLE IF NOT EXISTS jd_unlinked_machines (
  id               SERIAL PRIMARY KEY,
  pin              VARCHAR UNIQUE,
  organization_name VARCHAR,
  brand            VARCHAR DEFAULT 'John Deere',
  model            VARCHAR,
  machine_name     VARCHAR,
  machine_type     VARCHAR,
  year             INTEGER,
  engine_hours     NUMERIC,
  notes            TEXT,
  created_by       VARCHAR,
  created_at       TIMESTAMP DEFAULT NOW(),
  updated_at       TIMESTAMP DEFAULT NOW(),
  machine_id       INTEGER REFERENCES machines(id)
);

CREATE INDEX IF NOT EXISTS idx_jd_unlinked_pin ON jd_unlinked_machines(pin);

ALTER TABLE non_jd_machines ADD COLUMN IF NOT EXISTS created_by VARCHAR;
