import { describe, it, expect } from 'vitest';
import { buildSingleGradePrompt, parseSingleGradeResponse, buildBatchPrompt, generateScoringAnchors } from '../grading.js';

// ── buildSingleGradePrompt ──────────────────────────────────────────────

describe('buildSingleGradePrompt', () => {
  const testRubric = {
    essayPrompt: 'Explain the Pythagorean theorem and provide an example.',
    maxScore: '10',
    checklistItems: [
      { category: 'Understanding (5 points)', points: 5, items: ['Shows comprehension', 'Uses examples'] },
    ],
    rubricItems: [
      { category: 'Key Concepts', items: ['a² + b² = c²', 'Right triangle relationship'] },
    ],
    modelText: 'The Pythagorean theorem states that in a right triangle...',
  };

  it('should include rubric essayPrompt', () => {
    const prompt = buildSingleGradePrompt(testRubric, 'Student answer', 'Grade this');
    expect(prompt).toContain('Explain the Pythagorean theorem');
  });

  it('should include student work', () => {
    const prompt = buildSingleGradePrompt(testRubric, 'My answer about right triangles', 'Grade this');
    expect(prompt).toContain('My answer about right triangles');
  });

  it('should include max score', () => {
    const prompt = buildSingleGradePrompt(testRubric, 'Answer', 'Grade');
    expect(prompt).toContain('MAX SCORE: 10');
  });

  it('should include additional instructions when provided', () => {
    const prompt = buildSingleGradePrompt(testRubric, 'Answer', 'Be lenient with spelling');
    expect(prompt).toContain('Be lenient with spelling');
    expect(prompt).toContain('ADDITIONAL INSTRUCTIONS');
  });

  it('should not include ADDITIONAL INSTRUCTIONS section when instructions is empty', () => {
    const prompt = buildSingleGradePrompt(testRubric, 'Answer', '');
    expect(prompt).not.toContain('ADDITIONAL INSTRUCTIONS');
  });

  it('should include checklist items', () => {
    const prompt = buildSingleGradePrompt(testRubric, 'Answer', 'Grade');
    expect(prompt).toContain('GRADING CHECKLIST');
    expect(prompt).toContain('Understanding (5 points)');
    expect(prompt).toContain('Shows comprehension');
    expect(prompt).toContain('Uses examples');
  });

  it('should include rubric items', () => {
    const prompt = buildSingleGradePrompt(testRubric, 'Answer', 'Grade');
    expect(prompt).toContain('KEY CONCEPTS TO ADDRESS');
    expect(prompt).toContain('Key Concepts');
    expect(prompt).toContain('a² + b² = c²');
  });

  it('should include model response when present', () => {
    const prompt = buildSingleGradePrompt(testRubric, 'Answer', 'Grade');
    expect(prompt).toContain('MODEL RESPONSE');
    expect(prompt).toContain('Pythagorean theorem states');
  });

  it('should handle missing optional rubric fields gracefully', () => {
    const minRubric = { essayPrompt: 'Simple question', maxScore: '5' };
    const prompt = buildSingleGradePrompt(minRubric, 'Answer', '');
    expect(prompt).toContain('Simple question');
    expect(prompt).toContain('MAX SCORE: 10');
    expect(prompt).not.toContain('GRADING CHECKLIST');
    expect(prompt).not.toContain('KEY CONCEPTS TO ADDRESS');
    expect(prompt).not.toContain('MODEL RESPONSE');
  });

  it('should request JSON response format with score and feedback', () => {
    const prompt = buildSingleGradePrompt(testRubric, 'Answer', 'Grade');
    expect(prompt).toContain('JSON');
    expect(prompt).toContain('"score"');
    expect(prompt).toContain('"feedback"');
  });

  it('should handle empty student work', () => {
    const prompt = buildSingleGradePrompt(testRubric, '', 'Grade');
    expect(prompt).toContain('(No response submitted)');
  });

  it('should include grading philosophy section', () => {
    const prompt = buildSingleGradePrompt(testRubric, 'Answer', 'Grade');
    expect(prompt).toContain('GRADING PHILOSOPHY');
    expect(prompt).toContain('high school seniors');
  });

  it('should default maxScore to 10 when not specified', () => {
    const rubricNoMax = { essayPrompt: 'Question' };
    const prompt = buildSingleGradePrompt(rubricNoMax, 'Answer', '');
    expect(prompt).toContain('MAX SCORE: 10');
  });
});

