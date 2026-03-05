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

export interface SiteCredential {
  id: number;
  site_name: string;
  url_pattern: string;
  username: string;
  password: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface SiteProfile {
  id: string;
  name: string;
  url_patterns: string;
  selectors: string;
  feedback: string;
  save: string;
  navigation: string;
  extraction: string | null;
  created_at: string;
  updated_at: string;
}

export interface BatchSession {
  id: number;
  url: string;
  last_student_name: string;
  timestamp: string;
}


export interface Skill {
  id: string;
  name: string;
  description: string;
  content: string;
  source: string | null;
  source_id: string | null;
  is_active: number;
  url_pattern: string | null;
  created_at: string;
  updated_at: string;
}

export interface ResponseEmbedding {
  id: number;
  session_id: number | null;
  rubric_hash: string;
  student_response: string | null;
  score: number;
  feedback: string | null;
  embedding: Uint8Array | number[];  // Tauri IPC deserializes BLOBs as number[]
  embedding_model: string;
  created_at: string;
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

// ── Site Credentials ────────────────────────────────────────────────────

/**
 * Get all site credentials, ordered by site_name.
 */
export async function getSiteCredentials(): Promise<SiteCredential[]> {
  const database = await initDB();
  return await database.select<SiteCredential[]>(
    "SELECT * FROM site_credentials ORDER BY site_name"
  );
}

/**
 * Get site credentials by URL pattern match.
 * Returns all credentials where the given URL matches the url_pattern.
 */
export async function getSiteCredentialsByUrl(url: string): Promise<SiteCredential[]> {
  const database = await initDB();
  return await database.select<SiteCredential[]>(
    "SELECT * FROM site_credentials WHERE $1 LIKE url_pattern ORDER BY site_name",
    [url]
  );
}

/**
 * Save (upsert) a site credential.
 * If id is provided and exists, updates the credential.
 * Otherwise, inserts a new credential.
 */
export async function saveSiteCredential(credential: {
  id?: number;
  site_name: string;
  url_pattern: string;
  username: string;
  password: string;
  notes?: string | null;
}): Promise<number> {
  const database = await initDB();
  
  if (credential.id) {
    // Update existing credential
    await database.execute(
      `UPDATE site_credentials
       SET site_name = $1, url_pattern = $2, username = $3, password = $4, notes = $5, updated_at = datetime('now')
       WHERE id = $6`,
      [
        credential.site_name,
        credential.url_pattern,
        credential.username,
        credential.password,
        credential.notes ?? null,
        credential.id,
      ]
    );
    return credential.id;
  } else {
    // Insert new credential
    const result = await database.execute(
      `INSERT INTO site_credentials (site_name, url_pattern, username, password, notes)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        credential.site_name,
        credential.url_pattern,
        credential.username,
        credential.password,
        credential.notes ?? null,
      ]
    );
    return result.lastInsertId;
  }
}

/**
 * Delete a site credential by id.
 */
export async function deleteSiteCredential(id: number): Promise<void> {
  const database = await initDB();
  await database.execute("DELETE FROM site_credentials WHERE id = $1", [id]);
}

// ── Site Profiles ───────────────────────────────────────────────────────

/**
 * Get all site profiles, ordered by name.
 */
export async function getSiteProfiles(): Promise<SiteProfile[]> {
  const database = await initDB();
  return await database.select<SiteProfile[]>(
    "SELECT * FROM site_profiles ORDER BY name"
  );
}

/**
 * Get a single site profile by id.
 */
export async function getSiteProfile(id: string): Promise<SiteProfile | null> {
  const database = await initDB();
  const rows = await database.select<SiteProfile[]>(
    "SELECT * FROM site_profiles WHERE id = $1",
    [id]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Save (upsert) a site profile.
 * If id is provided and exists, updates the profile.
 * Otherwise, inserts a new profile.
 */
export async function saveSiteProfile(profile: {
  id?: string;
  name: string;
  url_patterns: string;
  selectors: string;
  feedback: string;
  save: string;
  navigation: string;
  extraction?: string | null;
}): Promise<string> {
  const database = await initDB();
  const id = profile.id || crypto.randomUUID();

  if (profile.id) {
    // Update existing profile
    await database.execute(
      `UPDATE site_profiles
       SET name = $1, url_patterns = $2, selectors = $3, feedback = $4, save = $5, navigation = $6, extraction = $7, updated_at = datetime('now')
       WHERE id = $8`,
      [
        profile.name,
        profile.url_patterns,
        profile.selectors,
        profile.feedback,
        profile.save,
        profile.navigation,
        profile.extraction ?? null,
        profile.id,
      ]
    );
    return profile.id;
  } else {
    // Insert new profile
    await database.execute(
      `INSERT INTO site_profiles (id, name, url_patterns, selectors, feedback, save, navigation, extraction)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        profile.name,
        profile.url_patterns,
        profile.selectors,
        profile.feedback,
        profile.save,
        profile.navigation,
        profile.extraction ?? null,
      ]
    );
    return id;
  }
}

/**
 * Delete a site profile by id.
 */
export async function deleteSiteProfile(id: string): Promise<void> {
  const database = await initDB();
  await database.execute("DELETE FROM site_profiles WHERE id = $1", [id]);
}

/**
 * Find site profiles matching a given URL.
 * Returns all profiles where the URL matches any of the url_patterns.
 */
export async function findSiteProfilesByUrl(url: string): Promise<SiteProfile[]> {
  const database = await initDB();
  return await database.select<SiteProfile[]>(
    "SELECT * FROM site_profiles WHERE $1 LIKE url_patterns ORDER BY name",
    [url]
  );
}

// ── Batch Session (Resume Persistence) ─────────────────────────────────

/**
 * Get the batch session for a given URL.
 * Returns null if no session exists for that URL.
 */
export async function getBatchSession(url: string): Promise<BatchSession | null> {
  const database = await initDB();
  const rows = await database.select<BatchSession[]>(
    "SELECT * FROM batch_session WHERE url = $1",
    [url]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Save (upsert) the batch session resume point for a URL.
 * Records the last successfully graded student name so grading can resume.
 */
export async function saveBatchSession(url: string, lastStudentName: string): Promise<void> {
  const database = await initDB();
  await database.execute(
    `INSERT INTO batch_session (url, last_student_name, timestamp)
     VALUES ($1, $2, datetime('now'))
     ON CONFLICT(url) DO UPDATE SET
       last_student_name = $2,
       timestamp = datetime('now')`,
    [url, lastStudentName]
  );
}

/**
 * Clear the batch session for a given URL.
 * Called on batch completion or when user chooses "Start Fresh".
 */
export async function clearBatchSession(url: string): Promise<void> {
  const database = await initDB();
  await database.execute("DELETE FROM batch_session WHERE url = $1", [url]);
}


// ── Skills ──────────────────────────────────────────────────────────────

/**
 * Get all skills, ordered by name.
 */
export async function getSkills(): Promise<Skill[]> {
  const database = await initDB();
  return await database.select<Skill[]>("SELECT * FROM skills ORDER BY name");
}

/**
 * Get only active skills (is_active = 1), ordered by name.
 */
export async function getActiveSkills(): Promise<Skill[]> {
  const database = await initDB();
  return await database.select<Skill[]>("SELECT * FROM skills WHERE is_active = 1 ORDER BY name");
}

/**
 * Get a single skill by id. Returns null if not found.
 */
export async function getSkill(id: string): Promise<Skill | null> {
  const database = await initDB();
  const rows = await database.select<Skill[]>("SELECT * FROM skills WHERE id = $1", [id]);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Save (upsert) a skill.
 * If id is provided and exists, updates the skill.
 * Otherwise, inserts a new skill with a generated UUID.
 */
export async function saveSkill(skill: {
  id?: string;
  name: string;
  description?: string;
  content?: string;
  source?: string | null;
  source_id?: string | null;
  is_active?: number;
  url_pattern?: string | null;
}): Promise<string> {
  const database = await initDB();
  const id = skill.id || crypto.randomUUID();
  if (skill.id) {
    await database.execute(
      `UPDATE skills SET name = $1, description = $2, content = $3, source = $4, source_id = $5, is_active = $6, url_pattern = $7, updated_at = datetime('now') WHERE id = $8`,
      [skill.name, skill.description ?? '', skill.content ?? '', skill.source ?? null, skill.source_id ?? null, skill.is_active ?? 0, skill.url_pattern ?? null, skill.id]
    );
    return skill.id;
  } else {
    await database.execute(
      `INSERT INTO skills (id, name, description, content, source, source_id, is_active, url_pattern) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, skill.name, skill.description ?? '', skill.content ?? '', skill.source ?? null, skill.source_id ?? null, skill.is_active ?? 0, skill.url_pattern ?? null]
    );
    return id;
  }
}

/**
 * Get all skills that have a url_pattern set (non-null, non-empty).
 * Used for site-based profile injection in Agent Mode.
 */
export async function getSkillsWithUrlPattern(): Promise<Skill[]> {
  const database = await initDB();
  return await database.select<Skill[]>(
    "SELECT * FROM skills WHERE url_pattern IS NOT NULL AND url_pattern != '' ORDER BY name"
  );
}

/**
 * Toggle a skill's active state.
 */
export async function updateSkillActive(id: string, isActive: number): Promise<void> {
  const database = await initDB();
  await database.execute(
    "UPDATE skills SET is_active = $1, updated_at = datetime('now') WHERE id = $2",
    [isActive, id]
  );
}

/**
 * Delete a skill by id.
 */
export async function deleteSkill(id: string): Promise<void> {
  const database = await initDB();
  await database.execute("DELETE FROM skills WHERE id = $1", [id]);
}

/**
 * Find a skill by its source and source_id.
 * Useful for checking if a skill from a particular source already exists.
 */
export async function getSkillBySource(source: string, sourceId: string): Promise<Skill | null> {
  const database = await initDB();
  const rows = await database.select<Skill[]>(
    "SELECT * FROM skills WHERE source = $1 AND source_id = $2",
    [source, sourceId]
  );
  return rows.length > 0 ? rows[0] : null;
}