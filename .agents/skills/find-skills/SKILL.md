---
name: find-skills
description: Use when discovering and installing agent skills from the open ecosystem via `npx skills` CLI — triggered by "how do I do X", "find a skill for X", "is there a skill that can...", or requests to extend capabilities.
---

# Find Skills

> This skill helps agents discover and install specialized skills from the open agent skills ecosystem using the `npx skills` CLI. It enables users to search for domain-specific workflows, tools, and knowledge packages, then install them to extend agent capabilities.

## Prerequisites
- Node.js and npm installed (for `npx skills` CLI)
- Internet connection to query skills.sh registry
- User permission to install skills globally or locally

## When to Use
- User asks "how do I do X" where X might have an existing skill
- User says "find a skill for X" or "is there a skill for X"
- User asks "can you help with X" where X is a specialized capability
- User expresses interest in extending agent capabilities
- User wants to search for tools, templates, or workflows
- User mentions needing help with a specific domain (design, testing, deployment, etc.)

## When NOT to Use
- User asks for immediate help with a task (use general capabilities first, then offer skill discovery)
- User is asking about a skill they already have installed
- Task is too simple to warrant a skill search

## Guardrails

> ⚠️ **Must NOT:**
> - Install skills without explicit user confirmation of the package name and source
> - Recommend skills from untrusted sources without verification
> - Assume a skill exists without running `npx skills find` first
> - Install skills globally (`-g`) without user approval
> - Present search results without explaining what each skill does

## Quick Start

```bash
# Search for skills by keyword
npx skills find [query]

# Example: find React performance skills
npx skills find react performance
```

Then present results to user with install command and link to skills.sh.

## Workflow

### Phase 1: Understand User Need
- **INPUT:** User request for help with a task or capability
- **ACTION:** Identify the domain (React, testing, design, etc.) and specific task
- **OUTPUT:** Clear understanding of what skill category to search for

### Phase 2: Search for Skills
- **INPUT:** Domain and task identified
- **ACTION:** Run `npx skills find [query]` with relevant keywords; parse results
- **OUTPUT:** List of matching skills with names, descriptions, and install commands

### Phase 3: Present Options
- **INPUT:** Search results from skills.sh
- **ACTION:** Format results with skill name, purpose, install command, and skills.sh link
- **OUTPUT:** User-friendly presentation of available skills

### Phase 4: Install (if approved)
- **INPUT:** User approval to install a specific skill
- **ACTION:** Run `npx skills add <owner/repo@skill>` with user confirmation
- **OUTPUT:** Skill installed and ready to use

## Error Handling

| Problem | Action |
|---------|--------|
| No skills found for query | Acknowledge, offer to help directly, suggest `npx skills init` for custom skill creation |
| Invalid package name | Ask user to confirm the exact skill name from skills.sh |
| Installation fails | Check npm/Node.js version, verify internet connection, retry with `-y` flag |
| Skill not found after install | Verify skill was installed with `npx skills list`, check skills.sh for updates |

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Running `npx skills` without a subcommand | Always use `npx skills find [query]` or `npx skills add <package>` |
| Installing without user confirmation | Always show the package name and ask for approval before running `npx skills add` |
| Recommending skills from untrusted sources | Only recommend skills from verified sources (vercel-labs, ComposioHQ, etc.) |
| Assuming a skill exists | Always search first with `npx skills find` before claiming a skill is available |

## CLI Reference

### Search for Skills
```bash
npx skills find [query]
```
Returns matching skills with install commands and links to skills.sh.

**Example queries:**
- `npx skills find react performance` — React optimization skills
- `npx skills find pr review` — Pull request review skills
- `npx skills find changelog` — Changelog generation skills

### Install a Skill
```bash
npx skills add <owner/repo@skill>
```
Installs a skill from GitHub or other sources.

**With flags:**
- `-g` — Install globally (user-level)
- `-y` — Skip confirmation prompts

**Example:**
```bash
npx skills add vercel-labs/agent-skills@vercel-react-best-practices -g -y
```

### List Installed Skills
```bash
npx skills list
```
Shows all installed skills and their versions.

### Check for Updates
```bash
npx skills check
```
Checks for available skill updates.

### Update All Skills
```bash
npx skills update
```
Updates all installed skills to latest versions.

## Common Skill Categories

When searching, consider these common categories:

| Category | Example Queries |
|----------|-----------------|
| Web Development | react, nextjs, typescript, css, tailwind |
| Testing | testing, jest, playwright, e2e |
| DevOps | deploy, docker, kubernetes, ci-cd |
| Documentation | docs, readme, changelog, api-docs |
| Code Quality | review, lint, refactor, best-practices |
| Design | ui, ux, design-system, accessibility |
| Productivity | workflow, automation, git |

## Tips for Effective Searches

1. **Use specific keywords** — "react testing" is better than just "testing"
2. **Try alternative terms** — If "deploy" doesn't work, try "deployment" or "ci-cd"
3. **Check popular sources** — Many skills come from `vercel-labs/agent-skills` or `ComposioHQ/awesome-claude-skills`
4. **Browse skills.sh** — Visit https://skills.sh/ to browse all available skills

## When No Skills Are Found

If no relevant skills exist:

1. Acknowledge that no existing skill was found
2. Offer to help with the task directly using general capabilities
3. Suggest the user could create their own skill with `npx skills init`

**Example response:**
```
I searched for skills related to "xyz" but didn't find any matches.
I can still help you with this task directly! Would you like me to proceed?

If this is something you do often, you could create your own skill:
npx skills init my-xyz-skill
```

## State Management

No persistent state required. Each search is independent. Results are presented to user for approval before any installation occurs.

## References

- **Skills Registry:** https://skills.sh/
- **Skills CLI Docs:** https://github.com/skills/cli
- **Popular Sources:** 
  - vercel-labs/agent-skills
  - ComposioHQ/awesome-claude-skills