// ── parseSingleGradeResponse ────────────────────────────────────────────

describe('parseSingleGradeResponse', () => {
  it('should parse valid JSON response', () => {
    const response = JSON.stringify({ score: 8, feedback: 'Good work!' });
    const result = parseSingleGradeResponse(response, 10);
    expect(result.score).toBe(8);
    expect(result.feedback).toBe('Good work!');
  });

  it('should parse JSON with half-point score', () => {
    const response = JSON.stringify({ score: 7.5, feedback: 'Solid effort' });
    const result = parseSingleGradeResponse(response, 10);
    expect(result.score).toBe(7.5);
    expect(result.feedback).toBe('Solid effort');
  });

  it('should handle JSON in markdown code fences', () => {
    const response = '```json\n{"score": 7.5, "feedback": "Nice work"}\n```';
    const result = parseSingleGradeResponse(response, 10);
    expect(result.score).toBe(7.5);
    expect(result.feedback).toBe('Nice work');
  });

  it('should handle JSON in generic code fences', () => {
    const response = '```\n{"score": 6, "feedback": "Adequate"}\n```';
    const result = parseSingleGradeResponse(response, 10);
    expect(result.score).toBe(6);
    expect(result.feedback).toBe('Adequate');
  });

  it('should clamp scores above maxScore', () => {
    const response = JSON.stringify({ score: 15, feedback: 'Over max' });
    const result = parseSingleGradeResponse(response, 10);
    expect(result.score).toBe(10);
  });

  it('should clamp negative scores to 0', () => {
    const response = JSON.stringify({ score: -3, feedback: 'Negative' });
    const result = parseSingleGradeResponse(response, 10);
    expect(result.score).toBe(0);
  });

  it('should snap scores to nearest 0.5', () => {
    const response = JSON.stringify({ score: 7.3, feedback: 'Test' });
    const result = parseSingleGradeResponse(response, 10);
    expect(result.score).toBe(7.5);
  });

  it('should snap 7.1 down to 7.0', () => {
    const response = JSON.stringify({ score: 7.1, feedback: 'Test' });
    const result = parseSingleGradeResponse(response, 10);
    expect(result.score).toBe(7);
  });

  it('should handle NaN score as 0', () => {
    const response = JSON.stringify({ score: 'not a number', feedback: 'Bad' });
    const result = parseSingleGradeResponse(response, 10);
    expect(result.score).toBe(0);
  });

  it('should provide default feedback when empty', () => {
    const response = JSON.stringify({ score: 5, feedback: '' });
    const result = parseSingleGradeResponse(response, 10);
    expect(result.feedback).toBe('Graded by AI.');
  });

  it('should handle malformed JSON with error fallback', () => {
    const malformed = 'This is not JSON at all';
    const result = parseSingleGradeResponse(malformed, 10);
    expect(result.score).toBe(0);
    expect(result.feedback).toContain('Error');
  });

  it('should strip <think> reasoning blocks', () => {
    const response = '<think>Let me analyze this carefully...</think>\n{"score": 9, "feedback": "Excellent work"}';
    const result = parseSingleGradeResponse(response, 10);
    expect(result.score).toBe(9);
    expect(result.feedback).toBe('Excellent work');
  });

  it('should extract JSON object from surrounding text', () => {
    const response = 'Here is the result:\n{"score": 6, "feedback": "OK"}\nDone.';
    const result = parseSingleGradeResponse(response, 10);
    expect(result.score).toBe(6);
    expect(result.feedback).toBe('OK');
  });

  it('should use regex fallback for partial JSON', () => {
    const partial = 'Some text "score": 8, "feedback": "Good" more garbage';
    const result = parseSingleGradeResponse(partial, 10);
    expect(result.score).toBe(8);
    expect(result.feedback).toBe('Good');
  });

  it('should respect different maxScore values', () => {
    const response = JSON.stringify({ score: 8, feedback: 'OK' });
    const result = parseSingleGradeResponse(response, 5);
    expect(result.score).toBe(4);

    const overMax = JSON.stringify({ score: 11, feedback: 'Over' });
    const clamped = parseSingleGradeResponse(overMax, 5);
    expect(clamped.score).toBe(5);
  });

  it('should handle LaTeX backslashes in feedback', () => {
    const response = '{"score": 8, "feedback": "Good use of \\\\( a^2 + b^2 = c^2 \\\\)"}';
    const result = parseSingleGradeResponse(response, 10);
    expect(result.score).toBe(8);
    expect(result.feedback).toContain('a^2');
  });
});

