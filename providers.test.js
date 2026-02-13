import { describe, it, expect, vi } from 'vitest';
import { PROVIDERS } from './providers.js';

describe('PROVIDERS Adapter Logic', () => {

  const mockImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const mockImageDataUrl = `data:image/png;base64,${mockImageBase64}`;

  describe('ollama', () => {
    const provider = PROVIDERS['ollama'];

    it('should strip data uri scheme from images (cloud-style URL)', () => {
      const config = { apiUrl: 'https://api.ollama.com', apiKey: 'test-key', model: 'llama3' };
      const messages = [{
        role: 'user',
        content: 'Describe this image',
        images: [mockImageDataUrl]
      }];

      const req = provider.buildChatRequest(config, messages);
      
      // Ollama expects images array with raw base64
      expect(req.body.messages[0].images[0]).toBe(mockImageBase64);
      expect(req.body.messages[0].images[0]).not.toContain('data:image');
    });

    it('should handle text-only messages', () => {
        const config = { apiUrl: 'https://api.ollama.com', apiKey: 'test-key', model: 'llama3' };
        const messages = [{ role: 'user', content: 'Hello' }];
        const req = provider.buildChatRequest(config, messages);
        expect(req.body.messages[0].content).toBe('Hello');
        expect(req.body.messages[0].images).toBeUndefined();
    });

    it('should strip data uri scheme from images (local URL)', () => {
      const config = { apiUrl: 'http://localhost:11434', model: 'llama3' };
      const messages = [{
        role: 'user',
        content: 'Describe this image',
        images: [mockImageDataUrl]
      }];

      const req = provider.buildChatRequest(config, messages);
      
      expect(req.body.messages[0].images[0]).toBe(mockImageBase64);
      expect(req.body.messages[0].images[0]).not.toContain('data:image');
    });

    it('should default to localhost:11434 when no apiUrl provided', () => {
      const config = { model: 'llama3' };
      const messages = [{ role: 'user', content: 'Hello' }];
      const req = provider.buildChatRequest(config, messages);
      expect(req.url).toBe('http://localhost:11434/api/chat');
    });

    it('should include auth header when apiKey is provided', () => {
      const config = { apiUrl: 'https://cloud.ollama.com', apiKey: 'my-key', model: 'llama3' };
      const messages = [{ role: 'user', content: 'Hello' }];
      const req = provider.buildChatRequest(config, messages);
      expect(req.headers['Authorization']).toBe('Bearer my-key');
    });

    it('should not include auth header when no apiKey', () => {
      const config = { apiUrl: 'http://localhost:11434', model: 'llama3' };
      const messages = [{ role: 'user', content: 'Hello' }];
      const req = provider.buildChatRequest(config, messages);
      expect(req.headers['Authorization']).toBeUndefined();
    });
  });

  describe('openai', () => {
    const provider = PROVIDERS['openai'];
    const config = { apiKey: 'sk-test', model: 'gpt-4o' };

    it('should format images as image_url objects', () => {
      const messages = [{
        role: 'user',
        content: 'Describe this image',
        images: [mockImageDataUrl]
      }];

      const req = provider.buildChatRequest(config, messages);
      
      // OpenAI expects content array
      const content = req.body.messages[0].content;
      expect(Array.isArray(content)).toBe(true);
      expect(content[0]).toEqual({ type: 'text', text: 'Describe this image' });
      expect(content[1]).toEqual({ 
        type: 'image_url', 
        image_url: { url: mockImageDataUrl } // OpenAI WANTS the data uri scheme
      });
    });

    it('should handle raw base64 by adding data uri scheme', () => {
        const messages = [{
          role: 'user',
          content: 'Describe',
          images: [mockImageBase64] // No header
        }];
  
        const req = provider.buildChatRequest(config, messages);
        const imgUrl = req.body.messages[0].content[1].image_url.url;
        expect(imgUrl).toContain('data:image/jpeg;base64,'); // Default added
        expect(imgUrl).toContain(mockImageBase64);
      });
  });

  describe('github-models', () => {
    const provider = PROVIDERS['github-models'];
    const config = { apiKey: 'ghp-test', model: 'gpt-4o' };

    it('should format images as image_url objects', () => {
      const messages = [{
        role: 'user',
        content: 'Describe this image',
        images: [mockImageDataUrl]
      }];

      const req = provider.buildChatRequest(config, messages);
      
      const content = req.body.messages[0].content;
      expect(Array.isArray(content)).toBe(true);
      expect(content[1]).toEqual({ 
        type: 'image_url', 
        image_url: { url: mockImageDataUrl }
      });
    });
  });

});
