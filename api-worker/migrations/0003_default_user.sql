PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO users (
  id,
  auth_provider,
  auth_subject,
  email,
  display_name,
  created_at,
  updated_at
)
VALUES (
  '1',
  NULL,
  NULL,
  NULL,
  '기본 사용자',
  unixepoch('now') * 1000,
  unixepoch('now') * 1000
);

UPDATE user_devices SET user_id = '1';
UPDATE trips SET user_id = '1';
UPDATE saved_places SET user_id = '1';

PRAGMA optimize;
