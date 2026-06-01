CREATE TABLE IF NOT EXISTS app_config (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO app_config (key, value) VALUES
  ('current_version', '2.2.0'),
  ('min_required_version', '2.0.0'),
  ('update_url', 'https://datasync-field-uploads-496795891165.s3.amazonaws.com/app/datasync-field-latest.apk'),
  ('update_message', 'Nova versão disponível com melhorias importantes.'),
  ('force_update', 'false')
ON CONFLICT (key) DO NOTHING;
