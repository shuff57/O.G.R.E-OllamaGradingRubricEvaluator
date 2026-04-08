import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BatchGrader,
  BatchLogEntry,
  DEFAULT_MYOPENMATH_PROFILE,
} from './batch-grader';

// Mock the browser module
vi.mock('./browser', () => ({
  evalScript: vi.fn(),
  evalScriptJSON: vi.fn(),
  injectScript: vi.fn().mockResolvedValue(undefined),
}));

// Mock markdown-extract so ensureTurndownLoaded is a no-op in tests
// (avoids the module-level promise memoization bleeding across test files)
vi.mock('./markdown-extract', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./markdown-extract')>();
  return {
    ...actual,
    ensureTurndownLoaded: vi.fn().mockResolvedValue(undefined),
  };
});

describe('BatchGrader - Log Accumulation', () => {
  let grader: BatchGrader;
  let mockProfile = DEFAULT_MYOPENMATH_PROFILE;

  beforeEach(() => {
    grader = new BatchGrader();
  });

  describe('getLog()', () => {
    it('should return an empty array initially', () => {
      const log = grader.getLog();
      expect(log).toEqual([]);
      expect(Array.isArray(log)).toBe(true);
    });

    it('should return a copy of the log, not the original', () => {
      const log1 = grader.getLog();
      const log2 = grader.getLog();
      expect(log1).not.toBe(log2);
      expect(log1).toEqual(log2);
    });
  });

  describe('Log entry structure', () => {
    it('should have correct BatchLogEntry interface properties', () => {
      const entry: BatchLogEntry = {
        studentName: 'John Doe',
        studentIndex: 0,
        score: 8.5,
        feedback: 'Good work',
        timestamp: new Date().toISOString(),
        status: 'success',
      };

      expect(entry.studentName).toBe('John Doe');
      expect(entry.studentIndex).toBe(0);
      expect(entry.score).toBe(8.5);
      expect(entry.feedback).toBe('Good work');
      expect(entry.status).toBe('success');
      expect(typeof entry.timestamp).toBe('string');
    });

    it('should support error status with null score', () => {
      const entry: BatchLogEntry = {
        studentName: 'Jane Smith',
        studentIndex: 1,
        score: null,
        feedback: 'Network error occurred',
        timestamp: new Date().toISOString(),
        status: 'error',
      };

      expect(entry.status).toBe('error');
      expect(entry.score).toBeNull();
    });

    it('should support skipped status with null score', () => {
      const entry: BatchLogEntry = {
        studentName: 'Bob Johnson',
        studentIndex: 2,
        score: null,
        feedback: 'Already has feedback',
        timestamp: new Date().toISOString(),
        status: 'skipped',
      };

      expect(entry.status).toBe('skipped');
      expect(entry.score).toBeNull();
    });
  });

  describe('Log accumulation via recordError', () => {
    it('should record error entries with status "error"', () => {
      grader['_toGrade'] = [
        {
          index: 0,
          name: 'Student 1',
          currentScore: '',
          hasFeedback: false,
          response: 'Response',
        },
      ];
      grader['_currentIndex'] = 0;

      grader.recordError('Student 1', 'Network timeout');

      const log = grader.getLog();
      expect(log.length).toBe(1);
      expect(log[0].studentName).toBe('Student 1');
      expect(log[0].status).toBe('error');
      expect(log[0].feedback).toBe('Network timeout');
      expect(log[0].score).toBeNull();
    });

    it('should accumulate multiple error entries', () => {
      grader['_toGrade'] = [
        {
          index: 0,
          name: 'Student 1',
          currentScore: '',
          hasFeedback: false,
          response: 'Response 1',
        },
        {
          index: 1,
          name: 'Student 2',
          currentScore: '',
          hasFeedback: false,
          response: 'Response 2',
        },
      ];
      grader['_currentIndex'] = 0;

      grader.recordError('Student 1', 'Error 1');
      grader.recordError('Student 2', 'Error 2');

      const log = grader.getLog();
      expect(log.length).toBe(2);
      expect(log[0].studentName).toBe('Student 1');
      expect(log[1].studentName).toBe('Student 2');
      expect(log[0].feedback).toBe('Error 1');
      expect(log[1].feedback).toBe('Error 2');
    });

    it('should include timestamp in ISO 8601 format for errors', () => {
      grader['_toGrade'] = [
        {
          index: 0,
          name: 'Student 1',
          currentScore: '',
          hasFeedback: false,
          response: 'Response',
        },
      ];
      grader['_currentIndex'] = 0;

      const beforeTime = new Date().toISOString();
      grader.recordError('Student 1', 'Test error');
      const afterTime = new Date().toISOString();

      const log = grader.getLog();
      const timestamp = log[0].timestamp;

      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(new Date(timestamp).getTime()).toBeGreaterThanOrEqual(
        new Date(beforeTime).getTime(),
      );
      expect(new Date(timestamp).getTime()).toBeLessThanOrEqual(
        new Date(afterTime).getTime(),
      );
    });
  });

  describe('Log entries for skipped students', () => {
    it('should log skipped students during start()', async () => {
      const { evalScriptJSON } = await import('./browser');
      const students = [
        { index: 0, name: 'Student 1', currentScore: '', hasFeedback: true, response: 'Response 1' },
        { index: 1, name: 'Student 2', currentScore: '8.5', hasFeedback: false, response: 'Response 2' },
        { index: 2, name: 'Student 3', currentScore: '', hasFeedback: false, response: 'Response 3' },
      ];
      vi.mocked(evalScriptJSON).mockImplementation((script: string) => {
        if (script.endsWith('.length')) return Promise.resolve(students.length);
        if (script.includes('scrollIntoView')) {
          const match = script.match(/\)\[(\d+)\]/);
          const idx = match ? parseInt(match[1]) : 0;
          return Promise.resolve(students[idx] ?? null);
        }
        return Promise.resolve(null); // rubric
      });

      await grader.start(mockProfile);
      const log = grader.getLog();
      const skippedEntries = log.filter((e) => e.status === 'skipped');
      expect(skippedEntries[0].studentName).toBe('Student 1');
      expect(skippedEntries[0].feedback).toBe('Already has feedback');
      expect(skippedEntries[1].studentName).toBe('Student 2');
      expect(skippedEntries[1].feedback).toBe('Already has score');
    });

    it('should have correct studentIndex for skipped entries', async () => {
      const { evalScriptJSON } = await import('./browser');
      const students = [
        { index: 0, name: 'Student 1', currentScore: '', hasFeedback: true, response: 'Response 1' },
        { index: 1, name: 'Student 2', currentScore: '', hasFeedback: false, response: 'Response 2' },
      ];
      vi.mocked(evalScriptJSON).mockImplementation((script: string) => {
        if (script.endsWith('.length')) return Promise.resolve(students.length);
        if (script.includes('scrollIntoView')) {
          const match = script.match(/\)\[(\d+)\]/);
          const idx = match ? parseInt(match[1]) : 0;
          return Promise.resolve(students[idx] ?? null);
        }
        return Promise.resolve(null); // rubric
      });

      await grader.start(mockProfile);
      const log = grader.getLog();
      expect(log[0].studentIndex).toBe(0);
    });
  });

  describe('Log isolation and immutability', () => {
    it('should return a new array each time getLog() is called', () => {
      grader['_toGrade'] = [
        {
          index: 0,
          name: 'Student 1',
          currentScore: '',
          hasFeedback: false,
          response: 'Response',
        },
      ];
      grader['_currentIndex'] = 0;

      grader.recordError('Student 1', 'Test error');

      const log1 = grader.getLog();
      const log2 = grader.getLog();

      expect(log1).not.toBe(log2);
      expect(log1).toEqual(log2);

      // Modifying the returned array should not affect the internal log
      log1.push({
        studentName: 'Fake',
        studentIndex: 999,
        score: 0,
        feedback: 'Fake entry',
        timestamp: new Date().toISOString(),
        status: 'success',
      });

      const log3 = grader.getLog();
      expect(log3.length).toBe(1);
      expect(log3[0].studentName).toBe('Student 1');
    });
  });

  describe('Log reset on new session', () => {
    it('should clear log when start() is called', async () => {
      const { evalScriptJSON } = await import('./browser');
      const students = [
        { index: 0, name: 'Student 1', currentScore: '', hasFeedback: false, response: 'Response' },
      ];
      vi.mocked(evalScriptJSON).mockImplementation((script: string) => {
        if (script.endsWith('.length')) return Promise.resolve(students.length);
        if (script.includes('scrollIntoView')) {
          const match = script.match(/\)\[(\d+)\]/);
          const idx = match ? parseInt(match[1]) : 0;
          return Promise.resolve(students[idx] ?? null);
        }
        return Promise.resolve(null); // rubric
      });

      grader['_toGrade'] = [{ index: 0, name: 'Student 1', currentScore: '', hasFeedback: false, response: 'Response' }];
      grader['_currentIndex'] = 0;
      grader.recordError('Student 1', 'Test error');
      expect(grader.getLog().length).toBe(1);
      await grader.start(mockProfile);
      expect(grader.getLog().length).toBe(0);
    });
  });

  describe('Log chronological ordering', () => {
    it('should maintain chronological order of error entries', () => {
      grader['_toGrade'] = [
        {
          index: 0,
          name: 'Student 1',
          currentScore: '',
          hasFeedback: false,
          response: 'Response 1',
        },
        {
          index: 1,
          name: 'Student 2',
          currentScore: '',
          hasFeedback: false,
          response: 'Response 2',
        },
        {
          index: 2,
          name: 'Student 3',
          currentScore: '',
          hasFeedback: false,
          response: 'Response 3',
        },
      ];
      grader['_currentIndex'] = 0;

      grader.recordError('Student 1', 'Error 1');
      grader.recordError('Student 2', 'Error 2');
      grader.recordError('Student 3', 'Error 3');

      const log = grader.getLog();
      expect(log.length).toBe(3);
      expect(log[0].studentName).toBe('Student 1');
      expect(log[1].studentName).toBe('Student 2');
      expect(log[2].studentName).toBe('Student 3');

      // Verify timestamps are in order
      const ts0 = new Date(log[0].timestamp).getTime();
      const ts1 = new Date(log[1].timestamp).getTime();
      const ts2 = new Date(log[2].timestamp).getTime();
      expect(ts0).toBeLessThanOrEqual(ts1);
      expect(ts1).toBeLessThanOrEqual(ts2);
    });
  });
});

