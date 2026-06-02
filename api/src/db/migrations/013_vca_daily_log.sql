-- Highly Engaged Organizations — VCA daily log (JD official definition)
-- One row per org × vca_number × action_date (unique — regardless of repetitions in a day)
-- is_approximated = TRUE for records backfilled from monthly customer_health booleans

CREATE TABLE IF NOT EXISTS vca_daily_log (
  id            SERIAL PRIMARY KEY,
  org_id        INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  vca_number    INTEGER NOT NULL CHECK (vca_number BETWEEN 1 AND 6),
  action_date   DATE NOT NULL,
  upload_month  DATE NOT NULL,
  is_approximated BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (org_id, vca_number, action_date)
);

CREATE INDEX IF NOT EXISTS idx_vca_daily_log_org_date    ON vca_daily_log(org_id, action_date);
CREATE INDEX IF NOT EXISTS idx_vca_daily_log_upload_month ON vca_daily_log(upload_month);

-- View: qualifying days per org in the R12 window.
-- A day qualifies when >= 4 distinct VCAs were active that day.
-- is_highly_engaged = true when qualifying_days >= 10.
CREATE OR REPLACE VIEW vca_highly_engaged AS
WITH daily_counts AS (
  SELECT
    org_id,
    action_date,
    COUNT(DISTINCT vca_number) AS daily_vca_count
  FROM vca_daily_log
  GROUP BY org_id, action_date
),
r12_qualifying AS (
  SELECT
    org_id,
    COUNT(DISTINCT action_date) AS qualifying_days
  FROM daily_counts
  WHERE action_date >= CURRENT_DATE - INTERVAL '12 months'
    AND daily_vca_count >= 4
  GROUP BY org_id
)
SELECT
  org_id,
  qualifying_days,
  qualifying_days >= 10 AS is_highly_engaged
FROM r12_qualifying;

-- Backfill: approximate historical VCA days from monthly customer_health booleans.
-- action_date is set to the last day of the upload_month as a historical approximation.
-- is_approximated = TRUE distinguishes these from future real-time records.
INSERT INTO vca_daily_log (org_id, vca_number, action_date, upload_month, is_approximated)
SELECT DISTINCT
  src.org_id,
  src.vca_number,
  src.action_date,
  src.upload_month,
  TRUE
FROM (
  SELECT ch.org_id, 1 AS vca_number,
    (DATE_TRUNC('month', ch.upload_month) + INTERVAL '1 month' - INTERVAL '1 day')::DATE AS action_date,
    ch.upload_month
  FROM customer_health ch WHERE ch.vca_setup_file = TRUE
  UNION ALL
  SELECT ch.org_id, 2,
    (DATE_TRUNC('month', ch.upload_month) + INTERVAL '1 month' - INTERVAL '1 day')::DATE,
    ch.upload_month
  FROM customer_health ch WHERE ch.vca_work_plan = TRUE
  UNION ALL
  SELECT ch.org_id, 3,
    (DATE_TRUNC('month', ch.upload_month) + INTERVAL '1 month' - INTERVAL '1 day')::DATE,
    ch.upload_month
  FROM customer_health ch WHERE ch.vca_field_boundary = TRUE
  UNION ALL
  SELECT ch.org_id, 4,
    (DATE_TRUNC('month', ch.upload_month) + INTERVAL '1 month' - INTERVAL '1 day')::DATE,
    ch.upload_month
  FROM customer_health ch WHERE ch.vca_equipment_monitoring = TRUE
  UNION ALL
  SELECT ch.org_id, 5,
    (DATE_TRUNC('month', ch.upload_month) + INTERVAL '1 month' - INTERVAL '1 day')::DATE,
    ch.upload_month
  FROM customer_health ch WHERE ch.vca_work_details = TRUE
  UNION ALL
  SELECT ch.org_id, 6,
    (DATE_TRUNC('month', ch.upload_month) + INTERVAL '1 month' - INTERVAL '1 day')::DATE,
    ch.upload_month
  FROM customer_health ch WHERE ch.vca_agronomic_reports = TRUE
) src
ON CONFLICT (org_id, vca_number, action_date) DO NOTHING;
