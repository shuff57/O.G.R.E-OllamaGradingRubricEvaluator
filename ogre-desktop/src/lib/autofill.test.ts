import { describe, it, expect } from 'vitest';
import {
  generateAutoFillScript,
  matchCredentialsToUrl,
  LMS_LOGIN_SELECTORS,
} from './autofill';
import type { SiteCredential } from './db';

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

// ── LMS_LOGIN_SELECTORS ─────────────────────────────────────────────────

describe('LMS_LOGIN_SELECTORS', () => {
  it('exports a non-empty array of selector configs', () => {
    expect(LMS_LOGIN_SELECTORS).toBeDefined();
    expect(Array.isArray(LMS_LOGIN_SELECTORS)).toBe(true);
    expect(LMS_LOGIN_SELECTORS.length).toBeGreaterThanOrEqual(4);
  });

  it('contains entries for MyOpenMath, Canvas, Blackboard, and Moodle', () => {
    const names = LMS_LOGIN_SELECTORS.map((s) => s.name);
    expect(names).toContain('MyOpenMath');
    expect(names).toContain('Canvas');
    expect(names).toContain('Blackboard');
    expect(names).toContain('Moodle');
  });

  it('each entry has required fields', () => {
    for (const sel of LMS_LOGIN_SELECTORS) {
      expect(sel.name).toBeTruthy();
      expect(sel.urlPattern).toBeTruthy();
      expect(sel.usernameSelector).toBeTruthy();
      expect(sel.passwordSelector).toBeTruthy();
    }
  });
});

// ── generateAutoFillScript ──────────────────────────────────────────────

describe('generateAutoFillScript', () => {
  it('returns a non-empty string', () => {
    const script = generateAutoFillScript('user', 'pass');
    expect(typeof script).toBe('string');
    expect(script.length).toBeGreaterThan(0);
  });

  it('embeds username and password in the output', () => {
    const script = generateAutoFillScript('testuser', 'testpass');
    expect(script).toContain('testuser');
    expect(script).toContain('testpass');
  });

  it('includes retry logic with setTimeout', () => {
    const script = generateAutoFillScript('u', 'p');
    expect(script).toContain('setTimeout');
  });

  it('includes retry delay values', () => {
    const script = generateAutoFillScript('u', 'p');
    expect(script).toContain('RETRY_DELAYS');
    expect(script).toContain('MAX_RETRIES');
  });

  it('includes dispatchEvent for React/SPA compatibility', () => {
    const script = generateAutoFillScript('u', 'p');
    expect(script).toContain('dispatchEvent');
  });

  it('dispatches both input and change events', () => {
    const script = generateAutoFillScript('u', 'p');
    expect(script).toContain("new Event('input'");
    expect(script).toContain("new Event('change'");
  });

  it('wraps in an IIFE for isolation', () => {
    const script = generateAutoFillScript('u', 'p');
    expect(script).toContain('(function()');
    expect(script).toContain('})()');
  });

  it('escapes special characters in credentials', () => {
    const script = generateAutoFillScript("user'name", 'pass\\word');
    // Single quotes should be escaped
    expect(script).toContain("\\'");
    // Backslashes should be escaped
    expect(script).toContain('\\\\');
  });

  it('includes the LMS selector definitions', () => {
    const script = generateAutoFillScript('u', 'p');
    expect(script).toContain('myopenmath.com');
    expect(script).toContain('instructure.com');
    expect(script).toContain('blackboard.com');
    expect(script).toContain('moodle.org');
  });

  it('uses native input setter for framework compatibility', () => {
    const script = generateAutoFillScript('u', 'p');
    expect(script).toContain('HTMLInputElement.prototype');
    expect(script).toContain('nativeSetter');
  });
});

// ── matchCredentialsToUrl ───────────────────────────────────────────────

