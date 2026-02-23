import { describe, it, expect } from 'vitest';
import { parseSkillMarkdown, renderSkillPreview, type ParsedSkill } from './skill-parser';

// ── Tests: parseSkillMarkdown ─────────────────────────────────────────────

describe('parseSkillMarkdown', () => {
  // ── With YAML frontmatter ─────────────────────────────────────────────

  it('extracts name, description, author, tags from YAML frontmatter', () => {
    const raw = `---
name: My Awesome Skill
description: This skill does amazing things
author: John Doe
tags:
  - productivity
  - automation
---

# My Awesome Skill

This is the body content of the skill.
It can have multiple paragraphs.

## Features
- Feature 1
- Feature 2
`;

    const result = parseSkillMarkdown(raw);

    expect(result.name).toBe('My Awesome Skill');
    expect(result.description).toBe('This skill does amazing things');
    expect(result.author).toBe('John Doe');
    expect(result.tags).toEqual(['productivity', 'automation']);
    expect(result.content).toBe(raw); // content is always the full raw content
  });

  it('handles frontmatter with only name and description', () => {
    const raw = `---
name: Simple Skill
description: A simple skill
---

Body content here.`;

    const result = parseSkillMarkdown(raw);

    expect(result.name).toBe('Simple Skill');
    expect(result.description).toBe('A simple skill');
    expect(result.author).toBeUndefined();
    expect(result.tags).toBeUndefined();
  });

  // ── Without frontmatter ───────────────────────────────────────────────

  it('uses first # heading as name when no frontmatter', () => {
    const raw = `# Skill From Heading

This is the first paragraph that becomes the description.

More content follows.`;

    const result = parseSkillMarkdown(raw);

    expect(result.name).toBe('Skill From Heading');
    expect(result.description).toBe('This is the first paragraph that becomes the description.');
  });

  it('uses first paragraph as description when no frontmatter', () => {
    const raw = `# Another Skill

The first paragraph is used as the description.
It can span multiple sentences.

Second paragraph is not part of description.`;

    const result = parseSkillMarkdown(raw);

    expect(result.name).toBe('Another Skill');
    expect(result.description).toBe('The first paragraph is used as the description. It can span multiple sentences.');
  });

  it('handles markdown with no heading (uses first line as name)', () => {
    const raw = `This is a skill without a heading.

The description comes from the first paragraph.`;

    const result = parseSkillMarkdown(raw);

    // When no heading, name should be empty or derived from first line
    expect(result.name).toBe('This is a skill without a heading.'); 
    expect(result.description).toContain('skill without a heading');
  });

  // ── Empty/blank content ───────────────────────────────────────────────

  it('returns empty name and description for empty content', () => {
    const result = parseSkillMarkdown('');

    expect(result.name).toBe('');
    expect(result.description).toBe('');
    expect(result.content).toBe('');
  });

  it('returns empty name and description for whitespace-only content', () => {
    const result = parseSkillMarkdown('   \n\n   \t\n   ');

    expect(result.name).toBe('');
    expect(result.description).toBe('');
  });

  it('handles content with only frontmatter but no body', () => {
    const raw = `---
name: Name Only
description: Desc only
---`;

    const result = parseSkillMarkdown(raw);

    expect(result.name).toBe('Name Only');
    expect(result.description).toBe('Desc only');
    expect(result.content).toBe(raw);
  });
});

// ── Tests: renderSkillPreview (XSS Prevention) ────────────────────────────

describe('renderSkillPreview', () => {
  it('renders basic markdown to HTML', async () => {
    const markdown = '# Hello\n\nThis is **bold** and *italic*.';
    const result = await renderSkillPreview(markdown);

    expect(result).toContain('<h1');
    expect(result).toContain('Hello');
    expect(result).toContain('<strong>bold</strong>');
    expect(result).toContain('<em>italic</em>');
  });

  // ── XSS Prevention: <script> tags ─────────────────────────────────────

  it('strips <script>alert("xss")</script> from output', async () => {
    const markdown = `# Safe Content

<script>alert('xss')</script>

This is safe.`;

    const result = await renderSkillPreview(markdown);

    expect(result).not.toContain('<script>');
    expect(result).not.toContain('</script>');
    expect(result).not.toContain('alert');
    expect(result).toContain('Safe Content');
  });

  it('strips script tags with attributes', async () => {
    const markdown = `<script type="text/javascript" src="evil.js"></script>

# Safe Heading`;

    const result = await renderSkillPreview(markdown);

    expect(result).not.toContain('<script');
    expect(result).not.toContain('</script>');
  });

  // ── XSS Prevention: on* event handlers ─────────────────────────────────

  it('strips onerror from img tags', async () => {
    const markdown = `![image](<img onerror="alert('xss')" src="x">)`;

    const result = await renderSkillPreview(markdown);

    expect(result).not.toContain('onerror');
  });

  it('strips onclick from any element', async () => {
    const markdown = `<div onclick="alert('xss')">Click me</div>`;

    const result = await renderSkillPreview(markdown);

    expect(result).not.toContain('onclick');
  });

  it('strips onload from elements', async () => {
    const markdown = `<img onload="alert('xss')" src="image.png">`;

    const result = await renderSkillPreview(markdown);

    expect(result).not.toContain('onload');
  });

  // ── XSS Prevention: javascript: hrefs ──────────────────────────────────

  it('strips javascript: href from links', async () => {
    const markdown = `[Click me](javascript:alert('xss'))`;

    const result = await renderSkillPreview(markdown);

    expect(result).not.toContain('javascript:');
    expect(result).not.toContain('alert');
  });

  it('strips javascript: href with spaces', async () => {
    const markdown = `[Evil link](javascript:alert('xss'))`;

    const result = await renderSkillPreview(markdown);

    expect(result.toLowerCase()).not.toContain('javascript:');
  });

  // ── XSS Prevention: iframe tags ───────────────────────────────────────

  it('strips iframe tags', async () => {
    const markdown = `<iframe src="evil.com"></iframe>

# Safe Content`;

    const result = await renderSkillPreview(markdown);

    expect(result).not.toContain('<iframe');
    expect(result).not.toContain('</iframe>');
  });

  // ── Combined attacks ──────────────────────────────────────────────────

  it('handles multiple XSS vectors in one document', async () => {
    const markdown = `# Safe Title

<script>evil()</script>

[Bad link](javascript:evil())

<img onerror="evil()" src="x">

<iframe src="evil.com"></iframe>

<div onclick="evil()">click</div>

Safe content here.`;

    const result = await renderSkillPreview(markdown);

    expect(result).not.toContain('<script');
    expect(result).not.toContain('javascript:');
    expect(result).not.toContain('onerror');
    expect(result).not.toContain('onclick');
    expect(result).not.toContain('<iframe');
    expect(result).toContain('Safe Title');
    expect(result).toContain('Safe content here');
  });

  // ── Safe content preserved ────────────────────────────────────────────

  it('preserves safe links with http/https', async () => {
    const markdown = '[Safe link](https://example.com)';

    const result = await renderSkillPreview(markdown);

    expect(result).toContain('href');
    expect(result).toContain('https://example.com');
  });

  it('preserves safe images', async () => {
    const markdown = '![Alt text](https://example.com/image.png)';

    const result = await renderSkillPreview(markdown);

    expect(result).toContain('img');
    expect(result).toContain('https://example.com/image.png');
  });
});
