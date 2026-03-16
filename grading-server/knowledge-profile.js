import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const KNOWLEDGE_PROFILE_TEMPLATE_PATH = path.join(
  __dirname,
  '../ogre-desktop/src/assets/profile-template.md'
);

export const MINIMAL_TEMPLATE = `---
name: "Site Name — Knowledge Profile"
description: "Agent guide for Site Name"
urlPatterns:
  - "domain.com"
baseUrl: "https://domain.com"
role: "teacher"
---

# Site Name — Agent Navigation Guide

## Site Overview
[What this site is and how it's used]

## Navigation Map
[Key pages and how to get to them]

## CSS Selectors
[Key UI element selectors]

## Tips & Gotchas
- [Important caveats]`;

export function loadKnowledgeProfileTemplate(templatePath = KNOWLEDGE_PROFILE_TEMPLATE_PATH) {
  try {
    return readFileSync(templatePath, 'utf-8');
  } catch {
    return MINIMAL_TEMPLATE;
  }
}

export function buildKnowledgeProfilePrompts({ pageSnapshot, url, existingSelectors, template }) {
  const truncatedSnapshot = `${pageSnapshot.substring(0, 8000)}${pageSnapshot.length > 8000 ? '\n[truncated for length]' : ''}`;

  const systemPrompt = `You are an expert at analyzing web pages and creating structured knowledge profiles for AI automation agents.

Generate a markdown knowledge profile following this exact template format:
${template}

The profile should teach an AI agent how to navigate and operate this site.
Include: site overview, navigation patterns, CSS selectors for key UI elements, step-by-step workflows for common tasks, and tips/gotchas.

IMPORTANT:
- Use YAML frontmatter with name, description, urlPatterns, baseUrl, and role fields
- Extract REAL CSS selectors visible in the page HTML
- Keep the profile concise but actionable
- Output ONLY the markdown profile, no additional commentary`;

  const userMessage = `URL: ${url || 'Unknown'}

Page HTML snapshot:
${truncatedSnapshot}${existingSelectors ? `\n\nAlready-discovered CSS selectors: ${JSON.stringify(existingSelectors)}` : ''}

Generate a knowledge profile for this page.`;

  return { systemPrompt, userMessage };
}

export function extractKnowledgeProfileSiteName(markdown, url) {
  const nameMatch = markdown.match(/^name:\s*["']?([^"'\n]+)["']?/m);
  return nameMatch ? nameMatch[1].trim() : (url || 'Unknown Site');
}

function resolveActiveProvider(providerConfigs, provider, model) {
  let providerId = provider;
  let effectiveModel = model;

  if (!providerId) {
    const activeProvider = providerConfigs.find((p) => p.is_active);
    if (!activeProvider) {
      throw new Error('No active provider configured. Set a provider or pass provider in request.');
    }
    providerId = activeProvider.id;
    if (!effectiveModel) effectiveModel = activeProvider.model;
  }

  if (!effectiveModel) {
    const configuredProvider = providerConfigs.find((p) => p.id === providerId);
    effectiveModel = configuredProvider?.model;
    if (!effectiveModel) {
      throw new Error('No model specified and no default model for provider');
    }
  }

  return { providerId, effectiveModel };
}

export function registerKnowledgeProfileRoute(app, {
  providerConfigs,
  resolveProviderConfig,
  callProviderDirect,
  withRetry,
  loadTemplate = loadKnowledgeProfileTemplate,
}) {
  const timestamp = () => new Date().toLocaleTimeString();

  app.post('/api/generate-knowledge-profile', async (c) => {
    let body;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const { pageSnapshot, url, existingSelectors, provider, model } = body;

    if (!pageSnapshot || !pageSnapshot.trim()) {
      return c.json({ error: 'pageSnapshot is required' }, 400);
    }

    let providerId;
    let effectiveModel;
    try {
      ({ providerId, effectiveModel } = resolveActiveProvider(providerConfigs, provider, model));
    } catch (error) {
      return c.json({ error: error.message }, 400);
    }

    const template = loadTemplate();
    const { systemPrompt, userMessage } = buildKnowledgeProfilePrompts({
      pageSnapshot,
      url,
      existingSelectors,
      template,
    });

    try {
      const providerConfig = resolveProviderConfig(providerId, effectiveModel);
      console.log(`[${timestamp()}] [knowledge-profile] Generating | provider=${providerId} model=${effectiveModel}`);
      const markdown = await withRetry(
        () => callProviderDirect(providerId, providerConfig, [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ], timestamp()),
        { maxRetries: 3 }
      );

      return c.json({
        markdown,
        metadata: {
          site: extractKnowledgeProfileSiteName(markdown, url),
          pagesAnalyzed: 1,
        },
      });
    } catch (error) {
      return c.json({ error: error.message || 'Generation failed' }, 500);
    }
  });
}
