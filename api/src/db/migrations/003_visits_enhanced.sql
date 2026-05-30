-- Enhance field_visits_no_collection with collection-tracking columns
ALTER TABLE field_visits_no_collection
  ADD COLUMN IF NOT EXISTS machines_collected     INTEGER   DEFAULT 0,
  ADD COLUMN IF NOT EXISTS machines_not_collected INTEGER   DEFAULT 0,
  ADD COLUMN IF NOT EXISTS machine_pins_pending   TEXT[],
  ADD COLUMN IF NOT EXISTS machine_pins_collected TEXT[],
  ADD COLUMN IF NOT EXISTS machine_pins_missed    TEXT[],
  ADD COLUMN IF NOT EXISTS visit_status           VARCHAR(20) DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS updated_at             TIMESTAMP;

-- Prevent duplicate visit records for the same technician + org + calendar day
CREATE UNIQUE INDEX IF NOT EXISTS idx_visits_tech_org_date
  ON field_visits_no_collection (technician_id, org_id, (DATE(detected_at)))
  WHERE detected_at IS NOT NULL;

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_visits_detected_at ON field_visits_no_collection (detected_at);
CREATE INDEX IF NOT EXISTS idx_visits_status      ON field_visits_no_collection (visit_status);

-- ──────────────────────────────────────────────────────────────────────────
-- Trigger function: recalculate visit metrics whenever an activity is
-- completed, keeping the visit row in sync without a separate cron job.
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_visit_on_collection()
RETURNS TRIGGER AS $$
DECLARE
  v_collected      INTEGER;
  v_collected_pins TEXT[];
BEGIN
  IF NEW.org_id IS NULL OR NEW.technician_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Count distinct machines collected by this tech for this org today
  SELECT
    COUNT(DISTINCT a.machine_id),
    ARRAY_REMOVE(ARRAY_AGG(DISTINCT COALESCE(m.pin, m.custom_name)), NULL)
  INTO v_collected, v_collected_pins
  FROM activities a
  LEFT JOIN machines m ON m.id = a.machine_id
  WHERE a.technician_id  = NEW.technician_id
    AND a.org_id          = NEW.org_id
    AND DATE(a.created_at) = DATE(NEW.created_at)
    AND a.status          = 'completed'
    AND a.machine_id      IS NOT NULL;

  UPDATE field_visits_no_collection fv
  SET
    machines_collected     = COALESCE(v_collected, 0),
    machines_not_collected = GREATEST(0, COALESCE(fv.machines_pending, 0) - COALESCE(v_collected, 0)),
    machine_pins_collected = v_collected_pins,
    machine_pins_missed    = (
      SELECT ARRAY_AGG(p)
      FROM UNNEST(COALESCE(fv.machine_pins_pending, ARRAY[]::TEXT[])) AS p
      WHERE p != ALL(COALESCE(v_collected_pins, ARRAY[]::TEXT[]))
    ),
    visit_status = CASE
      WHEN COALESCE(v_collected, 0) = 0                                     THEN 'no_collection'
      WHEN COALESCE(v_collected, 0) >= COALESCE(fv.machines_pending, 0)     THEN 'full_collection'
      ELSE                                                                        'partial_collection'
    END,
    updated_at = NOW()
  WHERE fv.technician_id    = NEW.technician_id
    AND fv.org_id            = NEW.org_id
    AND DATE(fv.detected_at) = DATE(NEW.created_at);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_visit_on_collection ON activities;

CREATE TRIGGER trg_update_visit_on_collection
  AFTER UPDATE OF status ON activities
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed'))
  EXECUTE FUNCTION update_visit_on_collection();
