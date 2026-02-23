# Skills.sh Content Fetch Evidence

## Working URL Pattern

**Pattern**: `https://raw.githubusercontent.com/{source}/main/skills/{normalizedSkillId}/SKILL.md`

## Tested Examples

### Example 1: Vercel React Best Practices
- **Source**: `vercel-labs/agent-skills`
- **API skillId**: `vercel-react-best-practices`
- **Normalized skillId**: `react-best-practices` (strips vendor prefix `vercel-`)
- **URL**: `https://raw.githubusercontent.com/vercel-labs/agent-skills/main/skills/react-best-practices/SKILL.md`
- **Status**: HTTP 200 ✓

### Example 2: Google Stitch Skills
- **Source**: `google-labs-code/stitch-skills`
- **API skillId**: `react:components`
- **Normalized skillId**: `react-components` (replaces `:` with `-`)
- **URL**: `https://raw.githubusercontent.com/google-labs-code/stitch-skills/main/skills/react-components/SKILL.md`
- **Status**: HTTP 200 ✓

## Skill ID Normalization Rules

1. **Vendor prefix stripping**: For skills from `vercel-labs/agent-skills` with skillId starting with `vercel-`, strip the prefix
   - `vercel-react-best-practices` → `react-best-practices`
   - `vercel-react-native-skills` → `react-native-skills`

2. **Colon replacement**: Replace `:` with `-` in skillIds
   - `react:components` → `react-components`

3. **General approach**: The skillId from the API may need transformation to match the actual directory name in the repo

## Repo Structure

All tested skills follow the structure:
```
{repo}/
  skills/
    {skill-directory}/
      SKILL.md       # Main skill content
      README.md      # Documentation
      metadata.json  # Skill metadata
      AGENTS.md      # Agent-specific instructions
      rules/         # Rule files
```

## Failed Patterns

The following patterns returned HTTP 404:
- `https://raw.githubusercontent.com/{source}/main/.claude/skills/{skillId}.md`
- `https://raw.githubusercontent.com/{source}/main/.claude/skills/{skillId}/SKILL.md`
- `https://raw.githubusercontent.com/{source}/main/skills/{skillId}/SKILL.md` (without normalization)
- `https://api.inference.sh/skills/{source}/{skillId}/content`
