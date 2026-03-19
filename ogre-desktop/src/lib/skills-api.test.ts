import { describe, it, expect, vi, beforeEach } from "vitest";
import * as profileJsonConverter from './profile-json-converter';
import { AGENT_SYSTEM_PROMPT } from './agent-prompt';

const { mockFetch } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
}));

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetch as typeof fetch);
});

// Import AFTER mocks are set up
import { buildSkillContentUrl, SKILLS_SH_SEARCH_URL, searchSkills, fetchSkillContent, fetchTrendingSkills, installSkill, buildSkillInjection, getSkillInjectionSize, findMatchingProfiles, buildSiteContextInjection, syncSiteProfiles, BUNDLED_PROFILES, getMatchingSkillsForUrl } from "./skills-api";

// ── Tests ─────────────────────────────────────────────────────────────────

describe("buildSkillContentUrl", () => {
  it("should build correct URL for vercel-react-best-practices", () => {
    const url = buildSkillContentUrl("vercel-labs/agent-skills", "vercel-react-best-practices");

    expect(url).toContain("vercel-labs/agent-skills");
    expect(url).toContain("react-best-practices"); // Normalized (vercel- stripped)
    expect(url).toMatch(/^https:\/\/raw\.githubusercontent\.com\//);
  });

  it("should build correct URL for react:components", () => {
    const url = buildSkillContentUrl("google-labs-code/stitch-skills", "react:components");

    expect(url).toContain("google-labs-code/stitch-skills");
    expect(url).toContain("react-components"); // Colon replaced with dash
    expect(url).toMatch(/^https:\/\/raw\.githubusercontent\.com\//);
  });

  it("should handle skillId without vendor prefix", () => {
    const url = buildSkillContentUrl("some-org/some-repo", "my-custom-skill");

    expect(url).toContain("some-org/some-repo");
    expect(url).toContain("my-custom-skill");
    expect(url).toMatch(/^https:\/\/raw\.githubusercontent\.com\//);
  });

  it("should build URL ending with /SKILL.md", () => {
    const url = buildSkillContentUrl("vercel-labs/agent-skills", "vercel-react-best-practices");

    expect(url).toMatch(/\/SKILL\.md$/);
  });

  it("should strip google- prefix", () => {
    const url = buildSkillContentUrl("some-org/repo", "google-some-skill");

    expect(url).toContain("some-skill");
  });

  it("should strip microsoft- prefix", () => {
    const url = buildSkillContentUrl("some-org/repo", "microsoft-azure-skill");

    expect(url).toContain("azure-skill");
  });

  it("should strip aws- prefix", () => {
    const url = buildSkillContentUrl("some-org/repo", "aws-lambda-skill");

    expect(url).toContain("lambda-skill");
  });
});

describe("SKILLS_SH_SEARCH_URL", () => {
  it("should be the correct skills.sh API endpoint", () => {
    expect(SKILLS_SH_SEARCH_URL).toBe("https://skills.sh/api/search");
  });
});

// ── Mock db.ts ────────────────────────────────────────────────────────────
const { mockGetSkillBySource, mockSaveSkill, mockGetActiveSkills, mockGetSkillsWithUrlPattern } = vi.hoisted(() => ({
  mockGetSkillBySource: vi.fn(),
  mockSaveSkill: vi.fn(),
  mockGetActiveSkills: vi.fn(),
  mockGetSkillsWithUrlPattern: vi.fn(),
}));
vi.mock("./db", () => ({
  getSkillBySource: mockGetSkillBySource,
  saveSkill: mockSaveSkill,
  getActiveSkills: mockGetActiveSkills,
  getSkillsWithUrlPattern: mockGetSkillsWithUrlPattern,
}));

// ── searchSkills tests ───────────────────────────────────────────────────

describe("searchSkills", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("should call skills.sh API with correct URL", async () => {
    mockFetch.mockResolvedValue({
      data: JSON.stringify({
        skills: [
          {
            skillId: "react-best-practices",
            name: "React Best Practices",
            source: "vercel/next.js",
            installs: 150,
            id: "abc",
            description: ""
          }
        ]
      })
    });

    const results = await searchSkills("react");

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("skills.sh/api/search?q=react&limit=20")
    );
    expect(results).toHaveLength(1);
    expect(results[0].skillId).toBe("react-best-practices");
    expect(results[0].name).toBe("React Best Practices");
    expect(results[0].source).toBe("vercel/next.js");
    expect(results[0].installs).toBe(150);
  });

  it("should return empty array on network failure (not throw)", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));

    const results = await searchSkills("react");

    expect(results).toEqual([]);
  });

  it("should handle data as already-parsed object", async () => {
    mockFetch.mockResolvedValue({
      data: {
        skills: [
          {
            skillId: "ts-patterns",
            name: "TypeScript Patterns",
            source: "microsoft/ts-skills",
            installs: 42,
            id: "def",
            description: "TS patterns"
          }
        ]
      }
    });

    const results = await searchSkills("typescript");

    expect(results).toHaveLength(1);
    expect(results[0].skillId).toBe("ts-patterns");
  });

  it("should return empty array when skills key is missing", async () => {
    mockFetch.mockResolvedValue({
      data: JSON.stringify({})
    });

    const results = await searchSkills("missing");

    expect(results).toEqual([]);
  });
});

