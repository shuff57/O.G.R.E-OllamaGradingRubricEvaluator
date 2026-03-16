import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import {
  MINIMAL_TEMPLATE,
  buildKnowledgeProfilePrompts,
  extractKnowledgeProfileSiteName,
  loadKnowledgeProfileTemplate,
  registerKnowledgeProfileRoute,
} from '../knowledge-profile.js';

function createTestApp(options = {}) {
  const app = new Hono();
  const providerConfigs = options.providerConfigs ?? [
    { id: 'ollama', model: 'llama3.2', is_active: true },
  ];

  registerKnowledgeProfileRoute(app, {
    providerConfigs,
    loadTemplate: options.loadTemplate,
    resolveProviderConfig: options.resolveProviderConfig ?? ((provider, model) => ({
      apiUrl: 'http://localhost:11434',
      apiKey: '',
      model,
      provider,
    })),
    callProviderDirect: options.callProviderDirect ?? (async () => '---\nname: "Example Site"\n---\n# Example Site'),
    withRetry: options.withRetry ?? (async (fn) => fn()),
  });

  return app;
}

describe('buildKnowledgeProfilePrompts', () => {
  it('truncates page snapshots to 8000 characters and includes selectors', () => {
    const longSnapshot = 'a'.repeat(8100);
    const { systemPrompt, userMessage } = buildKnowledgeProfilePrompts({
      pageSnapshot: longSnapshot,
      url: 'https://example.com/grades',
      existingSelectors: { submit: 'button.save' },
      template: '---\nname: Example\n---',
    });

    expect(systemPrompt).toContain('Generate a markdown knowledge profile following this exact template format');
    expect(userMessage).toContain('https://example.com/grades');
    expect(userMessage).toContain('[truncated for length]');
    expect(userMessage).toContain('button.save');
    expect(userMessage).not.toContain('a'.repeat(8001));
  });
});

describe('loadKnowledgeProfileTemplate', () => {
  it('falls back to the inline template when the file is missing', () => {
    const template = loadKnowledgeProfileTemplate('/definitely/missing/template.md');
    expect(template).toBe(MINIMAL_TEMPLATE);
    expect(template).toContain('Knowledge Profile');
  });
});

describe('extractKnowledgeProfileSiteName', () => {
  it('extracts the name field from markdown frontmatter', () => {
    const markdown = '---\nname: "MyOpenMath"\nbaseUrl: "https://www.myopenmath.com"\n---\n# Guide';
    expect(extractKnowledgeProfileSiteName(markdown, 'https://www.myopenmath.com')).toBe('MyOpenMath');
  });

  it('falls back to the URL when no name field exists', () => {
    expect(extractKnowledgeProfileSiteName('# Guide', 'https://example.com')).toBe('https://example.com');
  });
});

describe('POST /api/generate-knowledge-profile', () => {
  it('returns 400 when pageSnapshot is empty', async () => {
    const app = createTestApp();
    const res = await app.request('/api/generate-knowledge-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageSnapshot: '   ', url: '' }),
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'pageSnapshot is required' });
  });

  it('returns markdown and metadata using the configured provider pattern', async () => {
    let capturedProvider;
    let capturedConfig;
    let capturedMessages;

    const app = createTestApp({
      callProviderDirect: async (provider, config, messages) => {
        capturedProvider = provider;
        capturedConfig = config;
        capturedMessages = messages;
        return '---\nname: "Canvas"\nbaseUrl: "https://canvas.example"\n---\n# Canvas';
      },
    });

    const res = await app.request('/api/generate-knowledge-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pageSnapshot: '<html><button class="save">Save</button></html>',
        url: 'https://canvas.example/grades',
      }),
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      markdown: '---\nname: "Canvas"\nbaseUrl: "https://canvas.example"\n---\n# Canvas',
      metadata: {
        site: 'Canvas',
        pagesAnalyzed: 1,
      },
    });
    expect(capturedProvider).toBe('ollama');
    expect(capturedConfig.model).toBe('llama3.2');
    expect(capturedMessages).toHaveLength(2);
    expect(capturedMessages[0].role).toBe('system');
    expect(capturedMessages[1].content).toContain('Save');
  });
});
