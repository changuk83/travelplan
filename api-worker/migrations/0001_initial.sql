PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS trips (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  position INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS trip_days (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  date_label TEXT NOT NULL,
  position INTEGER NOT NULL,
  start_name TEXT NOT NULL,
  start_longitude REAL NOT NULL,
  start_latitude REAL NOT NULL,
  goal_name TEXT NOT NULL,
  goal_longitude REAL NOT NULL,
  goal_latitude REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS stops (
  id TEXT PRIMARY KEY,
  day_id TEXT NOT NULL REFERENCES trip_days(id) ON DELETE CASCADE,
  place_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  address TEXT NOT NULL,
  longitude REAL NOT NULL,
  latitude REAL NOT NULL,
  link TEXT
);

CREATE TABLE IF NOT EXISTS stop_candidates (
  id TEXT PRIMARY KEY,
  stop_id TEXT NOT NULL REFERENCES stops(id) ON DELETE CASCADE,
  place_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  address TEXT NOT NULL,
  longitude REAL NOT NULL,
  latitude REAL NOT NULL,
  link TEXT
);

CREATE TABLE IF NOT EXISTS saved_places (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  place_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  address TEXT NOT NULL,
  longitude REAL NOT NULL,
  latitude REAL NOT NULL,
  link TEXT
);

CREATE INDEX IF NOT EXISTS idx_trips_device_position ON trips(device_id, position);
CREATE INDEX IF NOT EXISTS idx_days_trip_position ON trip_days(trip_id, position);
CREATE INDEX IF NOT EXISTS idx_stops_day_position ON stops(day_id, position);
CREATE INDEX IF NOT EXISTS idx_candidates_stop_position ON stop_candidates(stop_id, position);
CREATE INDEX IF NOT EXISTS idx_saved_device_position ON saved_places(device_id, position);
PRAGMA optimize;