// ── fetchTrendingSkills tests ────────────────────────────────────────────

describe("fetchTrendingSkills", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("should call trending API endpoint", async () => {
    mockFetch.mockResolvedValue({
      data: JSON.stringify({ skills: [] })
    });

    await fetchTrendingSkills();

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("skills.sh/api/skills/trending/0")
    );
  });

  it("should return empty array on failure", async () => {
    mockFetch.mockRejectedValue(new Error("Timeout"));

    const results = await fetchTrendingSkills();

    expect(results).toEqual([]);
  });
});

// ── fetchSkillContent tests ──────────────────────────────────────────────

describe("fetchSkillContent", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("should return raw markdown string", async () => {
    mockFetch.mockResolvedValue({
      data: "# React Skill\nContent here"
    });

    const content = await fetchSkillContent("vercel/next.js", "react-best-practices");

    expect(content).toBe("# React Skill\nContent here");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("raw.githubusercontent.com")
    );
  });

  it("should convert non-string data to string", async () => {
    mockFetch.mockResolvedValue({
      data: 12345
    });

    const content = await fetchSkillContent("org/repo", "some-skill");

    expect(content).toBe("12345");
  });
});

// ── installSkill tests ───────────────────────────────────────────────────

describe("installSkill", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockGetSkillBySource.mockReset();
    mockSaveSkill.mockReset();
  });

  it("should save skill when not already installed", async () => {
    mockGetSkillBySource.mockResolvedValue(null);
    mockSaveSkill.mockResolvedValue("new-uuid");

    const result = await installSkill({
      skillId: "react-best-practices",
      name: "React Best Practices",
      source: "vercel/next.js",
      description: "Best practices",
      content: "# Content"
    });

    expect(mockGetSkillBySource).toHaveBeenCalledWith("vercel/next.js", "react-best-practices");
    expect(mockSaveSkill).toHaveBeenCalledWith({
      name: "React Best Practices",
      description: "Best practices",
      content: "# Content",
      source: "vercel/next.js",
      source_id: "react-best-practices",
      is_active: 0
    });
    expect(result).toEqual({ installed: true, id: "new-uuid" });
  });

  it("should not save skill when already installed (duplicate detection)", async () => {
    mockGetSkillBySource.mockResolvedValue({
      id: "existing-id",
      name: "React Best Practices",
      description: "",
      content: "",
      source: "vercel/next.js",
      source_id: "react-best-practices",
      is_active: 0,
      created_at: "2024-01-01",
      updated_at: "2024-01-01"
    });

    const result = await installSkill({
      skillId: "react-best-practices",
      name: "React Best Practices",
      source: "vercel/next.js",
      description: "",
      content: "# Content"
    });

    expect(mockSaveSkill).not.toHaveBeenCalled();
    expect(result).toEqual({ installed: false, id: "existing-id" });
  });
});

