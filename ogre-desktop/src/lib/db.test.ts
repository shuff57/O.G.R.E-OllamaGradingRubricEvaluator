import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock @tauri-apps/plugin-sql ──────────────────────────────────────────
// The Database mock tracks calls so we can assert CRUD operations
// without a real SQLite instance.
// vi.hoisted() ensures these are available when the vi.mock factory runs
// (vi.mock is hoisted above all imports/variable declarations).

const { mockSelect, mockExecute } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockExecute: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-sql', () => ({
  default: {
    load: vi.fn().mockResolvedValue({
      select: mockSelect,
      execute: mockExecute,
    }),
  },
}));

// Import AFTER mocks are set up
import {
  initDB,
  getSiteCredentials,
  getSiteCredentialsByUrl,
  saveSiteCredential,
  deleteSiteCredential,
  type SiteCredential,
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

// ── Tests ────────────────────────────────────────────────────────────────

describe('db.ts — Site Credential CRUD', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    mockSelect.mockResolvedValueOnce(creds);

    const result = await getSiteCredentials();
    expect(result).toEqual(creds);
    expect(result).toHaveLength(2);
    expect(mockSelect).toHaveBeenCalledWith(
      'SELECT * FROM site_credentials ORDER BY site_name',
    );
  });

  it('getSiteCredentials returns empty array when no credentials exist', async () => {
    mockSelect.mockResolvedValueOnce([]);

    const result = await getSiteCredentials();
    expect(result).toEqual([]);
    expect(result).toHaveLength(0);
  });

  // ── saveSiteCredential ───────────────────────────────────────────────

  it('saveSiteCredential inserts a new credential (no id)', async () => {
    mockExecute.mockResolvedValueOnce({ lastInsertId: 42 });

    const id = await saveSiteCredential({
      site_name: 'MyOpenMath',
      url_pattern: 'myopenmath.com',
      username: 'teacher',
      password: 'secret',
    });

    expect(id).toBe(42);
    expect(mockExecute).toHaveBeenCalledTimes(1);
    // Verify the SQL contains INSERT
    const sql = mockExecute.mock.calls[0][0] as string;
    expect(sql).toContain('INSERT INTO site_credentials');
  });

  it('saveSiteCredential updates an existing credential (with id)', async () => {
    mockExecute.mockResolvedValueOnce({});

    const id = await saveSiteCredential({
      id: 5,
      site_name: 'Canvas',
      url_pattern: 'instructure.com',
      username: 'prof',
      password: 'pass123',
    });

    expect(id).toBe(5);
    expect(mockExecute).toHaveBeenCalledTimes(1);
    const sql = mockExecute.mock.calls[0][0] as string;
    expect(sql).toContain('UPDATE site_credentials');
  });

  it('saveSiteCredential passes notes as null when omitted', async () => {
    mockExecute.mockResolvedValueOnce({ lastInsertId: 10 });

    await saveSiteCredential({
      site_name: 'Moodle',
      url_pattern: 'moodle.org',
      username: 'user',
      password: 'pw',
    });

    // notes should be null (last param before id in insert)
    const params = mockExecute.mock.calls[0][1] as unknown[];
    expect(params[params.length - 1]).toBeNull();
  });

  // ── getSiteCredentialsByUrl ──────────────────────────────────────────

  it('getSiteCredentialsByUrl queries with the given URL', async () => {
    const cred = makeCred();
    mockSelect.mockResolvedValueOnce([cred]);

    const result = await getSiteCredentialsByUrl('https://www.myopenmath.com/login');
    expect(result).toEqual([cred]);
    expect(mockSelect).toHaveBeenCalledWith(
      'SELECT * FROM site_credentials WHERE $1 LIKE url_pattern ORDER BY site_name',
      ['https://www.myopenmath.com/login'],
    );
  });

  it('getSiteCredentialsByUrl returns empty array for non-matching URL', async () => {
    mockSelect.mockResolvedValueOnce([]);

    const result = await getSiteCredentialsByUrl('https://example.com');
    expect(result).toEqual([]);
  });

  // ── deleteSiteCredential ─────────────────────────────────────────────

  it('deleteSiteCredential calls DELETE with the correct id', async () => {
    mockExecute.mockResolvedValueOnce({});

    await deleteSiteCredential(7);
    expect(mockExecute).toHaveBeenCalledWith(
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
    mockSelect.mockResolvedValueOnce(creds);

    const result = await getSiteCredentials();
    expect(result).toHaveLength(2);
    expect(result[0].username).toBe('teacher1');
    expect(result[1].username).toBe('teacher2');
  });
});
