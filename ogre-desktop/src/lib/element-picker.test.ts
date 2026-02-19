import { describe, it, expect, beforeEach, vi, type MockedFunction } from 'vitest';

vi.mock('./browser', () => ({
  evalScript: vi.fn(),
  evalScriptJSON: vi.fn(),
}));

import {
  ELEMENT_PICKER_INJECT_JS,
  ElementPickerResult,
  startElementPicker,
  stopElementPicker,
  parsePickerResult,
} from './element-picker';
import { evalScript, evalScriptJSON } from './browser';

const mockedEvalScript = evalScript as MockedFunction<typeof evalScript>;
const mockedEvalScriptJSON = evalScriptJSON as MockedFunction<typeof evalScriptJSON>;

describe('element-picker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('ELEMENT_PICKER_INJECT_JS', () => {
    it('should be a valid JavaScript string', () => {
      expect(typeof ELEMENT_PICKER_INJECT_JS).toBe('string');
      expect(ELEMENT_PICKER_INJECT_JS.length).toBeGreaterThan(0);
    });

    it('should contain IIFE wrapper', () => {
      expect(ELEMENT_PICKER_INJECT_JS).toMatch(/^\s*\(\s*function\s*\(\s*\)\s*\{/);
      expect(ELEMENT_PICKER_INJECT_JS).toMatch(/\}\s*\)\s*\(\s*\)\s*;\s*$/);
    });

    it('should prevent double-injection', () => {
      expect(ELEMENT_PICKER_INJECT_JS).toContain('_ogreElementPicker');
      expect(ELEMENT_PICKER_INJECT_JS).toContain('if (window._ogreElementPicker) return');
    });

    it('should create overlay element', () => {
      expect(ELEMENT_PICKER_INJECT_JS).toContain('overlay');
      expect(ELEMENT_PICKER_INJECT_JS).toContain('position:fixed');
      expect(ELEMENT_PICKER_INJECT_JS).toContain('z-index:2147483646');
    });

    it('should create highlight element', () => {
      expect(ELEMENT_PICKER_INJECT_JS).toContain('highlight');
      expect(ELEMENT_PICKER_INJECT_JS).toContain('border:3px solid #58a6ff');
    });

    it('should create tooltip element', () => {
      expect(ELEMENT_PICKER_INJECT_JS).toContain('tooltip');
      expect(ELEMENT_PICKER_INJECT_JS).toContain('JetBrains Mono');
    });

    it('should create banner element', () => {
      expect(ELEMENT_PICKER_INJECT_JS).toContain('banner');
      expect(ELEMENT_PICKER_INJECT_JS).toContain('Click an element to select it');
    });

    it('should handle mousemove events', () => {
      expect(ELEMENT_PICKER_INJECT_JS).toContain('mousemove');
      expect(ELEMENT_PICKER_INJECT_JS).toContain('elementFromPoint');
    });

    it('should handle click events', () => {
      expect(ELEMENT_PICKER_INJECT_JS).toContain('click');
      expect(ELEMENT_PICKER_INJECT_JS).toContain('_ogreElementPickerResult');
    });

    it('should handle Escape key', () => {
      expect(ELEMENT_PICKER_INJECT_JS).toContain('Escape');
      expect(ELEMENT_PICKER_INJECT_JS).toContain('_ogreElementPickerCancelled');
    });

    it('should store result in window._ogreElementPickerResult', () => {
      expect(ELEMENT_PICKER_INJECT_JS).toContain('window._ogreElementPickerResult');
    });

    it('should include generateSelector function', () => {
      expect(ELEMENT_PICKER_INJECT_JS).toContain('function generateSelector');
    });

    it('should expose cleanup for external stop', () => {
      expect(ELEMENT_PICKER_INJECT_JS).toContain('_ogreElementPickerCleanup');
    });

    it('should include generateParentSelector function', () => {
      expect(ELEMENT_PICKER_INJECT_JS).toContain('function generateParentSelector');
    });
  });

  describe('ElementPickerResult interface', () => {
    it('should have required properties', () => {
      const result: ElementPickerResult = {
        selector: '.my-element',
        tagName: 'div',
        rect: {
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          top: 0,
          left: 0,
          bottom: 50,
          right: 100,
          toJSON: () => ({}),
        },
      };

      expect(result.selector).toBe('.my-element');
      expect(result.tagName).toBe('div');
      expect(result.rect).toBeDefined();
    });

    it('should have optional id property', () => {
      const result: ElementPickerResult = {
        selector: '#my-id',
        tagName: 'button',
        id: 'my-id',
        rect: {
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          top: 0,
          left: 0,
          bottom: 50,
          right: 100,
          toJSON: () => ({}),
        },
      };

      expect(result.id).toBe('my-id');
    });

    it('should have optional classes property', () => {
      const result: ElementPickerResult = {
        selector: '.btn.primary',
        tagName: 'button',
        classes: ['btn', 'primary'],
        rect: {
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          top: 0,
          left: 0,
          bottom: 50,
          right: 100,
          toJSON: () => ({}),
        },
      };

      expect(result.classes).toEqual(['btn', 'primary']);
    });
  });

  describe('startElementPicker', () => {
    it('should be a function', () => {
      expect(typeof startElementPicker).toBe('function');
    });

    it('should inject picker script via evalScript', async () => {
      const mockResult = {
        selector: '#test',
        tagName: 'div',
        rect: { x: 0, y: 0, width: 100, height: 50, top: 0, left: 0, bottom: 50, right: 100 },
      };

      mockedEvalScript.mockResolvedValue('');
      mockedEvalScriptJSON.mockResolvedValueOnce({ result: mockResult, cancelled: false });

      const result = await startElementPicker();

      expect(mockedEvalScript).toHaveBeenCalledWith(ELEMENT_PICKER_INJECT_JS);
      expect(result.selector).toBe('#test');
    });

    it('should reject when cancelled', async () => {
      mockedEvalScript.mockResolvedValue('');
      mockedEvalScriptJSON.mockResolvedValueOnce({ result: null, cancelled: true });

      await expect(startElementPicker()).rejects.toThrow('Element picker cancelled');
    });

    it('should return ElementPickerResult on success', async () => {
      const mockResult = {
        selector: '.my-element',
        tagName: 'div',
        id: 'test',
        classes: ['my-element'],
        rect: { x: 10, y: 20, width: 100, height: 50, top: 20, left: 10, bottom: 70, right: 110 },
      };

      mockedEvalScript.mockResolvedValue('');
      mockedEvalScriptJSON.mockResolvedValueOnce({ result: mockResult, cancelled: false });

      const result = await startElementPicker();
      expect(result.selector).toBe('.my-element');
      expect(result.tagName).toBe('div');
      expect(result.id).toBe('test');
      expect(result.classes).toEqual(['my-element']);
      expect(result.rect).toBeDefined();
    });

    it('should poll until result is available', async () => {
      const mockResult = {
        selector: '#delayed',
        tagName: 'span',
        rect: { x: 0, y: 0, width: 50, height: 25, top: 0, left: 0, bottom: 25, right: 50 },
      };

      mockedEvalScript.mockResolvedValue('');
      // First poll: no result, second poll: result
      mockedEvalScriptJSON
        .mockResolvedValueOnce({ result: null, cancelled: false })
        .mockResolvedValueOnce({ result: mockResult, cancelled: false });

      const result = await startElementPicker();
      expect(result.selector).toBe('#delayed');
      expect(mockedEvalScriptJSON).toHaveBeenCalledTimes(2);
    });
  });

  describe('stopElementPicker', () => {
    it('should be a function', () => {
      expect(typeof stopElementPicker).toBe('function');
    });

    it('should call evalScript to cleanup', async () => {
      mockedEvalScript.mockResolvedValue('');
      await stopElementPicker();
      expect(mockedEvalScript).toHaveBeenCalled();
      const script = mockedEvalScript.mock.calls[0][0];
      expect(script).toContain('_ogreElementPickerCleanup');
      expect(script).toContain('_ogreElementPicker');
    });
  });

  describe('parsePickerResult', () => {
    it('should be a function', () => {
      expect(typeof parsePickerResult).toBe('function');
    });

    it('should parse valid result', () => {
      const raw = {
        selector: '.test',
        tagName: 'div',
        rect: { x: 0, y: 0, width: 100, height: 50, top: 0, left: 0, bottom: 50, right: 100 },
      };
      const result = parsePickerResult(raw);
      expect(result.selector).toBe('.test');
      expect(result.tagName).toBe('div');
      expect(result.rect).toBeDefined();
    });

    it('should throw on null/undefined', () => {
      expect(() => parsePickerResult(null)).toThrow('Invalid picker result');
      expect(() => parsePickerResult(undefined)).toThrow('Invalid picker result');
    });

    it('should throw on missing selector', () => {
      expect(() => parsePickerResult({ tagName: 'div', rect: {} })).toThrow('missing selector');
    });

    it('should throw on missing tagName', () => {
      expect(() => parsePickerResult({ selector: '.x', rect: {} })).toThrow('missing tagName');
    });

    it('should throw on missing rect', () => {
      expect(() => parsePickerResult({ selector: '.x', tagName: 'div' })).toThrow('missing rect');
    });

    it('should handle optional id and classes', () => {
      const raw = {
        selector: '#my-id.cls1.cls2',
        tagName: 'button',
        id: 'my-id',
        classes: ['cls1', 'cls2'],
        rect: { x: 10, y: 20, width: 100, height: 50, top: 20, left: 10, bottom: 70, right: 110 },
      };
      const result = parsePickerResult(raw);
      expect(result.id).toBe('my-id');
      expect(result.classes).toEqual(['cls1', 'cls2']);
    });

    it('should omit id when not a string', () => {
      const raw = {
        selector: '.test',
        tagName: 'div',
        id: 123,
        rect: { x: 0, y: 0, width: 50, height: 25, top: 0, left: 0, bottom: 25, right: 50 },
      };
      const result = parsePickerResult(raw);
      expect(result.id).toBeUndefined();
    });

    it('should omit classes when not an array', () => {
      const raw = {
        selector: '.test',
        tagName: 'div',
        classes: 'not-an-array',
        rect: { x: 0, y: 0, width: 50, height: 25, top: 0, left: 0, bottom: 25, right: 50 },
      };
      const result = parsePickerResult(raw);
      expect(result.classes).toBeUndefined();
    });
  });
});
