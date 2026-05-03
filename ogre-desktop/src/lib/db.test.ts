import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockDbQuery, mockDbExecute } = vi.hoisted(() => ({
  mockDbQuery: vi.fn(),
  mockDbExecute: vi.fn(),
}));

import {
  initDB,
  getSiteCredentials,
  getSiteCredentialsByUrl,
  saveSiteCredential,
  deleteSiteCredential,
  getBatchSession,
  saveBatchSession,
  clearBatchSession,
  getSkills,
  getActiveSkills,
  getSkill,
  saveSkill,
  updateSkillActive,
  deleteSkill,
  getSkillBySource,
  getSkillsWithUrlPattern,
  type SiteCredential,
  type BatchSession,
  type Skill,
  type ResponseEmbedding,
} from './db';

// ── Helpers ──────────────────────────────────────────────────────────────

function makeCred(overrides: Partial<SiteCredential> = {}): SiteCredential {
  return {
    id: 1,
    site_name: 'MyOpenMath',
    url_pattern: 'myopenmath.com',
    username: 'teacher',
    password: 'secret',
    notes: null,
    created_at: '2025-01-01T00:00:00',
    updated_at: '2025-01-01T00:00:00',
    ...overrides,
  };
}

function makeResponseEmbedding(overrides: Partial<ResponseEmbedding> = {}): ResponseEmbedding {
  return {
    id: 1,
    session_id: 1,
    rubric_hash: 'abc123def456',
    student_response: 'The answer is 42.',
    score: 8.5,
    feedback: 'Good work!',
    embedding: new Uint8Array([0.1, 0.2, 0.3]),
    embedding_model: 'nomic-embed-text',
    created_at: '2025-01-01T00:00:00',
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('db.ts — Site Credential CRUD', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('electronAPI', {
      dbQuery: mockDbQuery,
      dbExecute: mockDbExecute,
    });
  });

  // ── initDB ───────────────────────────────────────────────────────────

  it('initDB returns a database instance', async () => {
    const db = await initDB();
    expect(db).toBeDefined();
    expect(db.select).toBeDefined();
    expect(db.execute).toBeDefined();
  });

  // ── getSiteCredentials ───────────────────────────────────────────────

  it('getSiteCredentials returns an array of credentials', async () => {
    const creds = [makeCred(), makeCred({ id: 2, site_name: 'Canvas', url_pattern: 'instructure.com' })];
    mockDbQuery.mockResolvedValueOnce(creds);

    const result = await getSiteCredentials();
    expect(result).toEqual(creds);
    expect(result).toHaveLength(2);
    expect(mockDbQuery).toHaveBeenCalledWith(
      'SELECT * FROM site_credentials ORDER BY site_name',
      [],
    );
  });

  it('getSiteCredentials returns empty array when no credentials exist', async () => {
    mockDbQuery.mockResolvedValueOnce([]);

    const result = await getSiteCredentials();
    expect(result).toEqual([]);
    expect(result).toHaveLength(0);
  });

  // ── saveSiteCredential ───────────────────────────────────────────────

  it('saveSiteCredential inserts a new credential (no id)', async () => {
    mockDbExecute.mockResolvedValueOnce({ rowsAffected: 1, lastInsertId: 42 });

    const id = await saveSiteCredential({
      site_name: 'MyOpenMath',
      url_pattern: 'myopenmath.com',
      username: 'teacher',
      password: 'secret',
    });

    expect(id).toBe(42);
    expect(mockDbExecute).toHaveBeenCalledTimes(1);
    // Verify the SQL contains INSERT
    const sql = mockDbExecute.mock.calls[0][0] as string;
    expect(sql).toContain('INSERT INTO site_credentials');
  });

  it('saveSiteCredential updates an existing credential (with id)', async () => {
    mockDbExecute.mockResolvedValueOnce({ rowsAffected: 1, lastInsertId: 0 });

    const id = await saveSiteCredential({
      id: 5,
      site_name: 'Canvas',
      url_pattern: 'instructure.com',
      username: 'prof',
      password: 'pass123',
    });

    expect(id).toBe(5);
    expect(mockDbExecute).toHaveBeenCalledTimes(1);
    const sql = mockDbExecute.mock.calls[0][0] as string;
    expect(sql).toContain('UPDATE site_credentials');
  });

  it('saveSiteCredential passes notes as null when omitted', async () => {
    mockDbExecute.mockResolvedValueOnce({ rowsAffected: 1, lastInsertId: 10 });

    await saveSiteCredential({
      site_name: 'Moodle',
      url_pattern: 'moodle.org',
      username: 'user',
      password: 'pw',
    });

    // notes should be null (last param before id in insert)
    const params = mockDbExecute.mock.calls[0][1] as unknown[];
    expect(params[params.length - 1]).toBeNull();
  });

  // ── getSiteCredentialsByUrl ──────────────────────────────────────────

  it('getSiteCredentialsByUrl queries with the given URL', async () => {
    const cred = makeCred();
    mockDbQuery.mockResolvedValueOnce([cred]);

    const result = await getSiteCredentialsByUrl('https://www.myopenmath.com/login');
    expect(result).toEqual([cred]);
    expect(mockDbQuery).toHaveBeenCalledWith(
      'SELECT * FROM site_credentials WHERE $1 LIKE url_pattern ORDER BY site_name',
      ['https://www.myopenmath.com/login'],
    );
  });

  it('getSiteCredentialsByUrl returns empty array for non-matching URL', async () => {
    mockDbQuery.mockResolvedValueOnce([]);

    const result = await getSiteCredentialsByUrl('https://example.com');
    expect(result).toEqual([]);
  });

  // ── deleteSiteCredential ─────────────────────────────────────────────

  it('deleteSiteCredential calls DELETE with the correct id', async () => {
    mockDbExecute.mockResolvedValueOnce({ rowsAffected: 1, lastInsertId: 0 });

    await deleteSiteCredential(7);
    expect(mockDbExecute).toHaveBeenCalledWith(
      'DELETE FROM site_credentials WHERE id = $1',
      [7],
    );
  });

  // ── Multiple credentials for same domain ─────────────────────────────

  it('supports multiple credentials for the same domain', async () => {
    const creds = [
      makeCred({ id: 1, username: 'teacher1' }),
      makeCred({ id: 2, username: 'teacher2' }),
    ];
    mockDbQuery.mockResolvedValueOnce(creds);

    const result = await getSiteCredentials();
    expect(result).toHaveLength(2);
    expect(result[0].username).toBe('teacher1');
    expect(result[1].username).toBe('teacher2');
  });
});

