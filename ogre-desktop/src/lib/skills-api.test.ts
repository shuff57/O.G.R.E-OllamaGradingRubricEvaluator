import { describe, it, expect, vi } from "vitest";

// ── Mock @tauri-apps/plugin-http ──────────────────────────────────────────
const { mockFetch } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-http", () => ({
  fetch: mockFetch,
}));

// Import AFTER mocks are set up
import { buildSkillContentUrl, SKILLS_SH_SEARCH_URL } from "./skills-api";

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
