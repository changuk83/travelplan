PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  auth_provider TEXT,
  auth_subject TEXT,
  email TEXT,
  display_name TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_provider_subject
ON users(auth_provider, auth_subject)
WHERE auth_provider IS NOT NULL AND auth_subject IS NOT NULL;

CREATE TABLE IF NOT EXISTS user_devices (
  device_id TEXT PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  linked_at INTEGER NOT NULL
);

ALTER TABLE trips ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE saved_places ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE;

INSERT OR IGNORE INTO users(id, created_at, updated_at)
SELECT 'user_' || id, created_at, updated_at FROM devices;

INSERT OR IGNORE INTO user_devices(device_id, user_id, linked_at)
SELECT id, 'user_' || id, created_at FROM devices;

UPDATE trips SET user_id = 'user_' || device_id WHERE user_id IS NULL;
UPDATE saved_places SET user_id = 'user_' || device_id WHERE user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_trips_user_position ON trips(user_id, position);
CREATE INDEX IF NOT EXISTS idx_saved_user_position ON saved_places(user_id, position);
CREATE INDEX IF NOT EXISTS idx_user_devices_user ON user_devices(user_id);
PRAGMA optimize;