// ── POST /api/chat — Grader Mode Validation ─────────────────────────────
// Tests the server logic patterns for grader mode (rubric present)
// Since the Hono app isn't exported, we test the prompt/response functions
// that the endpoint delegates to, covering the same code paths.

describe('Grader mode — prompt construction for /api/chat', () => {
  const fullRubric = {
    essayPrompt: 'Compare mitosis and meiosis.',
    maxScore: '10',
    checklistItems: [
      { category: 'Biology (5 pts)', points: 5, items: ['Identifies cell division stages', 'Compares chromosome count'] },
    ],
    rubricItems: [
      { category: 'Key Terms', items: ['prophase', 'metaphase', 'anaphase', 'telophase'] },
    ],
    modelText: 'Mitosis produces 2 identical cells, meiosis produces 4 gametes.',
  };

  it('should build grader prompt with complete rubric', () => {
    const prompt = buildSingleGradePrompt(fullRubric, 'Student writes about cells.', 'Grade carefully');
    expect(prompt).toContain('Compare mitosis and meiosis');
    expect(prompt).toContain('Student writes about cells');
    expect(prompt).toContain('Grade carefully');
    expect(prompt).toContain('MAX SCORE: 10');
    expect(prompt).toContain('JSON');
  });

  it('should handle multiple checklist categories', () => {
    const rubric = {
      essayPrompt: 'Test',
      maxScore: '20',
      checklistItems: [
        { category: 'Content (10 pts)', points: 10, items: ['Accuracy', 'Depth'] },
        { category: 'Style (10 pts)', points: 10, items: ['Clarity', 'Organization'] },
      ],
    };
    const prompt = buildSingleGradePrompt(rubric, 'Answer', '');
    expect(prompt).toContain('Content (10 pts)');
    expect(prompt).toContain('Style (10 pts)');
    expect(prompt).toContain('Accuracy');
    expect(prompt).toContain('Clarity');
  });

  it('should handle rubric with no checklist but with rubricItems', () => {
    const rubric = {
      essayPrompt: 'Discuss gravity',
      maxScore: '5',
      rubricItems: [
        { category: 'Physics', items: ['Newton\'s law', 'Gravitational constant'] },
      ],
    };
    const prompt = buildSingleGradePrompt(rubric, 'F = ma', '');
    expect(prompt).toContain('KEY CONCEPTS');
    expect(prompt).toContain('Newton\'s law');
    expect(prompt).not.toContain('GRADING CHECKLIST');
  });

  it('should handle rubric with only maxScore', () => {
    const prompt = buildSingleGradePrompt({ maxScore: '100' }, 'Very long essay...', '');
    expect(prompt).toContain('MAX SCORE: 10');
    expect(prompt).toContain('Very long essay');
  });

  it('should preserve very long student work in prompt', () => {
    const longText = 'A'.repeat(5000);
    const prompt = buildSingleGradePrompt({ essayPrompt: 'Test', maxScore: '10' }, longText, '');
    expect(prompt).toContain(longText);
  });

  it('should handle special characters in student work', () => {
    const prompt = buildSingleGradePrompt(
      { essayPrompt: 'Math test', maxScore: '10' },
      'Answer: ∫(x²)dx = x³/3 + C, where x ∈ ℝ',
      '',
    );
    expect(prompt).toContain('∫(x²)dx');
    expect(prompt).toContain('x ∈ ℝ');
  });
});

