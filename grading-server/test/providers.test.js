import { describe, test, expect } from 'vitest';
import {
  buildOllamaRequest,
  buildOpenAIRequest,
  buildAnthropicRequest,
  buildGoogleGeminiRequest,
  parseOllamaResponse,
  parseOpenAIResponse,
  parseAnthropicResponse,
  parseGoogleGeminiResponse,
} from '../providers.js';

describe('Provider Request Builders', () => {
  const messages = [
    { role: 'system', content: 'You are a grading assistant.' },
    { role: 'user', content: 'Grade this work.' },
  ];

  describe('buildOllamaRequest', () => {
    test('creates correct URL with base URL', () => {
      const config = { apiUrl: 'https://api.ollama.com', model: 'llama3' };
      const result = buildOllamaRequest(config, messages);
      
      expect(result.url).toBe('https://api.ollama.com/api/chat');
    });

    test('includes Authorization header when apiKey provided', () => {
      const config = { apiUrl: 'https://api.ollama.com', apiKey: 'test-key', model: 'llama3' };
      const result = buildOllamaRequest(config, messages);
      
      expect(result.headers['Authorization']).toBe('Bearer test-key');
    });

    test('omits Authorization header when no apiKey', () => {
      const config = { apiUrl: 'http://localhost:11434', model: 'llama3' };
      const result = buildOllamaRequest(config, messages);
      
      expect(result.headers['Authorization']).toBeUndefined();
    });

    test('includes Content-Type header', () => {
      const config = { apiUrl: 'https://api.ollama.com', model: 'llama3' };
      const result = buildOllamaRequest(config, messages);
      
      expect(result.headers['Content-Type']).toBe('application/json');
    });

    test('creates body with model and messages', () => {
      const config = { apiUrl: 'https://api.ollama.com', model: 'llama3' };
      const result = buildOllamaRequest(config, messages);
      
      expect(result.body.model).toBe('llama3');
      expect(result.body.messages).toEqual(messages);
      expect(result.body.stream).toBe(false);
    });

    test('normalizes base URL by removing trailing slash', () => {
      const config = { apiUrl: 'https://api.ollama.com/', model: 'llama3' };
      const result = buildOllamaRequest(config, messages);
      
      expect(result.url).toBe('https://api.ollama.com/api/chat');
    });
  });

  describe('buildOpenAIRequest', () => {
    test('creates correct URL', () => {
      const config = { apiKey: 'sk-test', model: 'gpt-4o' };
      const result = buildOpenAIRequest(config, messages);
      
      expect(result.url).toBe('https://api.openai.com/v1/chat/completions');
    });

    test('includes Authorization header with Bearer token', () => {
      const config = { apiKey: 'sk-test', model: 'gpt-4o' };
      const result = buildOpenAIRequest(config, messages);
      
      expect(result.headers['Authorization']).toBe('Bearer sk-test');
    });

    test('includes Content-Type header', () => {
      const config = { apiKey: 'sk-test', model: 'gpt-4o' };
      const result = buildOpenAIRequest(config, messages);
      
      expect(result.headers['Content-Type']).toBe('application/json');
    });

    test('creates body with model and messages', () => {
      const config = { apiKey: 'sk-test', model: 'gpt-4o' };
      const result = buildOpenAIRequest(config, messages);
      
      expect(result.body.model).toBe('gpt-4o');
      expect(result.body.messages).toEqual(messages);
      expect(result.body.stream).toBe(false);
    });
  });

  describe('buildAnthropicRequest', () => {
    test('creates correct URL', () => {
      const config = { apiKey: 'sk-ant-test', model: 'claude-sonnet-4-20250514' };
      const result = buildAnthropicRequest(config, messages);
      
      expect(result.url).toBe('https://api.anthropic.com/v1/messages');
    });

    test('includes x-api-key header', () => {
      const config = { apiKey: 'sk-ant-test', model: 'claude-sonnet-4-20250514' };
      const result = buildAnthropicRequest(config, messages);
      
      expect(result.headers['x-api-key']).toBe('sk-ant-test');
    });

    test('includes anthropic-version header', () => {
      const config = { apiKey: 'sk-ant-test', model: 'claude-sonnet-4-20250514' };
      const result = buildAnthropicRequest(config, messages);
      
      expect(result.headers['anthropic-version']).toBe('2023-06-01');
    });

    test('includes Content-Type header', () => {
      const config = { apiKey: 'sk-ant-test', model: 'claude-sonnet-4-20250514' };
      const result = buildAnthropicRequest(config, messages);
      
      expect(result.headers['Content-Type']).toBe('application/json');
    });

    test('separates system message from user messages', () => {
      const config = { apiKey: 'sk-ant-test', model: 'claude-sonnet-4-20250514' };
      const result = buildAnthropicRequest(config, messages);
      
      expect(result.body.system).toBe('You are a grading assistant.');
      expect(result.body.messages).toEqual([{ role: 'user', content: 'Grade this work.' }]);
    });

    test('includes model and max_tokens', () => {
      const config = { apiKey: 'sk-ant-test', model: 'claude-sonnet-4-20250514' };
      const result = buildAnthropicRequest(config, messages);
      
      expect(result.body.model).toBe('claude-sonnet-4-20250514');
      expect(result.body.max_tokens).toBe(4096);
    });

    test('handles messages without system message', () => {
      const config = { apiKey: 'sk-ant-test', model: 'claude-sonnet-4-20250514' };
      const userOnlyMessages = [{ role: 'user', content: 'Grade this work.' }];
      const result = buildAnthropicRequest(config, userOnlyMessages);
      
      expect(result.body.system).toBeUndefined();
      expect(result.body.messages).toEqual(userOnlyMessages);
    });
  });

  describe('buildGoogleGeminiRequest', () => {
    test('creates correct URL with API key', () => {
      const config = { apiKey: 'AIza-test', model: 'gemini-1.5-pro' };
      const result = buildGoogleGeminiRequest(config, messages);
      
      expect(result.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=AIza-test');
    });

    test('includes Content-Type header', () => {
      const config = { apiKey: 'AIza-test', model: 'gemini-1.5-pro' };
      const result = buildGoogleGeminiRequest(config, messages);
      
      expect(result.headers['Content-Type']).toBe('application/json');
    });

    test('converts system message to systemInstruction', () => {
      const config = { apiKey: 'AIza-test', model: 'gemini-1.5-pro' };
      const result = buildGoogleGeminiRequest(config, messages);
      
      expect(result.body.systemInstruction).toEqual({
        parts: [{ text: 'You are a grading assistant.' }]
      });
    });

    test('converts user messages to Gemini format', () => {
      const config = { apiKey: 'AIza-test', model: 'gemini-1.5-pro' };
      const result = buildGoogleGeminiRequest(config, messages);
      
      expect(result.body.contents).toEqual([
        { role: 'user', parts: [{ text: 'Grade this work.' }] }
      ]);
    });

    test('converts assistant role to model role', () => {
      const config = { apiKey: 'AIza-test', model: 'gemini-1.5-pro' };
      const messagesWithAssistant = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' },
      ];
      const result = buildGoogleGeminiRequest(config, messagesWithAssistant);
      
      expect(result.body.contents).toEqual([
        { role: 'user', parts: [{ text: 'Hello' }] },
        { role: 'model', parts: [{ text: 'Hi there' }] }
      ]);
    });

    test('handles messages without system message', () => {
      const config = { apiKey: 'AIza-test', model: 'gemini-1.5-pro' };
      const userOnlyMessages = [{ role: 'user', content: 'Grade this work.' }];
      const result = buildGoogleGeminiRequest(config, userOnlyMessages);
      
      expect(result.body.systemInstruction).toBeUndefined();
      expect(result.body.contents).toEqual([
        { role: 'user', parts: [{ text: 'Grade this work.' }] }
      ]);
    });
  });
});

