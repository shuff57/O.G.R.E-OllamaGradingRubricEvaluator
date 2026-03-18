import { app, ipcMain } from 'electron'
import Database from 'better-sqlite3'
import path from 'node:path'

let db: Database.Database | null = null

const MIGRATIONS: Array<{ version: number; sql: string }> = [
  {
    version: 1,
    sql: `PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS provider_configs (
    id TEXT PRIMARY KEY NOT NULL,
    api_url TEXT,
    api_key TEXT,
    model TEXT,
    is_active INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);`,
  },
  {
    version: 2,
    sql: `CREATE TABLE IF NOT EXISTS grading_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider_id TEXT,
    model TEXT,
    student_count INTEGER,
    mean_score REAL,
    min_score REAL,
    max_score REAL,
    median_score REAL,
    max_possible_score REAL,
    page_url TEXT,
    question_id TEXT,
    custom_instructions TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);`,
  },
  {
    version: 3,
    sql: `CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT
);
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('setup_complete', 'false');
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('history_visible_columns', '["timestamp","provider","model","studentCount","meanScore","pageUrl"]');`,
  },
  {
    version: 4,
    sql: `CREATE TABLE IF NOT EXISTS oauth_tokens (
    provider TEXT PRIMARY KEY NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    token_type TEXT,
    expires_at INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);`,
  },
  {
    version: 5,
    sql: `CREATE TABLE IF NOT EXISTS site_credentials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    site_name TEXT NOT NULL,
    url_pattern TEXT NOT NULL,
    username TEXT NOT NULL,
    password TEXT NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);`,
  },
  {
    version: 6,
    sql: `CREATE TABLE IF NOT EXISTS site_profiles (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    url_patterns TEXT NOT NULL,
    selectors TEXT NOT NULL,
    feedback TEXT NOT NULL,
    save TEXT NOT NULL,
    navigation TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);`,
  },
  {
    version: 7,
    sql: `CREATE TABLE IF NOT EXISTS batch_session (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    last_student_name TEXT NOT NULL,
    timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_batch_session_url ON batch_session(url);`,
  },
  {
    version: 8,
    sql: `CREATE TABLE IF NOT EXISTS skills (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    source TEXT,
    source_id TEXT,
    is_active INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_skills_source ON skills(source, source_id) WHERE source IS NOT NULL;`,
  },
  {
    version: 9,
    sql: `ALTER TABLE skills ADD COLUMN url_pattern TEXT;`,
  },
  {
    version: 10,
    sql: `CREATE TABLE IF NOT EXISTS response_embeddings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER REFERENCES grading_sessions(id),
    rubric_hash TEXT NOT NULL,
    student_response TEXT,
    score REAL NOT NULL,
    feedback TEXT,
    embedding BLOB NOT NULL,
    embedding_model TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_embeddings_rubric_hash ON response_embeddings(rubric_hash);
CREATE INDEX IF NOT EXISTS idx_embeddings_model ON response_embeddings(embedding_model);`,
  },
  {
    version: 11,
    sql: `ALTER TABLE site_profiles ADD COLUMN extraction TEXT DEFAULT NULL;`,
  },
  {
    version: 12,
    sql: `ALTER TABLE skills ADD COLUMN learned_corrections TEXT DEFAULT NULL;`,
  },
]

function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized — call initDatabase() first')
  return db
}

export function initDatabase(): void {
  const userDataPath = app.getPath('userData')
  const dbPath = path.join(userDataPath, 'ogre.db')

  db = new Database(dbPath)

  db.exec('CREATE TABLE IF NOT EXISTS _migrations (version INTEGER PRIMARY KEY)')

  const applied = new Set<number>(
    (db.prepare('SELECT version FROM _migrations').all() as Array<{ version: number }>).map(
      (r) => r.version,
    ),
  )

  for (const migration of MIGRATIONS) {
    if (!applied.has(migration.version)) {
      db.exec(migration.sql)
      db.prepare('INSERT INTO _migrations (version) VALUES (?)').run(migration.version)
    }
  }
}

function normalizeSql(sql: string): string {
  return sql.replace(/\$(\d+)/g, '?')
}

export function registerDatabaseHandlers(): void {
  ipcMain.handle(
    'db_query',
    async (_event, { sql, params }: { sql: string; params?: unknown[] }) => {
      return getDb()
        .prepare(normalizeSql(sql))
        .all(...(params ?? []))
    },
  )

  ipcMain.handle(
    'db_execute',
    async (_event, { sql, params }: { sql: string; params?: unknown[] }) => {
      const result = getDb()
        .prepare(normalizeSql(sql))
        .run(...(params ?? []))
      return { rowsAffected: result.changes, lastInsertId: result.lastInsertRowid }
    },
  )
}
