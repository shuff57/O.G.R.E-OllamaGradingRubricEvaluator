import { afterEach, describe, expect, it } from 'vitest';
import { execSync } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  appendResult,
  commitAndAdvance,
  getCurrentCommitHash,
  getRunningCost,
  initResultsTSV,
  loadBestSnapshot,
  loadSnapshot,
  readResults,
  resetCostTracking,
  revertToLastAdvance,
  saveSnapshot,
  trackAPICall,
} from '../results-tracker.js';

const ORIGINAL_CWD = process.cwd();
const TEMP_DIRS = [];

function makeTempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'results-tracker-'));
  TEMP_DIRS.push(dir);
  return dir;
}

function runGit(command, cwd) {
  return execSync(command, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test User',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test User',
      GIT_COMMITTER_EMAIL: 'test@example.com',
    },
  }).trim();
}

function createTempRepo() {
  const repoDir = makeTempDir();
  runGit('git init && git checkout -b main', repoDir);
  writeFileSync(join(repoDir, 'README.md'), '# temp repo\n');
  runGit('git add README.md', repoDir);
  runGit('git commit -m "chore: init"', repoDir);
  return repoDir;
}

afterEach(() => {
  process.chdir(ORIGINAL_CWD);
  resetCostTracking();
  for (const dir of TEMP_DIRS.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('results-tracker TSV helpers', () => {
  it('initResultsTSV creates file with the expected header row', () => {
    const dir = makeTempDir();
    const filePath = join(dir, 'results.tsv');

    initResultsTSV(filePath);

    expect(readFileSync(filePath, 'utf8')).toBe(
      'iteration\tcomposite\tgenerosity\tvariance\tedge_cases\twithin1\tconciseness\tprompt_len\tstatus\tdescription\n',
    );
  });

  it('initResultsTSV does not overwrite an existing TSV file', () => {
    const dir = makeTempDir();
    const filePath = join(dir, 'results.tsv');

    writeFileSync(filePath, 'existing\n');
    initResultsTSV(filePath);

    expect(readFileSync(filePath, 'utf8')).toBe('existing\n');
  });

  it('appendResult adds one row with the expected TSV values', () => {
    const dir = makeTempDir();
    const filePath = join(dir, 'results.tsv');

    initResultsTSV(filePath);
    appendResult(filePath, {
      iteration: 1,
      composite: 0.987654,
      components: {
        generosityShift: 0.12,
        runVariance: 0.02,
        edgeCaseReliability: 0.5,
        within1Rate: 0.84,
        promptConciseness: 1.23456,
      },
      promptLength: 321,
      status: 'keep',
      description: 'baseline candidate',
    });

    const [, row] = readFileSync(filePath, 'utf8').trim().split('\n');
    expect(row).toBe('1\t0.9877\t0.1200\t0.0200\t0.5000\t0.8400\t1.2346\t321\tkeep\tbaseline candidate');
  });

  it('appendResult multiple times produces header plus one row per result', () => {
    const dir = makeTempDir();
    const filePath = join(dir, 'results.tsv');

    initResultsTSV(filePath);
    appendResult(filePath, {
      iteration: 1,
      composite: 0.8,
      components: {
        generosityShift: 0.1,
        runVariance: 0.2,
        edgeCaseReliability: 0.3,
        within1Rate: 0.4,
        promptConciseness: 0.5,
      },
      promptLength: 300,
      status: 'keep',
      description: 'first',
    });
    appendResult(filePath, {
      iteration: 2,
      composite: 0.9,
      components: {
        generosityShift: 0.2,
        runVariance: 0.1,
        edgeCaseReliability: 0.4,
        within1Rate: 0.5,
        promptConciseness: 0.6,
      },
      promptLength: 280,
      status: 'discard',
      description: 'second',
    });

    const lines = readFileSync(filePath, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(3);
    expect(readResults(filePath)).toHaveLength(2);
  });

  it('writes tab-separated rows instead of comma-separated rows', () => {
    const dir = makeTempDir();
    const filePath = join(dir, 'results.tsv');

    initResultsTSV(filePath);
    appendResult(filePath, {
      iteration: 1,
      composite: 0.75,
      components: {
        generosityShift: 0.1,
        runVariance: 0.2,
        edgeCaseReliability: 0.3,
        within1Rate: 0.4,
        promptConciseness: 0.5,
      },
      promptLength: 123,
      status: 'crash',
      description: 'tab separated',
    });

    const [, row] = readFileSync(filePath, 'utf8').trim().split('\n');
    expect(row.includes('\t')).toBe(true);
    expect(row.includes(',')).toBe(false);
  });

  it('readResults parses back structured result objects', () => {
    const dir = makeTempDir();
    const filePath = join(dir, 'results.tsv');

    initResultsTSV(filePath);
    appendResult(filePath, {
      iteration: 3,
      composite: 0.81234,
      components: {
        generosityShift: 0.25,
        runVariance: 0.05,
        edgeCaseReliability: 0.15,
        within1Rate: 0.95,
        promptConciseness: 1.1,
      },
      promptLength: 456,
      status: 'keep',
      description: 'round trip',
    });

    expect(readResults(filePath)).toEqual([
      {
        iteration: 3,
        composite: 0.8123,
        components: {
          generosityShift: 0.25,
          runVariance: 0.05,
          edgeCaseReliability: 0.15,
          within1Rate: 0.95,
          promptConciseness: 1.1,
        },
        promptLength: 456,
        status: 'keep',
        description: 'round trip',
      },
    ]);
  });

  it('readResults returns an empty array when the TSV file is missing', () => {
    const dir = makeTempDir();

    expect(readResults(join(dir, 'missing.tsv'))).toEqual([]);
  });
});

describe('results-tracker snapshot helpers', () => {
  it('saveSnapshot creates autoresearch/snapshots/iteration-1.json with expected structure', () => {
    const dir = makeTempDir();
    process.chdir(dir);

    const constants = { gradingPhilosophy: 'Be generous' };
    const metric = { composite: 0.91, components: { within1Rate: 0.88 } };

    saveSnapshot(constants, metric, 1);

    const snapshotPath = join(dir, 'autoresearch', 'snapshots', 'iteration-1.json');
    const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));

    expect(existsSync(snapshotPath)).toBe(true);
    expect(snapshot).toMatchObject({
      iteration: 1,
      constants,
      metric,
    });
    expect(Object.keys(snapshot).sort()).toEqual(['constants', 'iteration', 'metric', 'timestamp']);
  });

  it('loadBestSnapshot returns the snapshot with the highest composite score', () => {
    const dir = makeTempDir();
    process.chdir(dir);

    saveSnapshot({ version: 'a' }, { composite: 0.4 }, 1);
    saveSnapshot({ version: 'b' }, { composite: 0.9 }, 2);
    saveSnapshot({ version: 'c' }, { composite: 0.7 }, 3);

    expect(loadBestSnapshot()).toMatchObject({
      iteration: 2,
      constants: { version: 'b' },
      metric: { composite: 0.9 },
    });
  });

  it('loadSnapshot returns a specific saved snapshot by iteration', () => {
    const dir = makeTempDir();
    process.chdir(dir);

    saveSnapshot({ version: 'specific' }, { composite: 0.77 }, 5);

    expect(loadSnapshot(5)).toMatchObject({
      iteration: 5,
      constants: { version: 'specific' },
      metric: { composite: 0.77 },
    });
  });

  it('loadBestSnapshot returns null when no snapshots exist', () => {
    const dir = makeTempDir();

    expect(loadBestSnapshot(join(dir, 'autoresearch', 'snapshots'))).toBeNull();
  });

  it('loadSnapshot returns null for a missing iteration', () => {
    const dir = makeTempDir();
    process.chdir(dir);

    expect(loadSnapshot(999)).toBeNull();
  });
});

describe('results-tracker cost helpers', () => {
  it('trackAPICall and getRunningCost accumulate estimated cost correctly', () => {
    trackAPICall(1_000, 100);
    trackAPICall(500, 50);

    expect(getRunningCost()).toEqual({
      estimatedCost: 0.00675,
      apiCallCount: 2,
    });
  });

  it('estimated cost for 25 students x 3 runs stays within a reasonable Sonnet pricing range', () => {
    for (let i = 0; i < 25 * 3; i += 1) {
      trackAPICall(500, 200);
    }

    const { estimatedCost, apiCallCount } = getRunningCost();
    expect(apiCallCount).toBe(75);
    expect(estimatedCost).toBeGreaterThan(0.3);
    expect(estimatedCost).toBeLessThan(5);
  });
});

describe('results-tracker git helpers', () => {
  it('commitAndAdvance stages files, creates a commit, and returns the new hash', () => {
    const repoDir = createTempRepo();
    writeFileSync(join(repoDir, 'notes.txt'), 'tracked\n');
    process.chdir(repoDir);

    const commitHash = commitAndAdvance('feat: add notes', ['notes.txt']);

    expect(commitHash).toBe(getCurrentCommitHash());
    expect(readFileSync(join(repoDir, 'notes.txt'), 'utf8')).toBe('tracked\n');
  });

  it('commitAndAdvance handles filenames that begin with a dash', () => {
    const repoDir = createTempRepo();
    const riskyFile = '-leading-dash.txt';
    writeFileSync(join(repoDir, riskyFile), 'risky\n');
    process.chdir(repoDir);

    const commitHash = commitAndAdvance('feat: add risky file', [riskyFile]);

    expect(commitHash).toBe(getCurrentCommitHash());
    expect(runGit('git show --name-only --pretty=format:%s HEAD', repoDir)).toContain(riskyFile);
  });

  it('revertToLastAdvance discards uncommitted working tree changes', () => {
    const repoDir = createTempRepo();
    process.chdir(repoDir);

    writeFileSync(join(repoDir, 'README.md'), 'changed\n');
    revertToLastAdvance();

    expect(readFileSync(join(repoDir, 'README.md'), 'utf8')).toBe('# temp repo\n');
  });
});
