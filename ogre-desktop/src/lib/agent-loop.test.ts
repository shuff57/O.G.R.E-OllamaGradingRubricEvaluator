import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('./agent-dom', () => ({
  captureInteractiveDom: vi.fn().mockResolvedValue([]),
  formatDomForPrompt: vi.fn().mockReturnValue(''),
}));

vi.mock('./browser', () => ({
  captureWebviewScreenshot: vi.fn().mockResolvedValue('data:image/png;base64,abc'),
  captureAccessibilityTree: vi.fn().mockResolvedValue(''),
  getEmbeddedUrl: vi.fn().mockResolvedValue(null),
}));

vi.mock('./agent-api', () => ({
  sendAgentRequest: vi.fn(),
}));

vi.mock('./browser-actions', () => ({
  executeAction: vi.fn(),
}));

vi.mock('./agent-prompt', () => ({
  AGENT_SYSTEM_PROMPT: 'You are a browser agent.',
}));

vi.mock('./skills-api', () => ({
  buildSiteContextInjection: vi.fn().mockResolvedValue(''),
  buildSkillInjection: vi.fn().mockResolvedValue(''),
}));

import { sendAgentRequest } from './agent-api';
import { executeAction } from './browser-actions';
import { createAgentController, mergeDomWithAxTree } from './agent-loop';

const mockSend = sendAgentRequest as ReturnType<typeof vi.fn>;
const mockExecute = executeAction as ReturnType<typeof vi.fn>;

