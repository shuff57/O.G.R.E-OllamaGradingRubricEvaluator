import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('./agent-dom', () => ({
  captureInteractiveDom: vi.fn().mockResolvedValue([]),
  formatDomForPrompt: vi.fn().mockReturnValue(''),
}));

vi.mock('./browser', () => ({
  captureWebviewScreenshot: vi.fn().mockResolvedValue('data:image/png;base64,abc'),
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

import { sendAgentRequest } from './agent-api';
import { executeAction } from './browser-actions';
import { createAgentController } from './agent-loop';

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

/** Collect events until stopType is found (inclusive), then stop iterating. */
async function runUntil(gen: AsyncGenerator<any>, stopType: string): Promise<any[]> {
  const events: any[] = [];
  for await (const event of gen) {
    events.push(event);
    if (event.type === stopType) break;
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
  test('emits text event and terminates', async () => {
    mockSend.mockResolvedValue({ text: 'Here is my answer' });

    const controller = createAgentController();
    const gen = controller.start({ mode: 'auto', initialMessage: 'Tell me something', config: { actionDelayMs: 0, maxSteps: 10, maxTimeMs: 30000, maxSameAction: 3 } });
    const events = await collectEvents(gen);

    const textEvent = events.find((e) => e.type === 'text');
    expect(textEvent).toBeDefined();
    expect(textEvent.content).toBe('Here is my answer');
    // Generator should have finished (no infinite loop)
    expect(events.length).toBeGreaterThan(0);
    expect(events.filter((e) => e.type === 'text')).toHaveLength(1);
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
