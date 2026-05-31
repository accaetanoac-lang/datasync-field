-- Add machine model column and activity photo evidence columns

ALTER TABLE machines ADD COLUMN IF NOT EXISTS modelo VARCHAR(100);

ALTER TABLE activities ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS photo_taken_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_activities_status ON activities(status);
