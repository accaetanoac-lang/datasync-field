ALTER TABLE activities ADD COLUMN IF NOT EXISTS connectivity_photo_url TEXT;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS connectivity_photo_taken_at TIMESTAMP;