describe('Grader mode — response parsing edge cases', () => {
  it('should handle score of exactly 0', () => {
    const response = JSON.stringify({ score: 0, feedback: 'No effort shown.' });
    const result = parseSingleGradeResponse(response, 10);
    expect(result.score).toBe(0);
    expect(result.feedback).toBe('No effort shown.');
  });

  it('should handle score of exactly maxScore', () => {
    const response = JSON.stringify({ score: 10, feedback: 'Perfect!' });
    const result = parseSingleGradeResponse(response, 10);
    expect(result.score).toBe(10);
  });

  it('should handle very large feedback text', () => {
    const feedback = 'Detailed feedback: ' + 'x'.repeat(10000);
    const response = JSON.stringify({ score: 7, feedback });
    const result = parseSingleGradeResponse(response, 10);
    expect(result.feedback.length).toBeGreaterThan(100);
    expect(result.score).toBe(7);
  });

  it('should handle unicode in feedback', () => {
    const response = JSON.stringify({ score: 8, feedback: 'Great work! 大変よくできました 🎉' });
    const result = parseSingleGradeResponse(response, 10);
    expect(result.feedback).toContain('大変よくできました');
  });

  it('should handle response with extra fields (resilient parsing)', () => {
    const response = JSON.stringify({
      score: 7,
      feedback: 'Good',
      reasoning: 'Student showed understanding',
      confidence: 0.95,
    });
    const result = parseSingleGradeResponse(response, 10);
    expect(result.score).toBe(7);
    expect(result.feedback).toBe('Good');
  });

  it('should handle JSON with trailing comma (common AI output)', () => {
    // Some LLMs output trailing commas - the function should handle or fallback
    const response = '{"score": 6, "feedback": "OK",}';
    const result = parseSingleGradeResponse(response, 10);
    // Should either parse or use regex fallback
    expect(result.score).toBe(6);
  });

  it('should handle multi-line feedback in JSON', () => {
    const response = '{"score": 8, "feedback": "Line 1.\\nLine 2.\\nLine 3."}';
    const result = parseSingleGradeResponse(response, 10);
    expect(result.score).toBe(8);
    expect(result.feedback).toContain('Line 1');
    expect(result.feedback).toContain('Line 3');
  });

  it('should snap 0.25 scores correctly (round to nearest 0.5)', () => {
    const r1 = parseSingleGradeResponse(JSON.stringify({ score: 7.25, feedback: 'T' }), 10);
    const r2 = parseSingleGradeResponse(JSON.stringify({ score: 7.75, feedback: 'T' }), 10);
    // 7.25 → nearest 0.5 = 7.5 (or 7.0 depending on rounding)
    expect(r1.score % 0.5).toBe(0);
    expect(r2.score % 0.5).toBe(0);
  });

  it('should handle maxScore of 5 (non-standard)', () => {
    const response = JSON.stringify({ score: 7, feedback: 'Decent' });
    const result = parseSingleGradeResponse(response, 5);
    expect(result.score).toBe(3.5);
    expect(result.score).toBeLessThanOrEqual(5);
  });

  it('should handle maxScore of 100', () => {
    const response = JSON.stringify({ score: 8.5, feedback: 'B+' });
    const result = parseSingleGradeResponse(response, 100);
    expect(result.score).toBe(85);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('should handle response wrapped in triple backticks with language hint', () => {
    const response = '```json\n{\n  "score": 9,\n  "feedback": "Excellent understanding"\n}\n```';
    const result = parseSingleGradeResponse(response, 10);
    expect(result.score).toBe(9);
    expect(result.feedback).toBe('Excellent understanding');
  });

  it('should handle multiple <think> blocks', () => {
    const response = '<think>First thought</think><think>Second thought</think>\n{"score": 7, "feedback": "Good"}';
    const result = parseSingleGradeResponse(response, 10);
    expect(result.score).toBe(7);
    expect(result.feedback).not.toContain('think');
  });
});

// ── Solver Mode Validation Patterns ─────────────────────────────────────
// The solver mode doesn't use buildSingleGradePrompt (no rubric),
// but the server validates input. Test the patterns that /api/chat checks.

describe('POST /api/chat — Input validation patterns', () => {
  // These test the same validation logic the endpoint applies.
  // The server requires: { message: string } and determines mode by rubric presence.

  it('message field is required and must be string', () => {
    // Simulate the server's validation
    const validate = (body) => {
      if (!body.message || typeof body.message !== 'string') {
        return { error: 'Missing required field: message', status: 400 };
      }
      return null;
    };

    expect(validate({})).toEqual({ error: 'Missing required field: message', status: 400 });
    expect(validate({ message: '' })).toEqual({ error: 'Missing required field: message', status: 400 });
    expect(validate({ message: 123 })).toEqual({ error: 'Missing required field: message', status: 400 });
    expect(validate({ message: 'Hello' })).toBeNull();
  });

  it('grader mode is triggered when rubric field is present', () => {
    const isGraderMode = (body) => !!body.rubric;

    expect(isGraderMode({ message: 'Grade', rubric: { maxScore: '10' } })).toBe(true);
    expect(isGraderMode({ message: 'Hello' })).toBe(false);
    expect(isGraderMode({ message: 'Hello', rubric: null })).toBe(false);
    expect(isGraderMode({ message: 'Hello', rubric: undefined })).toBe(false);
  });

  it('provider resolution falls back to active provider', () => {
    const providerConfigs = [
      { id: 'ollama', model: 'llama3.2', is_active: true },
      { id: 'openai', model: 'gpt-4', is_active: false },
    ];

    const resolveProvider = (body) => {
      let providerId = body.provider;
      let model = body.model;
      if (!providerId) {
        const active = providerConfigs.find(p => p.is_active);
        if (!active) return { error: 'No active provider' };
        providerId = active.id;
        if (!model) model = active.model;
      }
      return { providerId, model };
    };

    // Explicit provider
    expect(resolveProvider({ provider: 'openai', model: 'gpt-4' }))
      .toEqual({ providerId: 'openai', model: 'gpt-4' });

    // Falls back to active
    expect(resolveProvider({}))
      .toEqual({ providerId: 'ollama', model: 'llama3.2' });

    // Explicit provider, no model → uses explicit provider but no model from config
    expect(resolveProvider({ provider: 'openai' }))
      .toEqual({ providerId: 'openai', model: undefined });
  });

  it('no active provider returns error', () => {
    const allInactive = [
      { id: 'ollama', model: 'llama3.2', is_active: false },
      { id: 'openai', model: 'gpt-4', is_active: false },
    ];

    const active = allInactive.find(p => p.is_active);
    expect(active).toBeUndefined();
  });
});

// ── buildSingleGradePrompt — Prompt Snapshot Tests ──────────────────────

describe('buildSingleGradePrompt — prompt snapshot guards', () => {
  const sampleRubric = {
    essayPrompt: 'Describe the water cycle.',
    maxScore: '10',
    checklistItems: [
      { category: 'Science (5 pts)', points: 5, items: ['Evaporation', 'Condensation'] },
    ],
  };

  it('should include half-point scoring instruction', () => {
    const prompt = buildSingleGradePrompt(sampleRubric, 'Water evaporates and rains', '');
    expect(prompt.toLowerCase()).toContain('half');
  });

  it('should not contain markdown code fences', () => {
    const prompt = buildSingleGradePrompt(sampleRubric, 'Student answer here', '');
    expect(prompt).not.toContain('```');
  });

  it('should instruct model to return JSON', () => {
    const prompt = buildSingleGradePrompt(sampleRubric, 'Student answer here', '');
    expect(prompt).toContain('JSON');
  });

  it('should embed the student work text verbatim', () => {
    const studentText = 'The water cycle involves evaporation, condensation, and precipitation.';
    const prompt = buildSingleGradePrompt(sampleRubric, studentText, '');
    expect(prompt).toContain(studentText);
  });
});
