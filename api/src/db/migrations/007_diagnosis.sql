-- Add diagnosis / connectivity-issue columns to activities

ALTER TABLE activities ADD COLUMN IF NOT EXISTS is_diagnosis        BOOLEAN   DEFAULT FALSE;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS diagnosis_result    VARCHAR(50);
-- 'resolved' | 'needs_return' | 'unidentified'
ALTER TABLE activities ADD COLUMN IF NOT EXISTS diagnosis_checklist JSONB;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS paused_at           TIMESTAMP;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS total_pause_minutes INTEGER   DEFAULT 0;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS connectivity_issue  BOOLEAN   DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_activities_is_diagnosis ON activities (is_diagnosis) WHERE is_diagnosis = TRUE;
CREATE INDEX IF NOT EXISTS idx_activities_connectivity ON activities (connectivity_issue) WHERE connectivity_issue = TRUE;
