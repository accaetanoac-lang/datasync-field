-- Add password_hash for admin web login; make employee_id optional for admin-only accounts

ALTER TABLE technicians ALTER COLUMN employee_id DROP NOT NULL;

ALTER TABLE technicians ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);

ALTER TABLE technicians ADD CONSTRAINT technicians_email_unique UNIQUE (email);