// ── Tests: Batch Session (Resume Persistence) ──────────────────────────

function makeSession(overrides: Partial<BatchSession> = {}): BatchSession {
  return {
    id: 1,
    url: 'https://myopenmath.com/gradeallq2.php?cid=123',
    last_student_name: 'Smith, Jane',
    timestamp: '2025-02-18T12:00:00',
    ...overrides,
  };
}

describe('db.ts — Batch Session CRUD', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── getBatchSession ──────────────────────────────────────────────────

  it('getBatchSession returns session when one exists for the URL', async () => {
    const session = makeSession();
    mockDbQuery.mockResolvedValueOnce([session]);

    const result = await getBatchSession('https://myopenmath.com/gradeallq2.php?cid=123');
    expect(result).toEqual(session);
    expect(mockDbQuery).toHaveBeenCalledWith(
      'SELECT * FROM batch_session WHERE url = $1',
      ['https://myopenmath.com/gradeallq2.php?cid=123'],
    );
  });

  it('getBatchSession returns null when no session exists', async () => {
    mockDbQuery.mockResolvedValueOnce([]);

    const result = await getBatchSession('https://example.com/no-session');
    expect(result).toBeNull();
  });

  // ── saveBatchSession ─────────────────────────────────────────────────

  it('saveBatchSession upserts the session with URL and student name', async () => {
    mockDbExecute.mockResolvedValueOnce({ rowsAffected: 1, lastInsertId: 0 });

    await saveBatchSession('https://myopenmath.com/gradeallq2.php?cid=123', 'Doe, John');
    expect(mockDbExecute).toHaveBeenCalledTimes(1);

    const sql = mockDbExecute.mock.calls[0][0] as string;
    expect(sql).toContain('INSERT INTO batch_session');
    expect(sql).toContain('ON CONFLICT');
    expect(sql).toContain('last_student_name');

    const params = mockDbExecute.mock.calls[0][1] as unknown[];
    expect(params[0]).toBe('https://myopenmath.com/gradeallq2.php?cid=123');
    expect(params[1]).toBe('Doe, John');
  });

  it('saveBatchSession updates existing session on conflict', async () => {
    mockDbExecute.mockResolvedValueOnce({ rowsAffected: 1, lastInsertId: 0 });

    await saveBatchSession('https://myopenmath.com/gradeallq2.php?cid=123', 'Smith, Alice');
    const sql = mockDbExecute.mock.calls[0][0] as string;
    expect(sql).toContain('ON CONFLICT(url) DO UPDATE');
  });

  // ── clearBatchSession ────────────────────────────────────────────────

  it('clearBatchSession deletes session by URL', async () => {
    mockDbExecute.mockResolvedValueOnce({ rowsAffected: 1, lastInsertId: 0 });

    await clearBatchSession('https://myopenmath.com/gradeallq2.php?cid=123');
    expect(mockDbExecute).toHaveBeenCalledWith(
      'DELETE FROM batch_session WHERE url = $1',
      ['https://myopenmath.com/gradeallq2.php?cid=123'],
    );
  });

  it('clearBatchSession is safe when no session exists', async () => {
    mockDbExecute.mockResolvedValueOnce({ rowsAffected: 0, lastInsertId: 0 });

    await clearBatchSession('https://nonexistent.com/page');
    expect(mockDbExecute).toHaveBeenCalledTimes(1);
  });

  // ── Session lifecycle scenarios ──────────────────────────────────────

  it('save then get returns the saved session data', async () => {
    mockDbExecute.mockResolvedValueOnce({ rowsAffected: 1, lastInsertId: 0 });
    await saveBatchSession('https://example.com/grade', 'Johnson, Bob');

    const session = makeSession({
      url: 'https://example.com/grade',
      last_student_name: 'Johnson, Bob',
    });
    mockDbQuery.mockResolvedValueOnce([session]);

    const result = await getBatchSession('https://example.com/grade');
    expect(result).toEqual(session);
    expect(result?.last_student_name).toBe('Johnson, Bob');
  });

  it('clear then get returns null', async () => {
    mockDbExecute.mockResolvedValueOnce({ rowsAffected: 1, lastInsertId: 0 });
    await clearBatchSession('https://example.com/grade');

    mockDbQuery.mockResolvedValueOnce([]);
    const result = await getBatchSession('https://example.com/grade');
    expect(result).toBeNull();
  });

  it('different URLs have independent sessions', async () => {
    const session1 = makeSession({ url: 'https://site-a.com/grade', last_student_name: 'Alice' });
    const session2 = makeSession({ id: 2, url: 'https://site-b.com/grade', last_student_name: 'Bob' });

    mockDbQuery.mockResolvedValueOnce([session1]);
    const result1 = await getBatchSession('https://site-a.com/grade');
    expect(result1?.last_student_name).toBe('Alice');

    mockDbQuery.mockResolvedValueOnce([session2]);
    const result2 = await getBatchSession('https://site-b.com/grade');
    expect(result2?.last_student_name).toBe('Bob');
  });
});


