-- OGRE Cloud — minimal accounts + usage. No student data, no teacher content.

CREATE TABLE IF NOT EXISTS accounts (
  id         TEXT PRIMARY KEY,          -- uuid
  google_sub TEXT UNIQUE,               -- Google subject id (null until linked)
  email      TEXT NOT NULL,
  plan       TEXT NOT NULL DEFAULT 'free',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS usage (
  account_id TEXT NOT NULL,
  period     TEXT NOT NULL,             -- 'YYYY-MM'
  count      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, period)
);
