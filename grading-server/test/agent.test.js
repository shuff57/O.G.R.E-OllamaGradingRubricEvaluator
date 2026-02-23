import { describe, test, expect, vi, beforeEach } from 'vitest';
import { handleAgentRequest } from '../agent.js';

// ---------------------------------------------------------------------------
// Mock context factory
// ---------------------------------------------------------------------------

function makeMockContext(body) {
  let responseData = null;
  let responseStatus = 200;

  const ctx = {
    req: {
      json: async () => {
        if (body instanceof Error) throw body;
        return body;
      },
    },
    json: (data, status = 200) => {
      responseData = data;
      responseStatus = status;
      return { data, status };
    },
    getResponse: () => ({ data: responseData, status: responseStatus }),
  };

  return ctx;
}

// ---------------------------------------------------------------------------
// Default deps
// ---------------------------------------------------------------------------

function makeDefaultDeps(overrides = {}) {
  return {
    callProviderDirect: vi.fn().mockResolvedValue(
      '{"action":"done","params":{"success":true,"message":"ok"},"reasoning":""}'
    ),
    resolveProviderConfig: vi
      .fn()
      .mockReturnValue({ url: 'http://localhost:11434', model: 'llama3' }),
    providerConfigs: [{ id: 'ollama', model: 'llama3', is_active: true }],
    ...overrides,
  };
}

