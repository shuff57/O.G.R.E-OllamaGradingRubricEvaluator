import { app, ipcMain } from 'electron'
import path from 'node:path'
// @ts-expect-error better-sqlite3 is bundled as a Node dependency in Electron main process
import BetterSqlite3 from 'better-sqlite3'

interface BetterSqlite3RunResult {
  changes: number
  lastInsertRowid: number | bigint
}

interface BetterSqlite3Statement {
  all(...params: unknown[]): unknown[]
  run(...params: unknown[]): BetterSqlite3RunResult
}

interface BetterSqlite3Database {
  exec(sql: string): void
  prepare(sql: string): BetterSqlite3Statement
  close(): void
}

type BetterSqlite3Constructor = new (filename: string) => BetterSqlite3Database
const BetterSqlite3Ctor = BetterSqlite3 as BetterSqlite3Constructor

interface Migration {
  version: number
  description: string
  sql: string
}

interface QueryPayload {
  sql: string
  params?: unknown[]
}

const migrations: Migration[] = [
  {
    version: 1,
    description: 'create_provider_configs_and_enable_wal',
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
    description: 'create_grading_sessions',
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
    description: 'create_app_settings_with_defaults',
    sql: `CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT
);
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('setup_complete', 'false');
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('history_visible_columns', '["timestamp","provider","model","studentCount","meanScore","pageUrl"]');`,
  },
  {
    version: 4,
    description: 'create_oauth_tokens',
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
    description: 'create_site_credentials',
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
    description: 'create_site_profiles',
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
    description: 'create_batch_session',
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
    description: 'create_skills',
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
    description: 'add_url_pattern_to_skills',
    sql: 'ALTER TABLE skills ADD COLUMN url_pattern TEXT;',
  },
  {
    version: 10,
    description: 'create_response_embeddings_table',
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
    description: 'add_extraction_column_to_site_profiles',
    sql: 'ALTER TABLE site_profiles ADD COLUMN extraction TEXT DEFAULT NULL;',
  },
  {
    version: 12,
    description: 'add_learned_corrections_to_skills',
    sql: 'ALTER TABLE skills ADD COLUMN learned_corrections TEXT DEFAULT NULL;',
  },
]

let database: BetterSqlite3Database | null = null

// DDL and dangerous SQL patterns that the renderer is not permitted to issue.
// The renderer can only run SELECT, INSERT, UPDATE, DELETE on known app tables.
const BLOCKED_SQL_PATTERNS = [
  /\bDROP\b/i,
  /\bCREATE\b/i,
  /\bALTER\b/i,
  /\bATTACH\b/i,
  /\bDETACH\b/i,
  /\bPRAGMA\b/i,
  /\bVACUUM\b/i,
  /\bREINDEX\b/i,
  /\bANALYZE\b/i,
  /--/, // inline comment (SQL injection marker)
  /\/\*/, // block comment
]

function validateSql(sql: string): void {
  for (const pattern of BLOCKED_SQL_PATTERNS) {
    if (pattern.test(sql)) {
      throw new Error(`Blocked SQL pattern: ${pattern}`)
    }
  }
}

function normalizeSql(sql: string): string {
  return sql.replace(/\$(\d+)/g, '?$1')
}

function normalizeParam(param: unknown): unknown {
  if (param instanceof Uint8Array) {
    return Buffer.from(param.buffer, param.byteOffset, param.byteLength)
  }

  return param
}

function serializeValue(value: unknown): unknown {
  if (Buffer.isBuffer(value)) {
    return Array.from(value)
  }

  if (Array.isArray(value)) {
    return value.map(serializeValue)
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
        key,
        serializeValue(nestedValue),
      ]),
    )
  }

  return value
}

function shouldIgnoreMigrationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
  return message.includes('duplicate column name')
}

function getDatabasePath(): string {
  return path.join(app.getPath('userData'), 'ogre.db')
}

function applyMigrations(db: BetterSqlite3Database): void {
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    version INTEGER PRIMARY KEY,
    description TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`)

  const applied = new Set(
    (db.prepare('SELECT version FROM _migrations ORDER BY version').all() as Array<{ version: number }>).map(
      (row) => row.version,
    ),
  )
  const recordMigration = db.prepare(
    'INSERT OR IGNORE INTO _migrations (version, description) VALUES (?1, ?2)',
  )

  for (const migration of migrations) {
    if (applied.has(migration.version)) {
      continue
    }

    try {
      db.exec(migration.sql)
    } catch (error) {
      if (!shouldIgnoreMigrationError(error)) {
        throw error
      }
    }

    recordMigration.run(migration.version, migration.description)
  }
}

export function initDatabase(): BetterSqlite3Database {
  if (!database) {
    database = new BetterSqlite3Ctor(getDatabasePath())
    applyMigrations(database)
  }

  return database
}

export function registerDatabaseHandlers(): void {
  ipcMain.removeHandler('db_query')
  ipcMain.removeHandler('db_execute')

  ipcMain.handle('db_query', (_event, payload: QueryPayload) => {
    validateSql(payload.sql)
    const db = initDatabase()
    const params = (payload.params ?? []).map(normalizeParam)
    const statement = db.prepare(normalizeSql(payload.sql))
    const rows = statement.all(...params)
    return serializeValue(rows)
  })

  ipcMain.handle('db_execute', (_event, payload: QueryPayload) => {
    validateSql(payload.sql)
    const db = initDatabase()
    const params = (payload.params ?? []).map(normalizeParam)
    const statement = db.prepare(normalizeSql(payload.sql))
    const result = statement.run(...params)

    return {
      rowsAffected: result.changes,
      lastInsertId: Number(result.lastInsertRowid ?? 0),
    }
  })
}
