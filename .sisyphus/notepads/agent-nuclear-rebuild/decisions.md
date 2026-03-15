# Decisions — agent-nuclear-rebuild

## [2026-03-15] Architecture decisions from plan
- Skills location: `.agents/skills/{name}/SKILL.md` (tool-agnostic)
- CLAUDE.md at project ROOT (not .claude/), ≤200 lines
- AGENTS.md at project ROOT, ≤150 lines
- Memory at `.agents/memory/` with LightRAG + Ollama
- Archive FIRST (T1), then design gold standard (T2), then demolish (T3)
- Wave 6 (T22-T23) involves user interaction — ask before deleting global skills
- Worktree: NOT needed for this plan (markdown-only infrastructure, working in main)
