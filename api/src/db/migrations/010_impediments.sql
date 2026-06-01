CREATE TABLE IF NOT EXISTS machine_impediments (
  id SERIAL PRIMARY KEY,
  machine_id INTEGER REFERENCES machines(id),
  technician_id INTEGER REFERENCES technicians(id),
  org_id INTEGER REFERENCES organizations(id),
  reason VARCHAR(100) NOT NULL,
  custom_reason TEXT,
  notes TEXT,
  tech_lat DECIMAL(10,6),
  tech_lng DECIMAL(10,6),
  recorded_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_machine_impediments_machine_id    ON machine_impediments(machine_id);
CREATE INDEX IF NOT EXISTS idx_machine_impediments_technician_id ON machine_impediments(technician_id);
CREATE INDEX IF NOT EXISTS idx_machine_impediments_recorded_at   ON machine_impediments(recorded_at DESC);
