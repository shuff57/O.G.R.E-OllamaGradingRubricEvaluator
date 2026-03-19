import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock dependencies ────────────────────────────────────────────────────

const { mockFetch } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
}));

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetch as typeof fetch);
});

const { mockGetSkillBySource, mockSaveSkill } = vi.hoisted(() => ({
  mockGetSkillBySource: vi.fn(),
  mockSaveSkill: vi.fn(),
}));

vi.mock("../../../lib/db", () => ({
  getSkillBySource: mockGetSkillBySource,
  saveSkill: mockSaveSkill,
}));

import { installSkill } from "../../../lib/skills-api";

// ── Tests ────────────────────────────────────────────────────────────────

describe("SkillSearch install logic", () => {
  beforeEach(() => {
    mockGetSkillBySource.mockReset();
    mockSaveSkill.mockReset();
  });

  it("should call getSkillBySource first, then saveSkill for new skill", async () => {
    mockGetSkillBySource.mockResolvedValue(null);
    mockSaveSkill.mockResolvedValue("new-uuid");

    const result = await installSkill({
      skillId: "react-best-practices",
      name: "React Best Practices",
      source: "vercel/next.js",
      description: "Best practices",
      content: "# Content",
    });

    // Verify call order: getSkillBySource called before saveSkill
    expect(mockGetSkillBySource).toHaveBeenCalledTimes(1);
    expect(mockGetSkillBySource).toHaveBeenCalledWith(
      "vercel/next.js",
      "react-best-practices"
    );
    expect(mockSaveSkill).toHaveBeenCalledTimes(1);
    expect(result.installed).toBe(true);
    expect(result.id).toBe("new-uuid");
  });

  it("should prevent double-install when skill already exists", async () => {
    mockGetSkillBySource.mockResolvedValue({
      id: "existing-id",
      name: "React Best Practices",
      description: "",
      content: "",
      source: "vercel/next.js",
      source_id: "react-best-practices",
      is_active: 0,
      created_at: "2024-01-01",
      updated_at: "2024-01-01",
    });

    const result = await installSkill({
      skillId: "react-best-practices",
      name: "React Best Practices",
      source: "vercel/next.js",
      description: "",
      content: "# Content",
    });

    expect(mockGetSkillBySource).toHaveBeenCalledTimes(1);
    expect(mockSaveSkill).not.toHaveBeenCalled();
    expect(result.installed).toBe(false);
    expect(result.id).toBe("existing-id");
  });
});