// ── Tests: Skills CRUD ─────────────────────────────────────────────────

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: 'skill-uuid-1',
    name: 'Test Skill',
    description: 'A test skill',
    content: 'skill content here',
    source: null,
    source_id: null,
    is_active: 0,
    url_pattern: null,
    learned_corrections: null,
    created_at: '2025-01-01T00:00:00',
    updated_at: '2025-01-01T00:00:00',
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubGlobal('electronAPI', {
    dbQuery: mockDbQuery,
    dbExecute: mockDbExecute,
  });
});

describe('db.ts — Skills CRUD', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── getSkills ──────────────────────────────────────────────────────

  it('getSkills returns array ordered by name', async () => {
    const skills = [
      makeSkill({ id: 'a', name: 'Alpha' }),
      makeSkill({ id: 'b', name: 'Beta' }),
    ];
    mockDbQuery.mockResolvedValueOnce(skills);

    const result = await getSkills();
    expect(result).toEqual(skills);
    expect(result).toHaveLength(2);
    expect(mockDbQuery).toHaveBeenCalledWith(
      'SELECT * FROM skills ORDER BY name',
      [],
    );
  });

  it('getSkills returns empty array when no skills exist', async () => {
    mockDbQuery.mockResolvedValueOnce([]);

    const result = await getSkills();
    expect(result).toEqual([]);
    expect(result).toHaveLength(0);
  });

  // ── getActiveSkills ────────────────────────────────────────────────

  it('getActiveSkills returns only skills where is_active=1', async () => {
    const active = [makeSkill({ id: 'a', name: 'Active', is_active: 1 })];
    mockDbQuery.mockResolvedValueOnce(active);

    const result = await getActiveSkills();
    expect(result).toEqual(active);
    expect(mockDbQuery).toHaveBeenCalledWith(
      'SELECT * FROM skills WHERE is_active = 1 ORDER BY name',
      [],
    );
  });

  // ── getSkill ───────────────────────────────────────────────────────

  it('getSkill returns skill when found', async () => {
    const skill = makeSkill();
    mockDbQuery.mockResolvedValueOnce([skill]);

    const result = await getSkill('skill-uuid-1');
    expect(result).toEqual(skill);
    expect(mockDbQuery).toHaveBeenCalledWith(
      'SELECT * FROM skills WHERE id = $1',
      ['skill-uuid-1'],
    );
  });

  it('getSkill returns null when not found', async () => {
    mockDbQuery.mockResolvedValueOnce([]);

    const result = await getSkill('nonexistent');
    expect(result).toBeNull();
  });

  // ── saveSkill ──────────────────────────────────────────────────────

  it('saveSkill inserts new skill (no id) and returns UUID string', async () => {
    mockDbExecute.mockResolvedValueOnce({ rowsAffected: 1, lastInsertId: 0 });

    const id = await saveSkill({ name: 'New Skill' });
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
    expect(mockDbExecute).toHaveBeenCalledTimes(1);

    const sql = mockDbExecute.mock.calls[0][0] as string;
    expect(sql).toContain('INSERT INTO skills');
  });

  it('saveSkill updates existing skill (with id) and returns same id', async () => {
    mockDbExecute.mockResolvedValueOnce({ rowsAffected: 1, lastInsertId: 0 });

    const id = await saveSkill({ id: 'existing-id', name: 'Updated Skill' });
    expect(id).toBe('existing-id');
    expect(mockDbExecute).toHaveBeenCalledTimes(1);

    const sql = mockDbExecute.mock.calls[0][0] as string;
    expect(sql).toContain('UPDATE skills');
  });

  // ── updateSkillActive ──────────────────────────────────────────────

  it('updateSkillActive(id, 1) calls execute with correct SQL', async () => {
    mockDbExecute.mockResolvedValueOnce({ rowsAffected: 1, lastInsertId: 0 });

    await updateSkillActive('skill-1', 1);
    expect(mockDbExecute).toHaveBeenCalledWith(
      "UPDATE skills SET is_active = $1, updated_at = datetime('now') WHERE id = $2",
      [1, 'skill-1'],
    );
  });

  it('updateSkillActive(id, 0) calls execute with correct SQL', async () => {
    mockDbExecute.mockResolvedValueOnce({ rowsAffected: 1, lastInsertId: 0 });

    await updateSkillActive('skill-1', 0);
    expect(mockDbExecute).toHaveBeenCalledWith(
      "UPDATE skills SET is_active = $1, updated_at = datetime('now') WHERE id = $2",
      [0, 'skill-1'],
    );
  });

  // ── deleteSkill ────────────────────────────────────────────────────

  it('deleteSkill calls DELETE with correct id', async () => {
    mockDbExecute.mockResolvedValueOnce({ rowsAffected: 1, lastInsertId: 0 });

    await deleteSkill('skill-to-delete');
    expect(mockDbExecute).toHaveBeenCalledWith(
      'DELETE FROM skills WHERE id = $1',
      ['skill-to-delete'],
    );
  });

  // ── getSkillBySource ───────────────────────────────────────────────

  it('getSkillBySource returns skill when found', async () => {
    const skill = makeSkill({ source: 'github', source_id: 'repo-123' });
    mockDbQuery.mockResolvedValueOnce([skill]);

    const result = await getSkillBySource('github', 'repo-123');
    expect(result).toEqual(skill);
    expect(mockDbQuery).toHaveBeenCalledWith(
      'SELECT * FROM skills WHERE source = $1 AND source_id = $2',
      ['github', 'repo-123'],
    );
  });

  it('getSkillBySource returns null when not found', async () => {
    mockDbQuery.mockResolvedValueOnce([]);

    const result = await getSkillBySource('github', 'nonexistent');
    expect(result).toBeNull();
  });


  // ── url_pattern / getSkillsWithUrlPattern ────────────────────────

  it('saveSkill persists url_pattern when provided', async () => {
    mockDbExecute.mockResolvedValueOnce({ rowsAffected: 1, lastInsertId: 0 });

    await saveSkill({ name: 'MOM Guide', url_pattern: 'myopenmath.com' });
    const sql = mockDbExecute.mock.calls[0][0] as string;
    const args = mockDbExecute.mock.calls[0][1] as unknown[];
    expect(sql).toContain('url_pattern');
    expect(args).toContain('myopenmath.com');
  });

  it('saveSkill works without url_pattern (backward compatible)', async () => {
    mockDbExecute.mockResolvedValueOnce({ rowsAffected: 1, lastInsertId: 0 });

    const id = await saveSkill({ name: 'Old Skill' });
    expect(typeof id).toBe('string');
    const sql = mockDbExecute.mock.calls[0][0] as string;
    expect(sql).toContain('INSERT INTO skills');
  });

  it('getSkillsWithUrlPattern returns only skills with url_pattern set', async () => {
    const profileSkill = makeSkill({ url_pattern: 'myopenmath.com' });
    mockDbQuery.mockResolvedValueOnce([profileSkill]);

    const result = await getSkillsWithUrlPattern();
    expect(result).toHaveLength(1);
    expect(result[0].url_pattern).toBe('myopenmath.com');
    expect(mockDbQuery).toHaveBeenCalledWith(
      expect.stringContaining('url_pattern IS NOT NULL'),
      [],
    );
  });
});

