/**
 * agent.js - Browser agent endpoint handler
 * POST /api/agent
 */

export async function handleAgentRequest(c, { callProviderDirect, resolveProviderConfig, providerConfigs }) {
  const timestamp = () => new Date().toLocaleTimeString();

  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { messages, dom, screenshot, model, provider } = body;

  if (!messages || !Array.isArray(messages)) {
    return c.json({ error: 'Missing required field: messages (must be array)' }, 400);
  }

  // Resolve provider (active or specified)
  let providerId = provider;
  let effectiveModel = model;
  if (!providerId) {
    const activeProvider = providerConfigs.find(p => p.is_active);
    if (!activeProvider) {
      return c.json({ error: 'No active provider configured' }, 400);
    }
    providerId = activeProvider.id;
    if (!effectiveModel) effectiveModel = activeProvider.model;
  }
  if (!effectiveModel) {
    const p = providerConfigs.find(pc => pc.id === providerId);
    effectiveModel = p?.model;
    if (!effectiveModel) {
      return c.json({ error: 'No model specified and no default model for provider' }, 400);
    }
  }

  // Build the last user message with page context appended
  const agentMessages = [...messages];

  // Append DOM snapshot and screenshot to the last user message
  if (agentMessages.length > 0) {
    const lastMsg = agentMessages[agentMessages.length - 1];
    if (lastMsg.role === 'user') {
      let contextText = '';
      if (dom) contextText += '\n\nCURRENT PAGE INTERACTIVE ELEMENTS:\n' + dom;

      if (screenshot) {
        // Vision message: replace last user message with multimodal content
        const textContent = (typeof lastMsg.content === 'string' ? lastMsg.content : '') + contextText;
        agentMessages[agentMessages.length - 1] = {
          role: 'user',
          content: [
            { type: 'text', text: textContent },
            { type: 'image_url', image_url: { url: screenshot } }
          ]
        };
      } else if (contextText) {
        // Text-only context: append to content
        agentMessages[agentMessages.length - 1] = {
          ...lastMsg,
          content: (typeof lastMsg.content === 'string' ? lastMsg.content : '') + contextText
        };
      }
    }
  }

  try {
    const providerConfig = resolveProviderConfig(providerId, effectiveModel);
    console.log(`[${timestamp()}] [agent] provider=${providerId} model=${effectiveModel} messages=${agentMessages.length}`);

    // Strip base64 images from all messages except the last to prevent context overflow.
    // Ollama returns 500 (not 413) when the context window is exceeded by accumulated screenshots.
    const trimmedMessages = agentMessages.map((msg, idx) => {
      if (idx === agentMessages.length - 1) return msg;
      if (Array.isArray(msg.content)) {
        const textOnly = msg.content
          .filter(p => p.type === 'text')
          .map(p => p.text)
          .join('');
        return { role: msg.role, content: textOnly };
      }
      return msg;
    });

    // Cap total payload at ~120KB by dropping oldest non-system messages.
    const MAX_PAYLOAD_BYTES = 120 * 1024;
    let finalMessages = trimmedMessages;
    while (JSON.stringify(finalMessages).length > MAX_PAYLOAD_BYTES && finalMessages.length > 2) {
      finalMessages = [finalMessages[0], ...finalMessages.slice(2)];
    }

    const aiText = await callProviderDirect(providerId, providerConfig, finalMessages, timestamp());

    return c.json({ response: aiText });
  } catch (error) {
    console.error(`[${timestamp()}] [agent] Error:`, error.message);
    return c.json({ error: error.message }, 500);
  }
}