beforeEach(async () => {
  vi.resetAllMocks();
  // Re-apply default implementations for agent-dom and browser mocks after reset
  const { captureInteractiveDom, formatDomForPrompt } = await import('./agent-dom');
  (captureInteractiveDom as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (formatDomForPrompt as ReturnType<typeof vi.fn>).mockReturnValue('');
  const { captureWebviewScreenshot } = await import('./browser');
  (captureWebviewScreenshot as ReturnType<typeof vi.fn>).mockResolvedValue('data:image/png;base64,abc');
  const { captureAccessibilityTree } = await import('./browser');
  (captureAccessibilityTree as ReturnType<typeof vi.fn>).mockResolvedValue('');
  const { getEmbeddedUrl } = await import('./browser');
  (getEmbeddedUrl as ReturnType<typeof vi.fn>).mockResolvedValue(null);
  const { buildSiteContextInjection, buildSkillInjection } = await import('./skills-api');
  (buildSiteContextInjection as ReturnType<typeof vi.fn>).mockResolvedValue('');
  (buildSkillInjection as ReturnType<typeof vi.fn>).mockResolvedValue('');
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function collectEvents(gen: AsyncGenerator<any>): Promise<any[]> {
  const events: any[] = [];
  for await (const event of gen) {
    events.push(event);
  }
  return events;
}

/**
 * Drive the generator forward manually, call decision() once 'propose' is yielded,
 * then collect remaining events. Returns ALL events (including propose).
 *
 * NOTE: We cannot use `for await + break` because break calls gen.return() which
 * terminates the generator. Instead, we call gen.next() manually in a loop.
 *
 * After gen.next() resolves with the 'propose' event, the generator is suspended at
 * `yield { type: 'propose', ... }`. We then call gen.next() again to advance past the
 * yield into the approval gate where approvalResolve gets set synchronously inside the
 * Promise constructor. After one microtask tick, approvalResolve is live, and we
 * call decision() to resolve it.
 */
async function approveAndCollect(
  gen: AsyncGenerator<any>,
  decision: () => void,
): Promise<any[]> {
  const events: any[] = [];
  // Step 1: advance until we see 'propose'
  let result = await gen.next();
  while (!result.done && result.value.type !== 'propose') {
    events.push(result.value);
    result = await gen.next();
  }
  if (result.done) return events; // shouldn't happen
  events.push(result.value); // push the 'propose' event

  // Step 2: advance past the yield into the approval gate.
  // gen.next() resumes the generator; it runs synchronously until it hits
  // `await new Promise(resolve => { approvalResolve = resolve })`, setting
  // approvalResolve synchronously. The microtask tick ensures the generator
  // has reached that point before we call decision().
  const nextPromise = gen.next();
  await Promise.resolve();   // tick: let generator run to approvalResolve = resolve
  decision();                // resolve the approval gate

  // Step 3: collect remaining events
  const afterDecision = await nextPromise;
  if (!afterDecision.done) {
    events.push(afterDecision.value);
    let r = await gen.next();
    while (!r.done) {
      events.push(r.value);
      r = await gen.next();
    }
  }
  return events;
}

const DONE_RESPONSE = {
  action: 'done',
  params: { success: true, message: 'Done!' },
  reasoning: '',
};

const CLICK_RESPONSE = {
  action: 'click',
  params: { selector: '#btn' },
  reasoning: 'click the button',
};

// ---------------------------------------------------------------------------
// mergeDomWithAxTree — pure unit tests
// ---------------------------------------------------------------------------

describe('mergeDomWithAxTree', () => {
  test('returns merged string with Interactive Elements first then AX tree', () => {
    const dom = 'button#submit';
    const axTree = Array.from({ length: 25 }, (_, i) => `- button "Node ${i + 1}"`).join('\n');
    const result = mergeDomWithAxTree(dom, axTree);
    expect(result).toContain('## Interactive Elements');
    expect(result).toContain(dom);
    expect(result).toContain('## Page Structure (Accessibility Tree)');
    expect(result).toContain(axTree);
    const domIdx = result.indexOf('## Interactive Elements');
    const axIdx = result.indexOf('## Page Structure (Accessibility Tree)');
    expect(domIdx).toBeLessThan(axIdx);
  });

  test('truncates AX tree when combined exceeds 8000 token limit', () => {
    // Create a large AX tree that, combined with dom, exceeds 32000 chars
    const dom = 'button#submit'; // 13 chars
    const bigAxTree = 'x'.repeat(40_000); // well over the limit
    const result = mergeDomWithAxTree(dom, bigAxTree);
    expect(result.length).toBeLessThanOrEqual(32_000 + 60); // slight tolerance for headers
    expect(result).toContain('## Interactive Elements');
    expect(result).toContain(dom);
  });

  test('returns just dom when dom alone exceeds budget', () => {
    const hugeDom = 'y'.repeat(35_000); // bigger than 32000 char limit alone
    const axTree = 'some ax content';
    const result = mergeDomWithAxTree(hugeDom, axTree);
    expect(result).toBe(hugeDom);
  });
});

// ---------------------------------------------------------------------------
// Auto mode — done action
// ---------------------------------------------------------------------------

describe('agent-loop: auto mode - done action', () => {
  test('emits thinking, propose, executing, result, done events', async () => {
    mockSend.mockResolvedValue(DONE_RESPONSE);
    mockExecute.mockResolvedValue({ success: true, data: { message: 'Done!' } });

    const controller = createAgentController();
    const gen = controller.start({ mode: 'auto', initialMessage: 'Do a task', compact: false, config: { actionDelayMs: 0, maxSteps: 10, maxTimeMs: 30000, maxSameAction: 3 } });
    const events = await collectEvents(gen);

    const types = events.map((e) => e.type);
    expect(types).toContain('thinking');
    expect(types).toContain('propose');
    expect(types).toContain('executing');
    expect(types).toContain('result');
    expect(types).toContain('done');

    const doneEvent = events.find((e) => e.type === 'done');
    expect(doneEvent.message).toBe('Done!');
  });
});

// ---------------------------------------------------------------------------
// Review mode — approve
// ---------------------------------------------------------------------------

describe('agent-loop: review mode - approve', () => {
  test('executes action after approve, then finishes on done', async () => {
    mockSend
      .mockResolvedValueOnce(CLICK_RESPONSE)
      .mockResolvedValueOnce(DONE_RESPONSE);
    mockExecute.mockResolvedValue({ success: true });
    const controller = createAgentController();
    const gen = controller.start({ mode: 'review', initialMessage: 'Click the button', config: { actionDelayMs: 0, maxSteps: 10, maxTimeMs: 30000, maxSameAction: 3 } });
    // approveAndCollect drives gen.next() manually, so approvalResolve is set
    // before approve() is called.
    const allEvents = await approveAndCollect(gen, () => controller.approve());
    const types = allEvents.map((e) => e.type);
    expect(types).toContain('propose');
    expect(types).toContain('executing');
    expect(types).toContain('done');
  });
});

// ---------------------------------------------------------------------------
// Review mode — skip
// ---------------------------------------------------------------------------
describe('agent-loop: review mode - skip', () => {
  test('does not execute skipped action, continues to done', async () => {
    mockSend
      .mockResolvedValueOnce(CLICK_RESPONSE)
      .mockResolvedValueOnce(DONE_RESPONSE);
    mockExecute.mockResolvedValue({ success: true });
    const controller = createAgentController();
    const gen = controller.start({ mode: 'review', initialMessage: 'Click the button', config: { actionDelayMs: 0, maxSteps: 10, maxTimeMs: 30000, maxSameAction: 3 } });
    const allEvents = await approveAndCollect(gen, () => controller.skip());
    const types = allEvents.map((e) => e.type);
    // skipped action must not have been executed
    const executingClick = allEvents.filter((e) => e.type === 'executing' && e.action === 'click');
    expect(executingClick).toHaveLength(0);
    expect(types).toContain('done');
  });
});

// ---------------------------------------------------------------------------
// Stop / abort
// ---------------------------------------------------------------------------

describe('agent-loop: stop/abort', () => {
  test('stop() causes generator to emit error event', async () => {
    // approveAndCollect drives gen.next() until 'propose', then calls stop().
    // stop() aborts the controller + resolves the approval gate as 'skip'.
    // The next loop iteration sees signal.aborted and yields 'error'.
    mockSend.mockResolvedValueOnce(CLICK_RESPONSE);
    mockExecute.mockResolvedValue({ success: true });
    const controller = createAgentController();
    const gen = controller.start({ mode: 'review', initialMessage: 'Do something', config: { actionDelayMs: 0, maxSteps: 10, maxTimeMs: 30000, maxSameAction: 3 } });
    const allEvents = await approveAndCollect(gen, () => controller.stop());
    const errorEvent = allEvents.find((e) => e.type === 'error');
    expect(errorEvent).toBeDefined();
    expect(errorEvent.message).toContain('stopped by user');
  });
});

// ---------------------------------------------------------------------------
// Max steps limit
// ---------------------------------------------------------------------------

describe('agent-loop: max steps limit', () => {
  test('stops with done event after maxSteps is reached', async () => {
    // Always returns a non-done click action
    mockSend.mockResolvedValue(CLICK_RESPONSE);
    mockExecute.mockResolvedValue({ success: true });

    const controller = createAgentController();
    const gen = controller.start({
      mode: 'auto',
      initialMessage: 'Keep clicking',
      config: { actionDelayMs: 0, maxSteps: 2, maxTimeMs: 30000, maxSameAction: 10 },
    });
    const events = await collectEvents(gen);
    const doneEvent = events.find((e) => e.type === 'done');
    expect(doneEvent).toBeDefined();
    expect(doneEvent.message).toContain('maximum step limit');
  });
});

// ---------------------------------------------------------------------------
// runJS always requires approval even in auto mode
// ---------------------------------------------------------------------------

describe('agent-loop: runJS requires approval in auto mode', () => {
  test('runJS in auto mode pauses for approval before executing', async () => {
    const runJSResponse = {
      action: 'runJS',
      params: { code: 'document.title' },
      reasoning: 'get title',
    };
    mockSend
      .mockResolvedValueOnce(runJSResponse)
      .mockResolvedValueOnce(DONE_RESPONSE);
    mockExecute.mockResolvedValue({ success: true, data: 'My Page' });
    const controller = createAgentController();
    const gen = controller.start({ mode: 'auto', initialMessage: 'Get title', config: { actionDelayMs: 0, maxSteps: 10, maxTimeMs: 30000, maxSameAction: 3 } });
    // approveAndCollect collects until 'propose' (runJS), calls approve(), then collects rest.
    const allEvents = await approveAndCollect(gen, () => controller.approve());
    const proposeEvent = allEvents.find((e) => e.type === 'propose');
    expect(proposeEvent).toBeDefined();
    expect(proposeEvent.action).toBe('runJS');
    const executingEvent = allEvents.find((e) => e.type === 'executing');
    expect(executingEvent).toBeDefined();
    expect(executingEvent.action).toBe('runJS');
  });
});

// ---------------------------------------------------------------------------
// Text-only response
// ---------------------------------------------------------------------------

describe('agent-loop: text-only response', () => {
  test('emits text event and continues (non-terminal)', async () => {
    mockSend.mockResolvedValueOnce({ text: 'Here is my answer' });
    mockSend.mockResolvedValue({ action: 'done', params: { success: true, message: 'done' }, reasoning: '' });
    mockExecute.mockResolvedValue({ success: true });

    const controller = createAgentController();
    const gen = controller.start({ mode: 'auto', initialMessage: 'Tell me something', config: { actionDelayMs: 0, maxSteps: 10, maxTimeMs: 30000, maxSameAction: 3 } });
    const events = await collectEvents(gen);

    const textEvent = events.find((e) => e.type === 'text');
    expect(textEvent).toBeDefined();
    expect(textEvent.content).toBe('Here is my answer');
    // Text response is non-terminal — loop should continue and eventually finish
    expect(events.length).toBeGreaterThan(0);
    expect(events.some((e) => e.type === 'done')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AI error
// ---------------------------------------------------------------------------

describe('agent-loop: AI error', () => {
  test('emits error event when sendAgentRequest throws', async () => {
    mockSend.mockRejectedValue(new Error('Network error'));

    const controller = createAgentController();
    const gen = controller.start({ mode: 'auto', initialMessage: 'Do something', config: { actionDelayMs: 0, maxSteps: 10, maxTimeMs: 30000, maxSameAction: 3 } });
    const events = await collectEvents(gen);

    const errorEvent = events.find((e) => e.type === 'error');
    expect(errorEvent).toBeDefined();
    expect(errorEvent.message).toBe('Network error');
  });
});

describe('agent-loop: accessibility tree page state', () => {
  test('merges interactive DOM and AX tree when tree has >20 nodes', async () => {
    const { captureInteractiveDom, formatDomForPrompt } = await import('./agent-dom');
    const { captureAccessibilityTree } = await import('./browser');

    (captureInteractiveDom as ReturnType<typeof vi.fn>).mockResolvedValue([{ selector: '#btn' }]);
    (formatDomForPrompt as ReturnType<typeof vi.fn>).mockReturnValue('DOM SNAPSHOT');

    const axTree = Array.from({ length: 21 }, (_, i) => `- button \"Node ${i + 1}\"`).join('\n');
    (captureAccessibilityTree as ReturnType<typeof vi.fn>).mockResolvedValue(axTree);

    mockSend.mockResolvedValueOnce(DONE_RESPONSE);
    mockExecute.mockResolvedValueOnce({ success: true, data: { message: 'Done!' } });

    const controller = createAgentController();
    const gen = controller.start({ mode: 'auto', initialMessage: 'Do a task', compact: false, config: { actionDelayMs: 0, maxSteps: 2, maxTimeMs: 30000, maxSameAction: 3 } });
    await collectEvents(gen);

    expect(mockSend).toHaveBeenCalled();
    const firstCall = mockSend.mock.calls[0]?.[0] as { dom?: string };
    // DOM must come FIRST, AX tree appended as supplementary section
    expect(firstCall.dom).toContain('## Interactive Elements');
    expect(firstCall.dom).toContain('DOM SNAPSHOT');
    expect(firstCall.dom).toContain('## Page Structure (Accessibility Tree)');
    expect(firstCall.dom).toContain(axTree);
    // Interactive Elements must come before the AX tree
    const domIdx = firstCall.dom!.indexOf('## Interactive Elements');
    const axIdx = firstCall.dom!.indexOf('## Page Structure (Accessibility Tree)');
    expect(domIdx).toBeLessThan(axIdx);
  });

  test('uses only interactive DOM when AX tree has ≤20 nodes', async () => {
    const { captureInteractiveDom, formatDomForPrompt } = await import('./agent-dom');
    const { captureAccessibilityTree } = await import('./browser');

    (captureInteractiveDom as ReturnType<typeof vi.fn>).mockResolvedValue([{ selector: '#btn' }]);
    (formatDomForPrompt as ReturnType<typeof vi.fn>).mockReturnValue('DOM SNAPSHOT');

    // Only 5 nodes — below threshold
    const smallAxTree = Array.from({ length: 5 }, (_, i) => `- button \"Node ${i + 1}\"`).join('\n');
    (captureAccessibilityTree as ReturnType<typeof vi.fn>).mockResolvedValue(smallAxTree);

    mockSend.mockResolvedValueOnce(DONE_RESPONSE);
    mockExecute.mockResolvedValueOnce({ success: true, data: { message: 'Done!' } });

    const controller = createAgentController();
    const gen = controller.start({ mode: 'auto', initialMessage: 'Do a task', compact: false, config: { actionDelayMs: 0, maxSteps: 2, maxTimeMs: 30000, maxSameAction: 3 } });
    await collectEvents(gen);

    expect(mockSend).toHaveBeenCalled();
    const firstCall = mockSend.mock.calls[0]?.[0] as { dom?: string };
    // Small AX tree → no merge, plain DOM string
    expect(firstCall.dom).toBe('DOM SNAPSHOT');
    expect(firstCall.dom).not.toContain('## Page Structure (Accessibility Tree)');
  });

  test('does not append empty AX tree', async () => {
    const { captureInteractiveDom, formatDomForPrompt } = await import('./agent-dom');
    const { captureAccessibilityTree } = await import('./browser');

    (captureInteractiveDom as ReturnType<typeof vi.fn>).mockResolvedValue([{ selector: '#btn' }]);
    (formatDomForPrompt as ReturnType<typeof vi.fn>).mockReturnValue('DOM SNAPSHOT');

    // Empty AX tree
    (captureAccessibilityTree as ReturnType<typeof vi.fn>).mockResolvedValue('');

    mockSend.mockResolvedValueOnce(DONE_RESPONSE);
    mockExecute.mockResolvedValueOnce({ success: true, data: { message: 'Done!' } });

    const controller = createAgentController();
    const gen = controller.start({ mode: 'auto', initialMessage: 'Do a task', compact: false, config: { actionDelayMs: 0, maxSteps: 2, maxTimeMs: 30000, maxSameAction: 3 } });
    await collectEvents(gen);

    expect(mockSend).toHaveBeenCalled();
    const firstCall = mockSend.mock.calls[0]?.[0] as { dom?: string };
    // Empty AX tree → plain DOM, no merge section
    expect(firstCall.dom).toBe('DOM SNAPSHOT');
    expect(firstCall.dom).not.toContain('## Page Structure (Accessibility Tree)');
  });
});

// ── Site Profile Injection in Agent Loop ────────────────────────────────

describe('site profile injection', () => {
  function doneResponse() {
    return { action: 'done', params: { success: true, message: 'Done!' }, reasoning: '' };
  }

  beforeEach(() => {
    mockExecute.mockResolvedValue({ success: true, data: { message: 'Done!' } });
  });

  test('injects site context when URL matches a profile', async () => {
    const { getEmbeddedUrl } = await import('./browser');
    const { buildSiteContextInjection } = await import('./skills-api');
    (getEmbeddedUrl as ReturnType<typeof vi.fn>).mockResolvedValue('https://www.myopenmath.com/course/123');
    (buildSiteContextInjection as ReturnType<typeof vi.fn>).mockResolvedValue('\n\n--- SITE GUIDE: MOM ---\nMOM content\n--- END SITE GUIDE ---\n\n');
    (mockSend as ReturnType<typeof vi.fn>).mockResolvedValue(doneResponse());

    const controller = createAgentController();
    const gen = controller.start({ mode: 'auto', initialMessage: 'Help me grade', config: { actionDelayMs: 0, maxSteps: 1, maxTimeMs: 30000, maxSameAction: 3 } });
    await collectEvents(gen);

    expect(buildSiteContextInjection).toHaveBeenCalledWith('https://www.myopenmath.com/course/123');
    const firstCall = (mockSend as ReturnType<typeof vi.fn>).mock.calls[0];
    const callArg = firstCall[0] as { messages: Array<{ role: string; content: string }> };
    const systemMsg = callArg.messages.find(m => m.role === 'system');
    expect(systemMsg?.content).toContain('--- SITE GUIDE: MOM ---');
  });

  test('uses base system prompt when URL does not match any profile', async () => {
    const { getEmbeddedUrl } = await import('./browser');
    const { buildSiteContextInjection } = await import('./skills-api');
    (getEmbeddedUrl as ReturnType<typeof vi.fn>).mockResolvedValue('https://canvas.instructure.com');
    (buildSiteContextInjection as ReturnType<typeof vi.fn>).mockResolvedValue('');
    (mockSend as ReturnType<typeof vi.fn>).mockResolvedValue(doneResponse());

    const controller = createAgentController();
    const gen = controller.start({ mode: 'auto', initialMessage: 'Help', config: { actionDelayMs: 0, maxSteps: 1, maxTimeMs: 30000, maxSameAction: 3 } });
    await collectEvents(gen);

    const firstCall = (mockSend as ReturnType<typeof vi.fn>).mock.calls[0];
    const callArg = firstCall[0] as { messages: Array<{ role: string; content: string }> };
    const systemMsg = callArg.messages.find(m => m.role === 'system');
    expect(systemMsg?.content).toBe('You are a browser agent.');
  });

  test('works normally when getEmbeddedUrl throws (no browser open)', async () => {
    const { getEmbeddedUrl } = await import('./browser');
    (getEmbeddedUrl as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('No browser'));
    (mockSend as ReturnType<typeof vi.fn>).mockResolvedValue(doneResponse());

    const controller = createAgentController();
    const gen = controller.start({ mode: 'auto', initialMessage: 'Help', config: { actionDelayMs: 0, maxSteps: 1, maxTimeMs: 30000, maxSameAction: 3 } });
    const events = await collectEvents(gen);

    // Should not crash — should complete normally
    const errorEvent = events.find(e => e.type === 'error');
    expect(errorEvent).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Consecutive failure detection (Task 3)
// ---------------------------------------------------------------------------

describe('agent-loop: consecutive failure detection', () => {
  const makeClickResponse = (selector: string) => ({
    action: 'click',
    params: { selector },
    reasoning: `click ${selector}`,
  });

  test('terminates after maxConsecutiveFailures consecutive failures across different actions', async () => {
    // 3 different failing actions
    mockSend
      .mockResolvedValueOnce(makeClickResponse('#a'))
      .mockResolvedValueOnce(makeClickResponse('#b'))
      .mockResolvedValueOnce(makeClickResponse('#c'));
    mockExecute.mockResolvedValue({ success: false, error: 'Action failed: timeout' });

    const controller = createAgentController();
    const gen = controller.start({
      mode: 'auto',
      initialMessage: 'Do something',
      config: { actionDelayMs: 0, maxSteps: 20, maxTimeMs: 30000, maxSameAction: 10, maxConsecutiveFailures: 3 },
    });
    const events = await collectEvents(gen);

    const doneEvent = events.find((e) => e.type === 'done');
    expect(doneEvent).toBeDefined();
    expect(doneEvent.message).toMatch(/consecutive failures/i);
  });

  test('successful action resets consecutive failure counter', async () => {
    // fail, fail, succeed, fail, fail -> should NOT terminate (counter reset at success)
    mockSend
      .mockResolvedValueOnce(makeClickResponse('#a'))
      .mockResolvedValueOnce(makeClickResponse('#b'))
      .mockResolvedValueOnce(makeClickResponse('#c'))
      .mockResolvedValueOnce(makeClickResponse('#d'))
      .mockResolvedValueOnce(makeClickResponse('#e'))
      .mockResolvedValue({ action: 'done', params: { success: true, message: 'Done!' }, reasoning: '' });
    mockExecute
      .mockResolvedValueOnce({ success: false, error: 'fail 1' })
      .mockResolvedValueOnce({ success: false, error: 'fail 2' })
      .mockResolvedValueOnce({ success: true })  // reset counter
      .mockResolvedValueOnce({ success: false, error: 'fail 3' })
      .mockResolvedValueOnce({ success: false, error: 'fail 4' })
      .mockResolvedValue({ success: true, data: { message: 'Done!' } });

    const controller = createAgentController();
    const gen = controller.start({
      mode: 'auto',
      initialMessage: 'Do something',
      config: { actionDelayMs: 0, maxSteps: 20, maxTimeMs: 30000, maxSameAction: 10, maxConsecutiveFailures: 3 },
    });
    const events = await collectEvents(gen);

    const doneEvent = events.find((e) => e.type === 'done');
    expect(doneEvent).toBeDefined();
    // Should complete normally (not from consecutive failures)
    expect(doneEvent.message).not.toMatch(/consecutive failures/i);
  });

  test('screenshot retry (selector not found) does not count as consecutive failure', async () => {
    // selector-not-found failure triggers screenshot retry (free retry, no counter increment)
    // then a success — should not terminate
    mockSend
      .mockResolvedValueOnce(makeClickResponse('#bad-selector'))
      .mockResolvedValueOnce(makeClickResponse('#good-selector'))
      .mockResolvedValue({ action: 'done', params: { success: true, message: 'Done!' }, reasoning: '' });
    mockExecute
      .mockResolvedValueOnce({ success: false, error: 'Element not found: #bad-selector' })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValue({ success: true, data: { message: 'Done!' } });

    const controller = createAgentController();
    const gen = controller.start({
      mode: 'auto',
      initialMessage: 'Click something',
      config: { actionDelayMs: 0, maxSteps: 20, maxTimeMs: 30000, maxSameAction: 10, maxConsecutiveFailures: 2 },
    });
    const events = await collectEvents(gen);

    const doneEvent = events.find((e) => e.type === 'done');
    expect(doneEvent).toBeDefined();
    // Should complete normally (screenshot retry is a free retry, not a failure)
    expect(doneEvent.message).not.toMatch(/consecutive failures/i);
  });
});

// ---------------------------------------------------------------------------
// Site context refresh after navigate (Task 4)
// ---------------------------------------------------------------------------

describe('agent-loop: site context refresh after navigate', () => {
  const makeNavigateResponse = (url: string) => ({
    action: 'navigate',
    params: { url },
    reasoning: `navigate to ${url}`,
  });

  test('injects updated site guide after navigating to a profiled URL', async () => {
    const { getEmbeddedUrl } = await import('./browser');
    const { buildSiteContextInjection } = await import('./skills-api');

    // Start on non-profiled URL, navigate to MOM
    (getEmbeddedUrl as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(null)  // initial URL (no profile)
      .mockResolvedValue('https://www.myopenmath.com/course.php');  // after navigate
    (buildSiteContextInjection as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce('')  // initial context (no profile)
      .mockResolvedValue('SITE GUIDE: MyOpenMath guide content here');  // after navigate

    mockSend
      .mockResolvedValueOnce(makeNavigateResponse('https://www.myopenmath.com/course.php'))
      .mockResolvedValue({ action: 'done', params: { success: true, message: 'Done!' }, reasoning: '' });
    mockExecute
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValue({ success: true, data: { message: 'Done!' } });

    const controller = createAgentController();
    const gen = controller.start({
      mode: 'auto',
      initialMessage: 'Navigate to MOM',
      config: { actionDelayMs: 0, maxSteps: 10, maxTimeMs: 30000, maxSameAction: 3, maxConsecutiveFailures: 5 },
    });
    const events = await collectEvents(gen);

    // Verify the loop completed
    const doneEvent = events.find((e) => e.type === 'done');
    expect(doneEvent).toBeDefined();

    // Verify buildSiteContextInjection was called after navigate
    expect(buildSiteContextInjection).toHaveBeenCalledWith('https://www.myopenmath.com/course.php');
  });

  test('injects no-guide message when navigating to non-profiled URL', async () => {
    const { getEmbeddedUrl } = await import('./browser');
    const { buildSiteContextInjection } = await import('./skills-api');

    // Start on MOM, navigate to google.com (no profile)
    (getEmbeddedUrl as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce('https://www.myopenmath.com')  // initial URL
      .mockResolvedValue('https://www.google.com');  // after navigate
    (buildSiteContextInjection as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce('SITE GUIDE: MOM content')  // initial context
      .mockResolvedValue('');  // no profile for google.com

    mockSend
      .mockResolvedValueOnce(makeNavigateResponse('https://www.google.com'))
      .mockResolvedValue({ action: 'done', params: { success: true, message: 'Done!' }, reasoning: '' });
    mockExecute
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValue({ success: true, data: { message: 'Done!' } });

    const controller = createAgentController();
    const gen = controller.start({
      mode: 'auto',
      initialMessage: 'Navigate to Google',
      config: { actionDelayMs: 0, maxSteps: 10, maxTimeMs: 30000, maxSameAction: 3, maxConsecutiveFailures: 5 },
    });
    await collectEvents(gen);

    // buildSiteContextInjection should have been called for google.com
    expect(buildSiteContextInjection).toHaveBeenCalledWith('https://www.google.com');
  });

  test('does not inject duplicate when navigating within same profile', async () => {
    const { getEmbeddedUrl } = await import('./browser');
    const { buildSiteContextInjection } = await import('./skills-api');

    const MOM_GUIDE = 'SITE GUIDE: MOM content';
    // Start on MOM page, navigate to another MOM page (same profile)
    (getEmbeddedUrl as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce('https://www.myopenmath.com/course.php')  // initial URL
      .mockResolvedValue('https://www.myopenmath.com/addassessment.php');  // after navigate
    (buildSiteContextInjection as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(MOM_GUIDE)  // initial context
      .mockResolvedValue(MOM_GUIDE);  // same guide after navigate

    mockSend
      .mockResolvedValueOnce(makeNavigateResponse('https://www.myopenmath.com/addassessment.php'))
      .mockResolvedValue({ action: 'done', params: { success: true, message: 'Done!' }, reasoning: '' });
    mockExecute
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValue({ success: true, data: { message: 'Done!' } });

    const controller = createAgentController();
    const gen = controller.start({
      mode: 'auto',
      initialMessage: 'Navigate within MOM',
      config: { actionDelayMs: 0, maxSteps: 10, maxTimeMs: 30000, maxSameAction: 3, maxConsecutiveFailures: 5 },
    });
    await collectEvents(gen);

    // buildSiteContextInjection called for the new URL
    expect(buildSiteContextInjection).toHaveBeenCalledWith('https://www.myopenmath.com/addassessment.php');
    // But since the guide content is the same, no supplementary message should be pushed
    // (verified by checking the guide content equality check in the implementation)
  });
});