describe('BatchGrader - Filter Logic', () => {
  let grader: BatchGrader;
  const mockProfile = DEFAULT_MYOPENMATH_PROFILE;

  beforeEach(() => {
    grader = new BatchGrader();
  });

  it('should skip empty-response students and add them to noResponseStudents', async () => {
    const { evalScriptJSON } = await import('./browser');
    const students = [
      { index: 0, name: 'Student 1', currentScore: '', hasFeedback: false, response: '  ' },
    ];
    vi.mocked(evalScriptJSON).mockImplementation((script: string) => {
      if (script.endsWith('.length')) return Promise.resolve(students.length);
      if (script.includes('scrollIntoView')) {
        const match = script.match(/\)\[(\d+)\]/);
        const idx = match ? parseInt(match[1]) : 0;
        return Promise.resolve(students[idx] ?? null);
      }
      return Promise.resolve(null);
    });

    await grader.start(mockProfile);

    expect(grader.noResponseStudents.length).toBe(1);
    expect(grader.studentsToGrade.length).toBe(0);
    const skipped = grader.getLog().filter(e => e.status === 'skipped');
    expect(skipped[0].feedback).toBe('No response submitted');
  });

  it('should include score-0 students with a response in studentsToGrade', async () => {
    const { evalScriptJSON } = await import('./browser');
    const students = [
      { index: 0, name: 'Student 1', currentScore: '0', hasFeedback: false, response: 'My answer' },
    ];
    vi.mocked(evalScriptJSON).mockImplementation((script: string) => {
      if (script.endsWith('.length')) return Promise.resolve(students.length);
      if (script.includes('scrollIntoView')) {
        const match = script.match(/\)\[(\d+)\]/);
        const idx = match ? parseInt(match[1]) : 0;
        return Promise.resolve(students[idx] ?? null);
      }
      return Promise.resolve(null);
    });

    await grader.start(mockProfile);

    expect(grader.studentsToGrade.length).toBe(1);
  });

  it('should include all students with responses when forceRegrade is true', async () => {
    const { evalScriptJSON } = await import('./browser');
    const students = [
      { index: 0, name: 'Student 1', currentScore: '8', hasFeedback: true, response: 'answer' },
      { index: 1, name: 'Student 2', currentScore: '0', hasFeedback: false, response: 'answer' },
    ];
    vi.mocked(evalScriptJSON).mockImplementation((script: string) => {
      if (script.endsWith('.length')) return Promise.resolve(students.length);
      if (script.includes('scrollIntoView')) {
        const match = script.match(/\)\[(\d+)\]/);
        const idx = match ? parseInt(match[1]) : 0;
        return Promise.resolve(students[idx] ?? null);
      }
      return Promise.resolve(null);
    });

    await grader.start(mockProfile, null, true);

    expect(grader.studentsToGrade.length).toBe(2);
  });
});
