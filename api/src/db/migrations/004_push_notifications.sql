ALTER TABLE technicians ADD COLUMN IF NOT EXISTS push_token VARCHAR(200);
ALTER TABLE technicians ADD COLUMN IF NOT EXISTS last_known_lat DECIMAL(10,6);
ALTER TABLE technicians ADD COLUMN IF NOT EXISTS last_known_lng DECIMAL(10,6);
ALTER TABLE technicians ADD COLUMN IF NOT EXISTS last_location_at TIMESTAMP;

CREATE TABLE IF NOT EXISTS notification_log (
  id SERIAL PRIMARY KEY,
  technician_id INTEGER REFERENCES technicians(id),
  org_id INTEGER REFERENCES organizations(id),
  sent_at TIMESTAMP DEFAULT NOW(),
  push_token VARCHAR(200)
);

CREATE INDEX IF NOT EXISTS idx_notification_log_dedup
  ON notification_log (technician_id, org_id, sent_at);