// ── buildSkillInjection tests ────────────────────────────────────────────

describe("buildSkillInjection", () => {
  beforeEach(() => {
    mockGetActiveSkills.mockReset();
  });

  it("should return empty string when no active skills", async () => {
    mockGetActiveSkills.mockResolvedValue([]);

    const result = await buildSkillInjection();

    expect(result).toBe("");
  });

  it("should format single active skill with delimiters", async () => {
    mockGetActiveSkills.mockResolvedValue([
      { id: "1", name: "React Best Practices", content: "# React\nUse hooks.", description: "", source: null, source_id: null, is_active: 1, created_at: "", updated_at: "" },
    ]);

    const result = await buildSkillInjection();

    expect(result).toContain("--- SKILL: React Best Practices ---");
    expect(result).toContain("--- END SKILL ---");
    expect(result).toContain("# React\nUse hooks.");
  });

  it("should format multiple active skills with both names and content", async () => {
    mockGetActiveSkills.mockResolvedValue([
      { id: "1", name: "React", content: "React content", description: "", source: null, source_id: null, is_active: 1, created_at: "", updated_at: "" },
      { id: "2", name: "TypeScript", content: "TS content", description: "", source: null, source_id: null, is_active: 1, created_at: "", updated_at: "" },
    ]);

    const result = await buildSkillInjection();

    expect(result).toContain("--- SKILL: React ---");
    expect(result).toContain("React content");
    expect(result).toContain("--- SKILL: TypeScript ---");
    expect(result).toContain("TS content");
  });
});

// ── getSkillInjectionSize tests ──────────────────────────────────────────

describe("getSkillInjectionSize", () => {
  beforeEach(() => {
    mockGetActiveSkills.mockReset();
  });

  it("should return counts for active skills", async () => {
    mockGetActiveSkills.mockResolvedValue([
      { id: "1", name: "React", content: "React content", description: "", source: null, source_id: null, is_active: 1, created_at: "", updated_at: "" },
      { id: "2", name: "TypeScript", content: "TS content", description: "", source: null, source_id: null, is_active: 1, created_at: "", updated_at: "" },
    ]);

    const size = await getSkillInjectionSize();

    expect(size.skillCount).toBe(2);
    expect(size.charCount).toBeGreaterThan(0);
  });

  it("should return zeros when no skills active", async () => {
    mockGetActiveSkills.mockResolvedValue([]);

    const size = await getSkillInjectionSize();

    expect(size).toEqual({ charCount: 0, skillCount: 0 });
  });
});

// ── Site Profile Injection tests ───────────────────────────────────

function makeProfileSkill(overrides: Record<string, unknown> = {}) {
  return {
    id: 'skill-1', name: 'MOM Guide', description: '', content: 'MOM content',
    source: 'site-profile', source_id: 'myopenmath.com', is_active: 0,
    url_pattern: 'myopenmath.com',
    created_at: '2025-01-01', updated_at: '2025-01-01',
    ...overrides,
  };
}

