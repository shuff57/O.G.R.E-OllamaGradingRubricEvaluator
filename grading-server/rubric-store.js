/**
 * Rubric Library: file-based CRUD storage for saved rubrics.
 *
 * Stores rubrics in ogre-rubrics.json alongside ogre-server.json.
 * Mirrors the config.js pattern (atomic writes, file watch).
 */

import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync, watchFile, unwatchFile } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { getConfigDir } from './config.js';

const RUBRICS_FILENAME = 'ogre-rubrics.json';

function getRubricsPath() {
  return join(getConfigDir(), RUBRICS_FILENAME);
}

/**
 * Load rubrics from disk. Returns empty array if file missing.
 */
export function loadRubrics() {
  const filePath = getRubricsPath();

  if (!existsSync(filePath)) {
    return [];
  }

  try {
    const raw = readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);
    return Array.isArray(data.rubrics) ? data.rubrics : [];
  } catch (err) {
    console.error(`[rubric-store] Failed to parse ${filePath}: ${err.message}`);
    return [];
  }
}

/**
 * Save rubrics array to disk atomically (write .tmp, then rename).
 */
export function saveRubrics(rubrics) {
  const filePath = getRubricsPath();
  const tmpPath = filePath + '.tmp';
  const dir = getConfigDir();

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(tmpPath, JSON.stringify({ rubrics }, null, 2), 'utf-8');
  renameSync(tmpPath, filePath);
}

/**
 * Get a single rubric by id.
 */
export function getRubric(id) {
  return loadRubrics().find(r => r.id === id) || null;
}

/**
 * Create a new rubric. Returns the created object.
 */
export function createRubric({ name, criteria, maxScore, tags, description, weightMode }) {
  const rubrics = loadRubrics();
  const now = new Date().toISOString();

  const rubric = {
    id: randomUUID(),
    name: name || 'Untitled Rubric',
    description: description || '',
    criteria: Array.isArray(criteria) ? criteria : [],
    maxScore: typeof maxScore === 'number' ? maxScore : 10,
    tags: Array.isArray(tags) ? tags : [],
    createdAt: now,
    updatedAt: now,
    ...(weightMode !== undefined && { weightMode }),
  };

  rubrics.push(rubric);
  saveRubrics(rubrics);
  return rubric;
}

/**
 * Update an existing rubric by id. Returns updated object or null if not found.
 */
export function updateRubric(id, data) {
  const rubrics = loadRubrics();
  const index = rubrics.findIndex(r => r.id === id);
  if (index === -1) return null;

  const existing = rubrics[index];
  const updated = {
    ...existing,
    ...(data.name !== undefined && { name: data.name }),
    ...(data.description !== undefined && { description: data.description }),
    ...(data.criteria !== undefined && { criteria: data.criteria }),
    ...(data.maxScore !== undefined && { maxScore: data.maxScore }),
    ...(data.tags !== undefined && { tags: data.tags }),
    ...(data.weightMode !== undefined && { weightMode: data.weightMode }),
    updatedAt: new Date().toISOString(),
  };

  rubrics[index] = updated;
  saveRubrics(rubrics);
  return updated;
}

/**
 * Delete a rubric by id. Returns true if found and removed, false otherwise.
 */
export function deleteRubric(id) {
  const rubrics = loadRubrics();
  const filtered = rubrics.filter(r => r.id !== id);
  if (filtered.length === rubrics.length) return false;

  saveRubrics(filtered);
  return true;
}

/**
 * Watch the rubrics file for external changes.
 * Returns a stop function.
 */
export function watchRubrics(callback) {
  const filePath = getRubricsPath();

  // Create file if it doesn't exist so watchFile has something to watch
  if (!existsSync(filePath)) {
    saveRubrics([]);
  }

  let debounceTimer = null;

  watchFile(filePath, { interval: 1000 }, () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      try {
        const rubrics = loadRubrics();
        callback(rubrics);
      } catch (err) {
        console.error(`[rubric-store] Watch reload failed: ${err.message}`);
      }
    }, 500);
  });

  return () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    unwatchFile(filePath);
  };
}
