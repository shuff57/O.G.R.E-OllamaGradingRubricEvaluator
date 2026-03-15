import matter from 'gray-matter';
import type { SiteGuideJSON } from './site-guide-types';

type FrontmatterData = {
  name?: string;
  description?: string;
  urlPatterns?: unknown;
  baseUrl?: string;
  role?: string;
};

const INLINE_CODE_REGEX = /`([^`\n]+)`/g;
const HEADING_REGEX = /^(#{2,6})\s+(.+)$/;
const ORDERED_STEP_REGEX = /^(\d+)\.\s+(.+)$/;
const BULLET_REGEX = /^[-*]\s+(.+)$/;

export function convertProfileToJSON(markdownContent: string): SiteGuideJSON {
  if (!markdownContent?.trim()) {
    return createEmptyGuide();
  }

  const { data, content } = safeParseMarkdown(markdownContent);

  return {
    site: extractSiteName(data, content),
    baseUrl: extractBaseUrl(data, content),
    role: extractRole(data, content),
    urlPatterns: extractUrlPatterns(data),
    selectors: extractSelectors(content),
    navigation: extractNavigation(content),
    workflows: extractWorkflows(content),
    gotchas: extractGotchas(content)
  };
}

function safeParseMarkdown(markdownContent: string): { data: FrontmatterData; content: string } {
  try {
    const parsed = matter(markdownContent);
    return {
      data: (parsed.data ?? {}) as FrontmatterData,
      content: parsed.content ?? ''
    };
  } catch {
    return {
      data: {},
      content: markdownContent
    };
  }
}

function createEmptyGuide(): SiteGuideJSON {
  return {
    site: '',
    baseUrl: '',
    role: '',
    urlPatterns: [],
    selectors: {},
    navigation: {},
    workflows: [],
    gotchas: []
  };
}

function extractSiteName(data: FrontmatterData, content: string): string {
  const fmName = typeof data.name === 'string' ? data.name.trim() : '';
  if (fmName) {
    return fmName.replace(/\s*[—-]\s*Knowledge Profile\s*$/i, '').trim();
  }

  const titleMatch = content.match(/^#\s+(.+)$/m);
  if (titleMatch?.[1]) {
    return titleMatch[1].trim().replace(/\s*[—-]\s*Agent Navigation Guide\s*$/i, '').trim();
  }

  const firstLine = content.split('\n').find((line) => line.trim().length > 0);
  return firstLine?.trim() ?? '';
}

function extractBaseUrl(data: FrontmatterData, content: string): string {
  if (typeof data.baseUrl === 'string' && data.baseUrl.trim()) {
    return data.baseUrl.trim();
  }

  const baseUrlLine = content.match(/\*\*Base URL(?: pattern)?\*\*:\s*`([^`]+)`/i);
  if (baseUrlLine?.[1]) {
    return baseUrlLine[1].trim();
  }

  const firstHttp = content.match(/https?:\/\/[^\s`)'"<>]+/i);
  return firstHttp?.[0] ?? '';
}

function extractRole(data: FrontmatterData, content: string): string {
  if (typeof data.role === 'string' && data.role.trim()) {
    return data.role.trim();
  }

  const roleLine = content.match(/\*\*Role\*\*:\s*([^\n]+)/i);
  if (roleLine?.[1]) {
    return cleanupText(roleLine[1]);
  }

  if (/\bas a teacher\b/i.test(content)) return 'teacher';
  if (/\bas an instructor\b/i.test(content)) return 'instructor';
  if (/\bteacher\b/i.test(content)) return 'teacher';
  if (/\binstructor\b/i.test(content)) return 'instructor';

  return '';
}

function extractUrlPatterns(data: FrontmatterData): string[] {
  if (Array.isArray(data.urlPatterns)) {
    return data.urlPatterns
      .filter((p): p is string => typeof p === 'string')
      .map((p) => p.trim())
      .filter(Boolean);
  }

  return [];
}

function extractSelectors(content: string): Record<string, string> {
  const selectors: Record<string, string> = {};
  const seen = new Set<string>();

  for (const line of content.split('\n')) {
    if (!line.includes('|') || !line.includes('`')) {
      continue;
    }

    const cells = line
      .split('|')
      .map((cell) => cell.trim())
      .filter(Boolean);

    if (cells.length < 2) continue;

    const description = cleanupText(cells[0]);
    const selectorsInLine = extractInlineCode(cells.join(' | ')).filter(isSelectorLike);

    for (const selector of selectorsInLine) {
      if (seen.has(selector)) continue;
      seen.add(selector);

      const keyBase = description || deriveSelectorKey(selector);
      const key = makeUniqueKey(selectors, keyBase);
      selectors[key] = selector;
    }
  }

  for (const code of extractInlineCode(content)) {
    if (!isSelectorLike(code) || seen.has(code)) {
      continue;
    }

    seen.add(code);
    const key = makeUniqueKey(selectors, deriveSelectorKey(code));
    selectors[key] = code;
  }

  return selectors;
}

