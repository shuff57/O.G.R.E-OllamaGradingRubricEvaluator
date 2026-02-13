import Database from "@tauri-apps/plugin-sql";

// ── Types ────────────────────────────────────────────────────────────────

export interface ProviderConfig {
  id: string;
  api_url: string | null;
  api_key: string | null;
  model: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface GradingSession {
  id: number;
  provider_id: string | null;
  model: string | null;
  student_count: number | null;
  mean_score: number | null;
  min_score: number | null;
  max_score: number | null;
  median_score: number | null;
  max_possible_score: number | null;
  page_url: string | null;
  question_id: string | null;
  custom_instructions: string | null;
  created_at: string;
}

export interface AppSetting {
  key: string;
  value: string | null;
}

// ── Database Singleton ───────────────────────────────────────────────────

let db: Database | null = null;

/**
 * Initialize (or return existing) database connection.
 * Migrations run automatically on first load via tauri-plugin-sql.
 */
export async function initDB(): Promise<Database> {
  if (!db) {
    db = await Database.load("sqlite:ogre.db");
  }
  return db;
}

// ── Provider Configs ─────────────────────────────────────────────────────

/**
 * Get all provider configurations, ordered by id.
 */
export async function getProviderConfigs(): Promise<ProviderConfig[]> {
  const database = await initDB();
  return await database.select<ProviderConfig[]>(
    "SELECT * FROM provider_configs ORDER BY id"
  );
}

/**
 * Get a single provider config by id.
 */
export async function getProviderConfig(
  id: string
): Promise<ProviderConfig | null> {
  const database = await initDB();
  const rows = await database.select<ProviderConfig[]>(
    "SELECT * FROM provider_configs WHERE id = $1",
    [id]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Save (upsert) a provider configuration.
 * Uses INSERT OR REPLACE for simplicity.
 */
export async function saveProviderConfig(config: {
  id: string;
  api_url?: string | null;
  api_key?: string | null;
  model?: string | null;
  is_active?: number;
}): Promise<void> {
  const database = await initDB();
  await database.execute(
    `INSERT INTO provider_configs (id, api_url, api_key, model, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, datetime('now'), datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       api_url = $2,
       api_key = $3,
       model = $4,
       is_active = $5,
       updated_at = datetime('now')`,
    [
      config.id,
      config.api_url ?? null,
      config.api_key ?? null,
      config.model ?? null,
      config.is_active ?? 0,
    ]
  );
}

/**
 * Delete a provider configuration.
 */
export async function deleteProviderConfig(id: string): Promise<void> {
  const database = await initDB();
  await database.execute("DELETE FROM provider_configs WHERE id = $1", [id]);
}

/**
 * Update the active provider and model based on extension write-back.
 * Sets is_active=0 for all providers, then is_active=1 + model for the specified provider.
 */
export async function updateActiveProvider(providerId: string, model: string): Promise<void> {
  const database = await initDB();
  await database.execute("UPDATE provider_configs SET is_active = 0");
  await database.execute(
    "UPDATE provider_configs SET is_active = 1, model = $1, updated_at = datetime('now') WHERE id = $2",
    [model, providerId]
  );
}

// ── Grading Sessions ────────────────────────────────────────────────────

/**
 * Get all grading sessions, most recent first.
 */
export async function getGradingSessions(): Promise<GradingSession[]> {
  const database = await initDB();
  return await database.select<GradingSession[]>(
    "SELECT * FROM grading_sessions ORDER BY created_at DESC"
  );
}

/**
 * Insert a new grading session. Returns the inserted row id.
 */
export async function insertGradingSession(session: {
  provider_id?: string | null;
  model?: string | null;
  student_count?: number | null;
  mean_score?: number | null;
  min_score?: number | null;
  max_score?: number | null;
  median_score?: number | null;
  max_possible_score?: number | null;
  page_url?: string | null;
  question_id?: string | null;
  custom_instructions?: string | null;
}): Promise<number> {
  const database = await initDB();
  const result = await database.execute(
    `INSERT INTO grading_sessions
       (provider_id, model, student_count, mean_score, min_score, max_score,
        median_score, max_possible_score, page_url, question_id, custom_instructions)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      session.provider_id ?? null,
      session.model ?? null,
      session.student_count ?? null,
      session.mean_score ?? null,
      session.min_score ?? null,
      session.max_score ?? null,
      session.median_score ?? null,
      session.max_possible_score ?? null,
      session.page_url ?? null,
      session.question_id ?? null,
      session.custom_instructions ?? null,
    ]
  );
  return result.lastInsertId;
}

// ── App Settings ────────────────────────────────────────────────────────

/**
 * Get a setting value by key. Returns null if not found.
 */
export async function getSetting(key: string): Promise<string | null> {
  const database = await initDB();
  const rows = await database.select<AppSetting[]>(
    "SELECT value FROM app_settings WHERE key = $1",
    [key]
  );
  return rows.length > 0 ? rows[0].value : null;
}

/**
 * Set a setting value. Upserts (creates or updates).
 */
export async function setSetting(
  key: string,
  value: string
): Promise<void> {
  const database = await initDB();
  await database.execute(
    `INSERT INTO app_settings (key, value) VALUES ($1, $2)
     ON CONFLICT(key) DO UPDATE SET value = $2`,
    [key, value]
  );
}

// ── OAuth Tokens ────────────────────────────────────────────────────────

// Re-export for convenience if needed
export interface OAuthToken {
  provider: string;
  access_token: string;
  refresh_token: string | null;
  token_type: string | null;
  expires_at: number | null;
  created_at: string;
  updated_at: string;
}

/**
 * Get an OAuth token by provider.
 */
export async function getOAuthToken(provider: string): Promise<OAuthToken | null> {
  const database = await initDB();
  const rows = await database.select<OAuthToken[]>(
    "SELECT * FROM oauth_tokens WHERE provider = $1",
    [provider]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Save (upsert) an OAuth token.
 */
export async function saveOAuthToken(token: {
  provider: string;
  access_token: string;
  refresh_token?: string | null;
  token_type?: string | null;
  expires_at?: number | null;
}): Promise<void> {
  const database = await initDB();
  await database.execute(
    `INSERT INTO oauth_tokens (provider, access_token, refresh_token, token_type, expires_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, datetime('now'), datetime('now'))
     ON CONFLICT(provider) DO UPDATE SET
       access_token = $2,
       refresh_token = $3,
       token_type = $4,
       expires_at = $5,
       updated_at = datetime('now')`,
    [
      token.provider,
      token.access_token,
      token.refresh_token ?? null,
      token.token_type ?? null,
      token.expires_at ?? null,
    ]
  );
}

/**
 * Delete an OAuth token by provider.
 */
export async function deleteOAuthToken(provider: string): Promise<void> {
  const database = await initDB();
  await database.execute("DELETE FROM oauth_tokens WHERE provider = $1", [provider]);
}