describe('matchCredentialsToUrl', () => {
  const credentials: SiteCredential[] = [
    makeCred({ id: 1, site_name: 'MyOpenMath', url_pattern: 'myopenmath.com' }),
    makeCred({ id: 2, site_name: 'Canvas', url_pattern: 'instructure.com' }),
    makeCred({ id: 3, site_name: 'Blackboard', url_pattern: 'blackboard.com' }),
    makeCred({ id: 4, site_name: 'Moodle', url_pattern: 'moodle.org' }),
  ];

  // ── Matching ─────────────────────────────────────────────────────────

  it('matches MyOpenMath URL to myopenmath.com credential', () => {
    const result = matchCredentialsToUrl('https://www.myopenmath.com/', credentials);
    expect(result).not.toBeNull();
    expect(result!.site_name).toBe('MyOpenMath');
    expect(result!.url_pattern).toBe('myopenmath.com');
  });

  it('matches Canvas URL to instructure.com credential', () => {
    const result = matchCredentialsToUrl('https://school.instructure.com/', credentials);
    expect(result).not.toBeNull();
    expect(result!.site_name).toBe('Canvas');
    expect(result!.url_pattern).toBe('instructure.com');
  });

  it('matches Blackboard URL to blackboard.com credential', () => {
    const result = matchCredentialsToUrl('https://university.blackboard.com/', credentials);
    expect(result).not.toBeNull();
    expect(result!.site_name).toBe('Blackboard');
    expect(result!.url_pattern).toBe('blackboard.com');
  });

  it('matches Moodle URL to moodle.org credential', () => {
    const result = matchCredentialsToUrl('https://college.moodle.org/', credentials);
    expect(result).not.toBeNull();
    expect(result!.site_name).toBe('Moodle');
    expect(result!.url_pattern).toBe('moodle.org');
  });

  // ── Case insensitivity ───────────────────────────────────────────────

  it('matches case-insensitively', () => {
    const result = matchCredentialsToUrl('https://WWW.MYOPENMATH.COM/login', credentials);
    expect(result).not.toBeNull();
    expect(result!.site_name).toBe('MyOpenMath');
  });

  // ── Non-matching ─────────────────────────────────────────────────────

  it('returns null for non-matching URL', () => {
    const result = matchCredentialsToUrl('https://example.com/', credentials);
    expect(result).toBeNull();
  });

  it('returns null for empty URL', () => {
    const result = matchCredentialsToUrl('', credentials);
    expect(result).toBeNull();
  });

  it('returns null for empty credentials array', () => {
    const result = matchCredentialsToUrl('https://www.myopenmath.com/', []);
    expect(result).toBeNull();
  });

  it('returns null when credentials is undefined-like', () => {
    // @ts-expect-error testing defensive null handling
    const result = matchCredentialsToUrl('https://www.myopenmath.com/', null);
    expect(result).toBeNull();
  });

  // ── First-match priority ─────────────────────────────────────────────

  it('returns the first matching credential when multiple could match', () => {
    const dupes: SiteCredential[] = [
      makeCred({ id: 10, site_name: 'MOM-Work', url_pattern: 'myopenmath.com', username: 'work' }),
      makeCred({ id: 11, site_name: 'MOM-Personal', url_pattern: 'myopenmath.com', username: 'personal' }),
    ];
    const result = matchCredentialsToUrl('https://www.myopenmath.com/', dupes);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(10);
    expect(result!.username).toBe('work');
  });

  // ── Wildcard pattern matching (% support) ────────────────────────────────

  it('matches URLs with % wildcard at the end', () => {
    const creds: SiteCredential[] = [
      makeCred({ site_name: 'Canvas', url_pattern: 'https://canvas.instructure.com/%', username: 'test' }),
    ];
    
    // Should match any path after the domain
    expect(matchCredentialsToUrl('https://canvas.instructure.com/', creds)).not.toBeNull();
    expect(matchCredentialsToUrl('https://canvas.instructure.com/courses', creds)).not.toBeNull();
    expect(matchCredentialsToUrl('https://canvas.instructure.com/courses/123/assignments', creds)).not.toBeNull();
    
    // Should NOT match different domains
    expect(matchCredentialsToUrl('https://canvas.example.com/', creds)).toBeNull();
    expect(matchCredentialsToUrl('https://example.com/', creds)).toBeNull();
  });

  it('matches URLs with % wildcard in the middle', () => {
    const creds: SiteCredential[] = [
      makeCred({ site_name: 'Canvas', url_pattern: 'https://%.instructure.com/', username: 'test' }),
    ];
    
    // Should match any subdomain
    expect(matchCredentialsToUrl('https://school1.instructure.com/', creds)).not.toBeNull();
    expect(matchCredentialsToUrl('https://university.instructure.com/', creds)).not.toBeNull();
    
    // Should NOT match without subdomain or different domain
    expect(matchCredentialsToUrl('https://instructure.com/', creds)).toBeNull();
    expect(matchCredentialsToUrl('https://school1.example.com/', creds)).toBeNull();
  });

  it('matches URLs with multiple % wildcards', () => {
    const creds: SiteCredential[] = [
      makeCred({ site_name: 'Canvas', url_pattern: 'https://%.instructure.com/%', username: 'test' }),
    ];
    
    // Should match any subdomain and any path
    expect(matchCredentialsToUrl('https://school.instructure.com/courses', creds)).not.toBeNull();
    expect(matchCredentialsToUrl('https://uni.instructure.com/login', creds)).not.toBeNull();
  });

  it('escapes regex special characters in patterns', () => {
    const creds: SiteCredential[] = [
      makeCred({ site_name: 'Test', url_pattern: 'https://example.com/path?query=value', username: 'test' }),
    ];
    
    // Should match exact URL with special chars (?, =) treated literally
    expect(matchCredentialsToUrl('https://example.com/path?query=value', creds)).not.toBeNull();
    
    // Should NOT match if special chars are different
    expect(matchCredentialsToUrl('https://example.com/path?query=other', creds)).toBeNull();
  });

  it('falls back to substring matching when no % wildcard present', () => {
    const creds: SiteCredential[] = [
      makeCred({ site_name: 'MOM', url_pattern: 'myopenmath.com', username: 'test' }),
    ];
    
    // Should work as before - substring matching
    expect(matchCredentialsToUrl('https://www.myopenmath.com/', creds)).not.toBeNull();
    expect(matchCredentialsToUrl('https://myopenmath.com/assess2/', creds)).not.toBeNull();
  });

  it('handles case insensitivity with wildcards', () => {
    const creds: SiteCredential[] = [
      makeCred({ site_name: 'Canvas', url_pattern: 'HTTPS://CANVAS.INSTRUCTURE.COM/%', username: 'test' }),
    ];
    
    // Should match regardless of case
    expect(matchCredentialsToUrl('https://canvas.instructure.com/courses', creds)).not.toBeNull();
    expect(matchCredentialsToUrl('HTTPS://CANVAS.INSTRUCTURE.COM/COURSES', creds)).not.toBeNull();
  });

  it('matches preset button patterns correctly', () => {
    // These are the exact patterns generated by preset buttons in Settings.svelte
    const presetCreds: SiteCredential[] = [
      makeCred({ site_name: 'Canvas', url_pattern: 'https://canvas.instructure.com/%', username: 'test1' }),
      makeCred({ site_name: 'MyOpenMath', url_pattern: 'https://www.myopenmath.com/%', username: 'test2' }),
      makeCred({ site_name: 'Blackboard', url_pattern: 'https://blackboard.com/%', username: 'test3' }),
      makeCred({ site_name: 'Moodle', url_pattern: 'https://moodle.org/%', username: 'test4' }),
    ];
    
    // All should match their respective login pages
    expect(matchCredentialsToUrl('https://canvas.instructure.com/login', presetCreds)!.username).toBe('test1');
    expect(matchCredentialsToUrl('https://www.myopenmath.com/login.php', presetCreds)!.username).toBe('test2');
    expect(matchCredentialsToUrl('https://blackboard.com/auth', presetCreds)!.username).toBe('test3');
    expect(matchCredentialsToUrl('https://moodle.org/login/index.php', presetCreds)!.username).toBe('test4');
  });
});
