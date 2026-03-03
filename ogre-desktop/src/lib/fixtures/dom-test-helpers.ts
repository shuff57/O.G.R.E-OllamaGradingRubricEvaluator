// @vitest-environment jsdom
/**
 * dom-test-helpers.ts - Utilities for loading fixture HTML in jsdom tests
 *
 * Provides:
 *  - loadFixture()     — load a fixture HTML file into jsdom document
 *  - queryAll()        — querySelectorAll wrapper returning typed array
 *  - countElements()   — count matching elements
 *  - getTextOf()       — get trimmed text of first matching element
 *  - hasDataAttr()     — check if any element has a specific data attribute
 */

import { readFileSync } from 'fs';
import { join } from 'path';

/** Absolute path to the fixtures directory */
const FIXTURES_DIR = join(__dirname, '.');

/**
 * Load a fixture HTML file into the jsdom document.
 *
 * @param filename   Filename relative to tests/fixtures/ (e.g. 'simple-batch.html')
 * @param targetDoc  Document to populate (defaults to global `document`)
 */
export function loadFixture(filename: string, targetDoc: Document = document): void {
  const htmlPath = join(FIXTURES_DIR, filename);
  const html = readFileSync(htmlPath, 'utf-8');

  // Extract just the body content to avoid doctype / html tag conflicts
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);

  if (headMatch) {
    targetDoc.head.innerHTML = headMatch[1];
  }
  if (bodyMatch) {
    targetDoc.body.innerHTML = bodyMatch[1];
  } else {
    // Fallback: set full HTML
    targetDoc.documentElement.innerHTML = html;
  }
}

/**
 * querySelectorAll wrapper that returns a plain Array<Element>.
 */
export function queryAll(selector: string, root: ParentNode = document): Element[] {
  return Array.from(root.querySelectorAll(selector));
}

/**
 * Count elements matching a CSS selector.
 */
export function countElements(selector: string, root: ParentNode = document): number {
  return root.querySelectorAll(selector).length;
}

/**
 * Get the trimmed text content of the first element matching selector.
 * Returns null if no element found.
 */
export function getTextOf(selector: string, root: ParentNode = document): string | null {
  const el = root.querySelector(selector);
  return el ? (el.textContent ?? '').trim() : null;
}

/**
 * Check whether any element in the document has a specific data attribute.
 *
 * @param attr  Data attribute name without the 'data-' prefix (e.g. 'lastchange')
 */
export function hasDataAttr(attr: string, root: ParentNode = document): boolean {
  return root.querySelector(`[data-${attr}]`) !== null;
}

/**
 * Get all unique values of a data attribute across the document.
 */
export function getDataAttrValues(attr: string, root: ParentNode = document): string[] {
  const elements = Array.from(root.querySelectorAll(`[data-${attr}]`));
  return elements
    .map((el) => (el as HTMLElement).dataset[attr] ?? '')
    .filter((v) => v.length > 0);
}