describe('findMatchingProfiles', () => {
  it('returns profiles matching the URL', () => {
    const profiles = [makeProfileSkill()];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = findMatchingProfiles('https://www.myopenmath.com/course/123', profiles as any);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('MOM Guide');
  });

  it('returns empty array when URL does not match any profile', () => {
    const profiles = [makeProfileSkill()];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = findMatchingProfiles('https://canvas.instructure.com', profiles as any);
    expect(result).toHaveLength(0);
  });

  it('returns all matching profiles when multiple match', () => {
    const profiles = [
      makeProfileSkill({ name: 'MOM Guide', url_pattern: 'myopenmath.com' }),
      makeProfileSkill({ id: 'skill-2', name: 'Aeries Guide', url_pattern: 'aeries.net' }),
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = findMatchingProfiles('https://chicousd.aeries.net/teacher', profiles as any);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Aeries Guide');
  });

  it('is case-insensitive', () => {
    const profiles = [makeProfileSkill({ url_pattern: 'MyOpenMath.com' })];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = findMatchingProfiles('https://www.myopenmath.com', profiles as any);
    expect(result).toHaveLength(1);
  });
});

describe('getMatchingSkillsForUrl', () => {
  beforeEach(() => {
    mockGetSkillsWithUrlPattern.mockReset();
  });

  it('returns skills whose url_pattern matches the given URL', async () => {
    const mockSkills = [
      { id: '1', name: 'MOM Skill', url_pattern: 'myopenmath.com', is_active: 1, content: '', description: '', source: null, source_id: null, created_at: '', updated_at: '' },
      { id: '2', name: 'Aeries Skill', url_pattern: 'aeries.com', is_active: 1, content: '', description: '', source: null, source_id: null, created_at: '', updated_at: '' },
      { id: '3', name: 'No Pattern', url_pattern: '', is_active: 1, content: '', description: '', source: null, source_id: null, created_at: '', updated_at: '' },
    ];
    mockGetSkillsWithUrlPattern.mockResolvedValue(mockSkills);

    const result = await getMatchingSkillsForUrl('https://myopenmath.com/course/view.php');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('MOM Skill');
  });

  it('returns empty array when no patterns match', async () => {
    mockGetSkillsWithUrlPattern.mockResolvedValue([]);
    const result = await getMatchingSkillsForUrl('https://unknown.example.com');
    expect(result).toHaveLength(0);
  });

  it('handles comma-separated url_pattern', async () => {
    const mockSkills = [
      { id: '1', name: 'Multi', url_pattern: 'aeries.net,aeries.com,powerschool.com', is_active: 1, content: '', description: '', source: null, source_id: null, created_at: '', updated_at: '' },
    ];
    mockGetSkillsWithUrlPattern.mockResolvedValue(mockSkills);

    const result = await getMatchingSkillsForUrl('https://mydistrict.aeries.net/gradebook');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Multi');
  });

  it('returns empty array on error for unknown URLs', async () => {
    mockGetSkillsWithUrlPattern.mockRejectedValue(new Error('DB error'));
    const result = await getMatchingSkillsForUrl('https://unknown-site-xyz.example.com');
    expect(result).toHaveLength(0);
  });
});

describe('buildSiteContextInjection', () => {
  beforeEach(() => {
    mockGetSkillsWithUrlPattern.mockReset();
  });

  function extractGuideJson(injection: string): Record<string, unknown> {
    const match = injection.match(/--- SITE GUIDE \(JSON\):[^\n]*---\n([\s\S]*?)\n--- END SITE GUIDE ---/);
    expect(match?.[1]).toBeTruthy();
    return JSON.parse(match![1]);
  }

  it('returns empty string when no profiles match URL', async () => {
    mockGetSkillsWithUrlPattern.mockResolvedValue([makeProfileSkill()]);
    const result = await buildSiteContextInjection('https://canvas.instructure.com');
    expect(result).toBe('');
  });

  it('returns JSON SITE GUIDE block when profile matches URL', async () => {
    const markdown = [
      '---',
      'name: "MOM Guide"',
      'baseUrl: "https://www.myopenmath.com"',
      'role: "teacher"',
      'urlPatterns:',
      '  - "myopenmath.com"',
      '---',
      '# MyOpenMath — Agent Navigation Guide',
      '## Selectors',
      '| Assignment link | `a[href*="assess2"]` |',
      '## Navigation',
      '- `https://www.myopenmath.com/course/123`',
      '## Gotchas & Tips',
      '- Use teacher account',
    ].join('\n');

    mockGetSkillsWithUrlPattern.mockResolvedValue([makeProfileSkill({ content: markdown })]);
    const result = await buildSiteContextInjection('https://www.myopenmath.com/course/123');
    expect(result).toContain('--- SITE GUIDE (JSON):');
    expect(result).toContain('--- END SITE GUIDE ---');

    const parsed = extractGuideJson(result);
    expect(parsed).toHaveProperty('site');
    expect(parsed).toHaveProperty('baseUrl');
    expect(parsed).toHaveProperty('role');
    expect(parsed).toHaveProperty('urlPatterns');
    expect(parsed).toHaveProperty('selectors');
    expect(parsed).toHaveProperty('navigation');
    expect(parsed).toHaveProperty('workflows');
    expect(parsed).toHaveProperty('gotchas');
    expect(parsed.site).toBe('MOM Guide');
  });

  it('uses selectBestProfile behavior and emits only one matching profile', async () => {
    const generic = makeProfileSkill({
      id: 'skill-generic',
      name: 'Generic Guide',
      url_pattern: 'myopenmath.com',
      content: '---\nname: "Generic Guide"\n---\n# Generic',
    });
    const specific = makeProfileSkill({
      id: 'skill-specific',
      name: 'Specific Guide',
      url_pattern: 'myopenmath.com/course',
      content: '---\nname: "Specific Guide"\n---\n# Specific',
    });

    mockGetSkillsWithUrlPattern.mockResolvedValue([generic, specific]);

    const result = await buildSiteContextInjection('https://www.myopenmath.com/course/123');
    expect(result).toContain('--- SITE GUIDE (JSON): Specific Guide ---');
    expect(result).not.toContain('Generic Guide');
  });

  it('falls back to markdown SITE GUIDE format when JSON conversion fails', async () => {
    const converterSpy = vi.spyOn(profileJsonConverter, 'convertProfileToJSON').mockImplementation(() => {
      throw new Error('converter failed');
    });

    mockGetSkillsWithUrlPattern.mockResolvedValue([makeProfileSkill()]);

    const result = await buildSiteContextInjection('https://www.myopenmath.com/course/123');
    expect(result).toContain('--- SITE GUIDE: MOM Guide ---');
    expect(result).toContain('MOM content');
    expect(result).toContain('--- END SITE GUIDE ---');

    converterSpy.mockRestore();
  });

  it('produces smaller JSON injection than verbose markdown profile', async () => {
    const verboseMarkdown = [
      '---',
      'name: "MOM Verbose Guide"',
      'baseUrl: "https://www.myopenmath.com"',
      'role: "teacher"',
      'urlPatterns:',
      '  - "myopenmath.com"',
      '---',
      '# MyOpenMath Agent Navigation Guide',
      '## Selectors',
      '| Student table row | `table tr[data-student-id]` | use this row selector repeatedly for grading and review contexts |',
      '| Open score input | `input[name="score"]` | repeated selector docs repeated selector docs repeated selector docs |',
      '## Navigation',
      '- `https://www.myopenmath.com/course/123`',
      '- `/assess2/teacher/gb-view.php?cid={cid}`',
      '## Grade workflow',
      '1. Open gradebook page and review assignment list before making edits.',
      '2. Open student detail view and inspect uploaded work artifacts and rubric hints.',
      '3. Apply scores carefully and verify totals across all affected rows before save.',
      '## Gotchas & Tips',
      '- Never overwrite teacher comments without explicit confirmation.',
      '- Save every few records to avoid session timeout and stale state writes.',
      '- Re-check selector targets after navigation because IDs can shift by context.',
      'Additional narrative: '.repeat(80),
    ].join('\n');

    const best = makeProfileSkill({ name: 'MOM Verbose Guide', content: verboseMarkdown });
    mockGetSkillsWithUrlPattern.mockResolvedValue([best]);

    const output = await buildSiteContextInjection('https://www.myopenmath.com/course/123');
    expect(output.length).toBeLessThan(best.content.length);
  });

  it('JSON injection contains all required SiteGuideJSON keys', async () => {
    const markdown = [
      '---',
      'name: "MOM Guide"',
      'baseUrl: "https://www.myopenmath.com"',
      'role: "teacher"',
      'urlPatterns:',
      '  - "myopenmath.com"',
      '---',
      '# MyOpenMath — Agent Navigation Guide',
      '## Selectors',
      '| Assignment link | `a[href*="assess2"]` |',
      '## Navigation',
      '- `https://www.myopenmath.com/course/123`',
      '## Workflows',
      '1. Open gradebook',
      '## Gotchas & Tips',
      '- Use teacher account',
    ].join('\n');

    mockGetSkillsWithUrlPattern.mockResolvedValue([makeProfileSkill({ content: markdown })]);
    const result = await buildSiteContextInjection('https://www.myopenmath.com/course/123');

    const match = result.match(/--- SITE GUIDE \(JSON\):[^\n]*---\n([\s\S]*?)\n--- END SITE GUIDE ---/);
    expect(match?.[1]).toBeTruthy();
    const guide = JSON.parse(match![1]);

    expect(guide).toHaveProperty('site');
    expect(guide).toHaveProperty('baseUrl');
    expect(guide).toHaveProperty('selectors');
    expect(guide).toHaveProperty('navigation');
    expect(guide).toHaveProperty('workflows');
    expect(guide).toHaveProperty('gotchas');
  });

  it('JSON injection is smaller than raw markdown content', async () => {
    const markdown = [
      '---',
      'name: "MOM Guide"',
      'baseUrl: "https://www.myopenmath.com"',
      'role: "teacher"',
      'urlPatterns:',
      '  - "myopenmath.com"',
      '---',
      '# MyOpenMath — Agent Navigation Guide',
      '## Selectors',
      '| Assignment link | `a[href*="assess2"]` | This is a detailed explanation of how to use this selector in various contexts |',
      '## Navigation',
      '- `https://www.myopenmath.com/course/123`',
      '- `/assess2/teacher/gb-view.php?cid={cid}`',
      '## Workflows',
      '1. Open gradebook and review all assignments before making changes',
      '## Gotchas & Tips',
      '- Use teacher account for all operations',
      '- Save frequently to avoid session timeout',
    ].join('\n');

    const profile = makeProfileSkill({ content: markdown });
    mockGetSkillsWithUrlPattern.mockResolvedValue([profile]);

    const result = await buildSiteContextInjection('https://www.myopenmath.com/course/123');
    expect(result.length).toBeLessThan(profile.content.length);
  });
});

// ── syncSiteProfiles tests ─────────────────────────────────────────────

const MOM_MD = '---\nname: "MyOpenMath \u2014 Knowledge Profile"\ndescription: "MOM guide"\nurlPatterns:\n  - "myopenmath.com"\n---\n# MOM Content';
const AERIES_MD = '---\nname: "Aeries \u2014 Knowledge Profile"\ndescription: "Aeries guide"\nurlPatterns:\n  - "aeries.net"\n---\n# Aeries Content';

describe('syncSiteProfiles', () => {
  beforeEach(() => {
    mockGetSkillBySource.mockReset();
    mockSaveSkill.mockReset();
  });

  it('imports both profiles when neither exists', async () => {
    mockGetSkillBySource.mockResolvedValue(null);
    mockSaveSkill.mockResolvedValue('new-id');

    const result = await syncSiteProfiles([MOM_MD, AERIES_MD]);

    expect(result).toEqual({ imported: 2, updated: 0 });
    expect(mockSaveSkill).toHaveBeenCalledTimes(2);
    expect(mockSaveSkill).toHaveBeenCalledWith(expect.objectContaining({
      source: 'site-profile',
      source_id: 'myopenmath.com',
      url_pattern: 'myopenmath.com',
      is_active: 0,
    }));
  });

  it('updates existing profiles to keep content fresh', async () => {
    const existingMom = { id: 'mom-id', is_active: 0, name: 'old', description: '', content: '', source: 'site-profile', source_id: 'myopenmath.com', url_pattern: 'myopenmath.com', created_at: '', updated_at: '' };
    const existingAeries = { id: 'aeries-id', is_active: 1, name: 'old', description: '', content: '', source: 'site-profile', source_id: 'aeries.net', url_pattern: 'aeries.net', created_at: '', updated_at: '' };
    mockGetSkillBySource
      .mockResolvedValueOnce(existingMom)
      .mockResolvedValueOnce(existingAeries);
    mockSaveSkill.mockResolvedValue('id');

    const result = await syncSiteProfiles([MOM_MD, AERIES_MD]);

    expect(result).toEqual({ imported: 0, updated: 2 });
    expect(mockSaveSkill).toHaveBeenCalledWith(expect.objectContaining({ id: 'mom-id' }));
    expect(mockSaveSkill).toHaveBeenCalledWith(expect.objectContaining({ id: 'aeries-id' }));
  });

  it('preserves is_active state when updating existing profile', async () => {
    const existing = { id: 'eid', is_active: 1, name: 'MOM', description: '', content: '', source: 'site-profile', source_id: 'myopenmath.com', url_pattern: 'myopenmath.com', created_at: '', updated_at: '' };
    mockGetSkillBySource.mockResolvedValue(existing);
    mockSaveSkill.mockResolvedValue('eid');

    await syncSiteProfiles([MOM_MD]);

    expect(mockSaveSkill).toHaveBeenCalledWith(expect.objectContaining({ is_active: 1 }));
  });

  it('skips profiles without urlPatterns', async () => {
    const noPatterns = '---\nname: "No URL"\ndescription: "test"\n---\n# Content';

    const result = await syncSiteProfiles([noPatterns]);

    expect(result).toEqual({ imported: 0, updated: 0 });
    expect(mockSaveSkill).not.toHaveBeenCalled();
  });

  it('BUNDLED_PROFILES exports two profiles', () => {
    expect(BUNDLED_PROFILES).toHaveLength(2);
    expect(BUNDLED_PROFILES[0]).toContain('myopenmath.com');
    expect(BUNDLED_PROFILES[1]).toContain('aeries.net');
  });
});

// ── AGENT_SYSTEM_PROMPT tests ─────────────────────────────────────────────

describe('AGENT_SYSTEM_PROMPT', () => {
  it('references JSON site guide format in rule 11', () => {
    expect(AGENT_SYSTEM_PROMPT).toContain('SITE GUIDE (JSON)');
  });

  it('instructs agent to parse JSON as structured data', () => {
    expect(AGENT_SYSTEM_PROMPT).toContain('parse it as structured JSON');
  });

  it('does not reference old SELECTOR TRANSLATION format', () => {
    expect(AGENT_SYSTEM_PROMPT).not.toContain('SELECTOR TRANSLATION');
  });

  it('includes rule 11 for site guide priority', () => {
    expect(AGENT_SYSTEM_PROMPT).toContain('11. SITE GUIDE PRIORITY');
  });

  it('instructs agent to use selectors object from JSON guide', () => {
    expect(AGENT_SYSTEM_PROMPT).toContain('Use the "selectors" object for selectors directly');
  });
});

describe('getMatchingSkillsForUrl error logging', () => {
  beforeEach(() => {
    mockGetSkillsWithUrlPattern.mockReset();
  });

  it('logs console.warn when DB query fails but still returns bundled profiles', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    
    // Make the DB mock throw
    mockGetSkillsWithUrlPattern.mockRejectedValueOnce(new Error('DB unavailable'));
    
    const result = await getMatchingSkillsForUrl('https://myopenmath.com/gradeallq2.php');
    
    // Should warn about the failure
    expect(warnSpy).toHaveBeenCalled();
    // But should still return bundled MOM profile (via substring match on 'myopenmath.com')
    expect(result.length).toBeGreaterThan(0);
    
    warnSpy.mockRestore();
  });

  it('returns empty array with warning when everything fails', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    
    const result = await getMatchingSkillsForUrl('https://unknown-site-xyz.example.com');
    
    // Unknown URL — no matches even with bundled profiles
    expect(result).toEqual([]);
    // No warning needed for no-match (only for errors)
    
    warnSpy.mockRestore();
  });
});