function extractNavigation(content: string): Record<string, string> {
  const navigation: Record<string, string> = {};
  const seen = new Set<string>();

  const headingByLine = mapNearestHeading(content);
  const lines = content.split('\n');

  lines.forEach((line, idx) => {
    const candidates = [
      ...extractInlineCode(line).filter(isNavigationLike),
      ...extractUrlsFromText(line).filter(isNavigationLike)
    ];

    for (const candidate of candidates) {
      if (seen.has(candidate)) continue;
      seen.add(candidate);

      const heading = headingByLine[idx] || 'navigation';
      const keyBase = deriveNavigationKey(candidate, heading);
      const key = makeUniqueKey(navigation, keyBase);
      navigation[key] = candidate;
    }
  });

  return navigation;
}

function extractWorkflows(content: string): Array<{ name: string; steps: string[] }> {
  const workflows: Array<{ name: string; steps: string[] }> = [];
  const lines = content.split('\n');

  let currentHeading = 'Workflow';
  let currentSteps: string[] = [];
  let currentName = 'Workflow';

  const flushWorkflow = () => {
    if (currentSteps.length >= 2) {
      workflows.push({
        name: cleanupText(currentName) || 'Workflow',
        steps: [...currentSteps]
      });
    }
    currentSteps = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    const headingMatch = line.match(HEADING_REGEX);
    if (headingMatch) {
      flushWorkflow();
      currentHeading = cleanupText(headingMatch[2]);
      continue;
    }

    const stepMatch = line.match(ORDERED_STEP_REGEX);
    if (stepMatch) {
      const step = cleanupText(stepMatch[2]);
      if (!currentSteps.length) {
        currentName = currentHeading;
      }
      if (step) currentSteps.push(step);
      continue;
    }

    if (currentSteps.length && line.length === 0) {
      continue;
    }

    if (currentSteps.length && !line.match(ORDERED_STEP_REGEX)) {
      flushWorkflow();
    }
  }

  flushWorkflow();
  return workflows;
}

function extractGotchas(content: string): string[] {
  const lines = content.split('\n');
  const gotchas: string[] = [];

  let inGotchaSection = false;
  for (const rawLine of lines) {
    const line = rawLine.trim();

    const headingMatch = line.match(HEADING_REGEX);
    if (headingMatch) {
      const headingText = headingMatch[2].toLowerCase();
      inGotchaSection = /tips|gotchas/.test(headingText);
      continue;
    }

    if (!inGotchaSection) continue;

    const bulletMatch = line.match(BULLET_REGEX);
    if (bulletMatch?.[1]) {
      const cleaned = cleanupText(bulletMatch[1]);
      if (cleaned) gotchas.push(cleaned);
    }
  }

  return dedupe(gotchas);
}

function extractInlineCode(text: string): string[] {
  return [...text.matchAll(INLINE_CODE_REGEX)]
    .map((match) => (match[1] ?? '').trim())
    .filter(Boolean);
}

function extractUrlsFromText(text: string): string[] {
  const values = text.match(/https?:\/\/[^\s`)'"<>]+|\/[A-Za-z0-9._~\-{}]+(?:\/[A-Za-z0-9._~\-{}]+)*(?:\?[A-Za-z0-9._~\-{}=&]+)?/g);
  return values ?? [];
}

function isSelectorLike(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (/^role=/.test(v)) return false;

  return /^(#|\.|input\b|button\b|select\b|table\b|nav\b|div\b|span\b|a\[|\[data-|\[aria-|\[id|\[type|td\[|th\[)/i.test(v);
}

function isNavigationLike(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (/^\/$/.test(v)) return true;
  if (/^https?:\/\//i.test(v)) return true;
  if (!v.startsWith('/')) return false;
  return /(\.php|\.aspx|\?|\{.+\}|\/teacher|\/course|\/assess2)/i.test(v);
}

function mapNearestHeading(content: string): Record<number, string> {
  const lines = content.split('\n');
  const map: Record<number, string> = {};
  let currentHeading = 'navigation';

  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].trim().match(HEADING_REGEX);
    if (match?.[2]) {
      currentHeading = cleanupText(match[2]);
    }
    map[i] = currentHeading;
  }

  return map;
}

function deriveSelectorKey(selector: string): string {
  const simplified = selector
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();

  const words = simplified.split(/\s+/).filter(Boolean).slice(0, 4);
  return words.join('_') || 'selector';
}

function deriveNavigationKey(url: string, heading: string): string {
  if (/^https?:\/\//i.test(url)) {
    try {
      const parsed = new URL(url);
      if (parsed.pathname === '/' || !parsed.pathname) {
        return makeKey(`${heading} home`);
      }

      const segment = parsed.pathname
        .split('/')
        .filter(Boolean)
        .pop();
      return makeKey(`${heading} ${segment ?? 'url'}`);
    } catch {
      return makeKey(`${heading} url`);
    }
  }

  if (url === '/') {
    return makeKey(`${heading} home`);
  }

  const tail = url
    .split('?')[0]
    .split('/')
    .filter(Boolean)
    .pop();

  return makeKey(`${heading} ${tail ?? 'path'}`);
}

function makeUniqueKey(record: Record<string, string>, keyBase: string): string {
  const base = makeKey(keyBase) || 'entry';
  if (!(base in record)) return base;

  let idx = 2;
  while (`${base}_${idx}` in record) {
    idx += 1;
  }

  return `${base}_${idx}`;
}

function makeKey(value: string): string {
  return cleanupText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function cleanupText(value: string): string {
  return value
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}