describe('Provider Response Parsers', () => {
  describe('parseOllamaResponse', () => {
    test('extracts content from valid response', () => {
      const data = {
        message: {
          role: 'assistant',
          content: 'Score: 8/10\nGood work!'
        }
      };
      
      const result = parseOllamaResponse(data);
      expect(result).toBe('Score: 8/10\nGood work!');
    });

    test('throws error when message is missing', () => {
      const data = {};
      
      expect(() => parseOllamaResponse(data)).toThrow('Invalid Ollama response: missing message.content');
    });

    test('throws error when content is missing', () => {
      const data = { message: { role: 'assistant' } };
      
      expect(() => parseOllamaResponse(data)).toThrow('Invalid Ollama response: missing message.content');
    });
  });

  describe('parseOpenAIResponse', () => {
    test('extracts content from valid response', () => {
      const data = {
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Score: 9/10\nExcellent!'
            }
          }
        ]
      };
      
      const result = parseOpenAIResponse(data);
      expect(result).toBe('Score: 9/10\nExcellent!');
    });

    test('throws error when choices is missing', () => {
      const data = {};
      
      expect(() => parseOpenAIResponse(data)).toThrow('Invalid OpenAI response: missing choices[0].message.content');
    });

    test('throws error when choices is empty', () => {
      const data = { choices: [] };
      
      expect(() => parseOpenAIResponse(data)).toThrow('Invalid OpenAI response: missing choices[0].message.content');
    });

    test('throws error when message is missing', () => {
      const data = { choices: [{}] };
      
      expect(() => parseOpenAIResponse(data)).toThrow('Invalid OpenAI response: missing choices[0].message.content');
    });

    test('throws error when content is missing', () => {
      const data = { choices: [{ message: { role: 'assistant' } }] };
      
      expect(() => parseOpenAIResponse(data)).toThrow('Invalid OpenAI response: missing choices[0].message.content');
    });
  });

  describe('parseAnthropicResponse', () => {
    test('extracts text from valid response', () => {
      const data = {
        content: [
          {
            type: 'text',
            text: 'Score: 7/10\nNeeds improvement.'
          }
        ]
      };
      
      const result = parseAnthropicResponse(data);
      expect(result).toBe('Score: 7/10\nNeeds improvement.');
    });

    test('throws error when content is missing', () => {
      const data = {};
      
      expect(() => parseAnthropicResponse(data)).toThrow('Invalid Anthropic response: missing content[0].text');
    });

    test('throws error when content is empty', () => {
      const data = { content: [] };
      
      expect(() => parseAnthropicResponse(data)).toThrow('Invalid Anthropic response: missing content[0].text');
    });

    test('throws error when text is missing', () => {
      const data = { content: [{ type: 'text' }] };
      
      expect(() => parseAnthropicResponse(data)).toThrow('Invalid Anthropic response: missing content[0].text');
    });
  });

  describe('parseGoogleGeminiResponse', () => {
    test('extracts text from valid response', () => {
      const data = {
        candidates: [
          {
            content: {
              parts: [
                { text: 'Score: 10/10\nPerfect!' }
              ]
            }
          }
        ]
      };
      
      const result = parseGoogleGeminiResponse(data);
      expect(result).toBe('Score: 10/10\nPerfect!');
    });

    test('throws error when candidates is missing', () => {
      const data = {};
      
      expect(() => parseGoogleGeminiResponse(data)).toThrow('Invalid Google Gemini response: missing candidates[0].content.parts[0].text');
    });

    test('throws error when candidates is empty', () => {
      const data = { candidates: [] };
      
      expect(() => parseGoogleGeminiResponse(data)).toThrow('Invalid Google Gemini response: missing candidates[0].content.parts[0].text');
    });

    test('throws error when content is missing', () => {
      const data = { candidates: [{}] };
      
      expect(() => parseGoogleGeminiResponse(data)).toThrow('Invalid Google Gemini response: missing candidates[0].content.parts[0].text');
    });

    test('throws error when parts is missing', () => {
      const data = { candidates: [{ content: {} }] };
      
      expect(() => parseGoogleGeminiResponse(data)).toThrow('Invalid Google Gemini response: missing candidates[0].content.parts[0].text');
    });

    test('throws error when parts is empty', () => {
      const data = { candidates: [{ content: { parts: [] } }] };
      
      expect(() => parseGoogleGeminiResponse(data)).toThrow('Invalid Google Gemini response: missing candidates[0].content.parts[0].text');
    });

    test('throws error when text is missing', () => {
      const data = { candidates: [{ content: { parts: [{}] } }] };
      
      expect(() => parseGoogleGeminiResponse(data)).toThrow('Invalid Google Gemini response: missing candidates[0].content.parts[0].text');
    });
  });
});
