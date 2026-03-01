# MyOpenMath Question Patterns Library

> **Auto-populated by `mom-fact-finder`**. Load via `load_skills=["mom-patterns"]` to access discovered patterns.
> Do NOT edit manually — use `mom-fact-finder` with `refresh=true` to update a topic.

**Last Updated**: (none)  
**Total Entries**: 0  
**Line Count**: ~70 (cap: 800)

---

## How This File Works

1. **Loaded by question-writing skills** via `load_skills=["mom-patterns"]` to get real-world examples before writing.
2. **Updated by `mom-fact-finder`** after each browser search session.
3. **Library-first**: `mom-fact-finder` checks here before launching the browser — if a topic exists and `refresh=false`, it returns the cached pattern.
4. **Size-capped at 800 lines**: When adding a new entry would exceed the cap, the oldest/least-used section is compressed to a 3-line summary first.

---

## Size Policy

- **Hard cap**: 800 lines total. Per-section max: 150 lines.
- **Compression**: Oldest sections (by "Added" date) get condensed to a 3-line summary when cap is approached.
- **Format**: `## [Topic] (summarized)` / metadata line / key insight sentence / `---`

## Entry Format Template

Each pattern entry MUST follow this exact structure:

```markdown
## [Topic Name]
**Added**: YYYY-MM-DD | **Sources**: QID #1234, #5678, #9012 | **Times Used (max)**: 6591
**Question Types**: essay, multipart | **Libraries**: `datasummary`, `stats`

### Key Patterns
- [Pattern bullet 1 — what these questions do that mom-frq doesn't document]
- [Pattern bullet 2]
- [Pattern bullet 3]
- [Pattern bullet 4 — optional]
- [Pattern bullet 5 — optional]

### Best Code Example (QID #1234, N uses)
\`\`\`php
[Best single code example, truncated to 80 lines for control, 40 lines for qtext]
\`\`\`

### Extracted Function Calls
- `loadlibrary('name')` — description of what it provides
- [other functions found]

---
```


## Topic Index

*(empty — populated as patterns are discovered)*

---

<!-- PATTERNS -->

<!-- TEMPLATE - REPLACE WITH REAL DATA -->
## Hypothesis Testing FRQ (TEMPLATE)
**Added**: 0000-00-00 | **Sources**: QID #00000, #00001 | **Times Used (max)**: 0
**Question Types**: essay | **Libraries**: `stats`

### Key Patterns
- Uses `loadlibrary('datasummary')` to provide sample statistics for the prompt
- `$displayformat[0]="editornopaste"` prevents copy-paste to enforce original writing
- Rubric uses `$scoremethod[0]="essayrubric"` with explicit point breakdown in qtext
- Question text includes a data table rendered via HTML in `$qtext`

### Best Code Example (QID #00000, 0 uses)
```php
// TEMPLATE PLACEHOLDER — replace with real extracted code
```

### Extracted Function Calls
- `loadlibrary('stats')` — statistical functions (mean, sd, norm tables)

---
<!-- END TEMPLATE -->
