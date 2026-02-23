import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock @tauri-apps/plugin-http ──────────────────────────────────────────
const { mockFetch } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-http", () => ({
  fetch: mockFetch,
}));

// Import AFTER mocks are set up
import { buildSkillContentUrl, SKILLS_SH_SEARCH_URL, searchSkills, fetchSkillContent, fetchTrendingSkills, installSkill, buildSkillInjection, getSkillInjectionSize } from "./skills-api";

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
const { mockGetSkillBySource, mockSaveSkill, mockGetActiveSkills } = vi.hoisted(() => ({
  mockGetSkillBySource: vi.fn(),
  mockSaveSkill: vi.fn(),
  mockGetActiveSkills: vi.fn(),
}));
vi.mock("./db", () => ({
  getSkillBySource: mockGetSkillBySource,
  saveSkill: mockSaveSkill,
  getActiveSkills: mockGetActiveSkills,
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