describe('db.ts — ResponseEmbedding interface', () => {
  it('ResponseEmbedding has all 9 required fields', () => {
    const embedding = makeResponseEmbedding();
    
    // Verify all 9 fields exist
    expect(embedding).toHaveProperty('id');
    expect(embedding).toHaveProperty('session_id');
    expect(embedding).toHaveProperty('rubric_hash');
    expect(embedding).toHaveProperty('student_response');
    expect(embedding).toHaveProperty('score');
    expect(embedding).toHaveProperty('feedback');
    expect(embedding).toHaveProperty('embedding');
    expect(embedding).toHaveProperty('embedding_model');
    expect(embedding).toHaveProperty('created_at');
    
    // Verify field types
    expect(typeof embedding.id).toBe('number');
    expect(typeof embedding.session_id).toBe('number');
    expect(typeof embedding.rubric_hash).toBe('string');
    expect(typeof embedding.student_response).toBe('string');
    expect(typeof embedding.score).toBe('number');
    expect(typeof embedding.feedback).toBe('string');
    expect(embedding.embedding).toBeInstanceOf(Uint8Array);
    expect(typeof embedding.embedding_model).toBe('string');
    expect(typeof embedding.created_at).toBe('string');
  });

  it('ResponseEmbedding allows null for optional fields', () => {
    const embedding = makeResponseEmbedding({
      session_id: null,
      student_response: null,
      feedback: null,
    });
    
    expect(embedding.session_id).toBeNull();
    expect(embedding.student_response).toBeNull();
    expect(embedding.feedback).toBeNull();
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});