const BASE_MESSAGES = [
  { role: 'system', content: 'You are a browser agent.' },
  { role: 'user', content: 'Click the submit button.' },
];

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe('POST /api/agent validation', () => {
  test('invalid JSON body returns 400', async () => {
    const ctx = makeMockContext(new Error('Unexpected token'));
    await handleAgentRequest(ctx, makeDefaultDeps());
    const { data, status } = ctx.getResponse();
    expect(status).toBe(400);
    expect(data.error).toBe('Invalid JSON body');
  });

  test('missing messages field returns 400', async () => {
    const ctx = makeMockContext({ provider: 'ollama' });
    await handleAgentRequest(ctx, makeDefaultDeps());
    const { data, status } = ctx.getResponse();
    expect(status).toBe(400);
    expect(data.error).toContain('Missing required field: messages');
  });

  test('messages not an array returns 400', async () => {
    const ctx = makeMockContext({ messages: 'not an array' });
    await handleAgentRequest(ctx, makeDefaultDeps());
    const { data, status } = ctx.getResponse();
    expect(status).toBe(400);
    expect(data.error).toContain('Missing required field: messages');
  });

  test('no active provider and no provider field returns 400', async () => {
    const deps = makeDefaultDeps({
      providerConfigs: [{ id: 'ollama', model: 'llama3', is_active: false }],
    });
    const ctx = makeMockContext({ messages: BASE_MESSAGES });
    await handleAgentRequest(ctx, deps);
    const { data, status } = ctx.getResponse();
    expect(status).toBe(400);
    expect(data.error).toBe('No active provider configured');
  });

  test('provider specified but no model returns 400', async () => {
    const deps = makeDefaultDeps({
      providerConfigs: [{ id: 'custom', is_active: false }],
    });
    const ctx = makeMockContext({ provider: 'custom', messages: BASE_MESSAGES });
    await handleAgentRequest(ctx, deps);
    const { data, status } = ctx.getResponse();
    expect(status).toBe(400);
    expect(data.error).toContain('No model specified');
  });
});

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe('POST /api/agent happy path', () => {
  test('basic request with active provider calls callProviderDirect and returns 200', async () => {
    const deps = makeDefaultDeps();
    const ctx = makeMockContext({ messages: BASE_MESSAGES });
    await handleAgentRequest(ctx, deps);
    const { data, status } = ctx.getResponse();
    expect(status).toBe(200);
    expect(data).toHaveProperty('response');
    expect(deps.callProviderDirect).toHaveBeenCalledOnce();
  });

  test('provider and model specified in body override active provider', async () => {
    const deps = makeDefaultDeps({
      providerConfigs: [
        { id: 'ollama', model: 'llama3', is_active: true },
        { id: 'openai', model: 'gpt-4o', is_active: false },
      ],
    });
    const ctx = makeMockContext({
      messages: BASE_MESSAGES,
      provider: 'openai',
      model: 'gpt-4o-mini',
    });
    await handleAgentRequest(ctx, deps);
    expect(deps.resolveProviderConfig).toHaveBeenCalledWith('openai', 'gpt-4o-mini');
  });

  test('DOM context appended to last user message', async () => {
    const deps = makeDefaultDeps();
    const ctx = makeMockContext({
      messages: BASE_MESSAGES,
      dom: 'button#submit [Submit]',
    });
    await handleAgentRequest(ctx, deps);
    expect(deps.callProviderDirect).toHaveBeenCalledOnce();
    const agentMessages = deps.callProviderDirect.mock.calls[0][2];
    const lastMsg = agentMessages[agentMessages.length - 1];
    // Text-only: content is a string
    expect(typeof lastMsg.content).toBe('string');
    expect(lastMsg.content).toContain('CURRENT PAGE INTERACTIVE ELEMENTS');
    expect(lastMsg.content).toContain('button#submit');
  });

  test('screenshot turns last user message into multimodal array', async () => {
    const deps = makeDefaultDeps();
    const ctx = makeMockContext({
      messages: BASE_MESSAGES,
      screenshot: 'data:image/png;base64,abc',
    });
    await handleAgentRequest(ctx, deps);
    const agentMessages = deps.callProviderDirect.mock.calls[0][2];
    const lastMsg = agentMessages[agentMessages.length - 1];
    expect(Array.isArray(lastMsg.content)).toBe(true);
    const types = lastMsg.content.map((c) => c.type);
    expect(types).toContain('text');
    expect(types).toContain('image_url');
    const imgPart = lastMsg.content.find((c) => c.type === 'image_url');
    expect(imgPart.image_url.url).toBe('data:image/png;base64,abc');
  });

  test('both DOM and screenshot: multimodal content includes DOM text and image', async () => {
    const deps = makeDefaultDeps();
    const ctx = makeMockContext({
      messages: BASE_MESSAGES,
      dom: 'button#ok',
      screenshot: 'data:image/png;base64,xyz',
    });
    await handleAgentRequest(ctx, deps);
    const agentMessages = deps.callProviderDirect.mock.calls[0][2];
    const lastMsg = agentMessages[agentMessages.length - 1];
    expect(Array.isArray(lastMsg.content)).toBe(true);
    const textPart = lastMsg.content.find((c) => c.type === 'text');
    expect(textPart.text).toContain('CURRENT PAGE INTERACTIVE ELEMENTS');
    expect(textPart.text).toContain('button#ok');
    const imgPart = lastMsg.content.find((c) => c.type === 'image_url');
    expect(imgPart.image_url.url).toBe('data:image/png;base64,xyz');
  });

  test('no DOM and no screenshot: messages unchanged', async () => {
    const deps = makeDefaultDeps();
    const ctx = makeMockContext({ messages: BASE_MESSAGES });
    await handleAgentRequest(ctx, deps);
    const agentMessages = deps.callProviderDirect.mock.calls[0][2];
    const lastMsg = agentMessages[agentMessages.length - 1];
    // Content should be the original string without any appended context
    expect(lastMsg.content).toBe(BASE_MESSAGES[BASE_MESSAGES.length - 1].content);
  });

  test('callProviderDirect throws returns 500', async () => {
    const deps = makeDefaultDeps({
      callProviderDirect: vi.fn().mockRejectedValue(new Error('Provider down')),
    });
    const ctx = makeMockContext({ messages: BASE_MESSAGES });
    await handleAgentRequest(ctx, deps);
    const { data, status } = ctx.getResponse();
    expect(status).toBe(500);
    expect(data.error).toBe('Provider down');
  });
});

// ---------------------------------------------------------------------------
// Message handling
// ---------------------------------------------------------------------------

describe('POST /api/agent message handling', () => {
  test('last message with assistant role: DOM/screenshot NOT appended', async () => {
    const deps = makeDefaultDeps();
    const messages = [
      { role: 'user', content: 'Start the task' },
      { role: 'assistant', content: 'I will do it.' },
    ];
    const ctx = makeMockContext({
      messages,
      dom: 'button#submit',
      screenshot: 'data:image/png;base64,abc',
    });
    await handleAgentRequest(ctx, deps);
    const agentMessages = deps.callProviderDirect.mock.calls[0][2];
    const lastMsg = agentMessages[agentMessages.length - 1];
    // Should still be the assistant message, untouched
    expect(lastMsg.role).toBe('assistant');
    expect(lastMsg.content).toBe('I will do it.');
  });
});
