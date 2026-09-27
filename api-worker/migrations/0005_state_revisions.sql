CREATE TABLE state_revisions (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0)
);

CREATE TABLE state_write_requests (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(user_id, request_id)
);

-- A failed compare-and-swap must abort the complete D1 batch, including
-- subsequent deletes/inserts. Rows exist only inside the writing transaction.
CREATE TABLE state_write_guards (
  id TEXT PRIMARY KEY,
  matched INTEGER NOT NULL CHECK(matched = 1)
);
