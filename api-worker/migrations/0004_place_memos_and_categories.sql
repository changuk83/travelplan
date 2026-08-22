ALTER TABLE stops ADD COLUMN memo TEXT;
ALTER TABLE stop_candidates ADD COLUMN memo TEXT;
ALTER TABLE saved_places ADD COLUMN memo TEXT;
ALTER TABLE saved_places ADD COLUMN saved_category TEXT;

CREATE TABLE IF NOT EXISTS saved_categories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INTEGER NOT NULL,
  UNIQUE(user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_saved_categories_user_position
  ON saved_categories(user_id, position);

PRAGMA optimize;
