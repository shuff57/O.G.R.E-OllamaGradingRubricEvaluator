// @vitest-environment jsdom
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { smartWalk, buildSmartWalkScript } from './dom-snapshot';
import { loadFixture } from './fixtures/dom-test-helpers';

describe('smartWalk', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    vi.restoreAllMocks();
  });

  // ── 1. Wrapper collapsing ──────────────────────────────────────────────
  it('collapses wrapper divs in messy-wrappers.html', () => {
    loadFixture('messy-wrappers.html');
    const naiveCount = document.body.querySelectorAll('*').length;
    const result = smartWalk(document.body, { skipHidden: false });
    // Wrapper collapsing should reduce node count below naive element count
    expect(result.nodes.length).toBeLessThan(naiveCount);
  });

  // ── 2. Budget enforcement ──────────────────────────────────────────────
  it('maxNodes=5 keeps critical input elements', () => {
    document.body.innerHTML = `
      <div><div><div><div><div>
        <input type="number" name="score" />
        <textarea name="feedback"></textarea>
        <div>noise1</div><div>noise2</div><div>noise3</div>
        <div>noise4</div><div>noise5</div><div>noise6</div>
      </div></div></div></div></div>
    `;
    const result = smartWalk(document.body, { maxNodes: 5, skipHidden: false });
    const inputNodes = result.nodes.filter(n => n.tag === 'input');
    expect(inputNodes.length).toBeGreaterThan(0);
    expect(result.nodes.length).toBeLessThanOrEqual(5);
  });

  // ── 3. Hidden content filtering ────────────────────────────────────────
  describe('visibility filtering', () => {
    let origW: PropertyDescriptor | undefined;
    let origH: PropertyDescriptor | undefined;

    beforeEach(() => {
      origW = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
      origH = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
      Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
        get(this: HTMLElement) {
          return this.classList.contains('hidden-display') ? 0 : 100;
        },
        configurable: true,
      });
      Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
        get(this: HTMLElement) {
          return this.classList.contains('hidden-display') ? 0 : 50;
        },
        configurable: true,
      });
    });

    afterEach(() => {
      if (origW) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', origW);
      if (origH) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', origH);
    });

    it('excludes hidden-display elements when skipHidden=true', () => {
      loadFixture('hidden-content.html');
      const result = smartWalk(document.body, { skipHidden: true });
      const hiddenNodes = result.nodes.filter(n =>
        n.attrs.class?.includes('hidden-display'),
      );
      expect(hiddenNodes.length).toBe(0);
    });

    // ── 15. skipHidden=false includes hidden ─────────────────────────────
    it('skipHidden=false includes previously hidden elements', () => {
      loadFixture('hidden-content.html');
      const resultHidden = smartWalk(document.body, { skipHidden: true });
      const resultAll = smartWalk(document.body, { skipHidden: false });
      expect(resultAll.nodes.length).toBeGreaterThan(resultHidden.nodes.length);
    });
  });

  // ── 4. Sibling deduplication ───────────────────────────────────────────
  it('deduplicates 30 rows in large-page.html', () => {
    loadFixture('large-page.html');
    const result = smartWalk(document.body, { skipHidden: false });
    const studentRows = result.nodes.filter(n =>
      n.attrs.class?.includes('student-row'),
    );
    expect(studentRows.length).toBeLessThan(30);
  });

  // ── 5. Text truncation ────────────────────────────────────────────────
  it('truncates text to maxTextLength (150)', () => {
    const longText = 'A'.repeat(200);
    document.body.innerHTML = `<div id="long">${longText}</div>`;
    const result = smartWalk(document.body, { skipHidden: false });
    const longNode = result.nodes.find(n => n.attrs.id === 'long');
    expect(longNode).toBeDefined();
    expect(longNode!.text!.length).toBeLessThanOrEqual(150);
  });

  // ── 6. Attribute capture ──────────────────────────────────────────────
  it('captures data-lastchange attribute', () => {
    document.body.innerHTML = `<div data-lastchange="1234"><input type="number" /></div>`;
    const result = smartWalk(document.body, { skipHidden: false });
    const node = result.nodes.find(n => n.attrs['data-lastchange'] === '1234');
    expect(node).toBeDefined();
  });

  // ── 9. SnapshotResult structure ───────────────────────────────────────
  it('has nodes array and meta object', () => {
    document.body.innerHTML = '<div>Hello</div>';
    const result = smartWalk(document.body, { skipHidden: false });
    expect(Array.isArray(result.nodes)).toBe(true);
    expect(typeof result.meta).toBe('object');
    expect(result.meta).not.toBeNull();
  });

  // ── 10. meta.totalVisited ─────────────────────────────────────────────
  it('meta.totalVisited is a number >= 0', () => {
    document.body.innerHTML = '<div>Hello</div>';
    const result = smartWalk(document.body, { skipHidden: false });
    expect(typeof result.meta.totalVisited).toBe('number');
    expect(result.meta.totalVisited).toBeGreaterThanOrEqual(0);
  });

  // ── 14. Priority: critical survive tight budget ───────────────────────
  it('critical nodes (input, textarea, data-lastchange) survive tight budget', () => {
    document.body.innerHTML = `
      <div data-lastchange="1"><input type="number" /><textarea></textarea></div>
      <div>noise1</div><div>noise2</div><div>noise3</div>
      <div>noise4</div><div>noise5</div><div>noise6</div>
    `;
    const result = smartWalk(document.body, { maxNodes: 5, skipHidden: false });
    expect(result.nodes.some(n => n.tag === 'input')).toBe(true);
    expect(result.nodes.some(n => n.tag === 'textarea')).toBe(true);
    expect(result.nodes.some(n => n.attrs['data-lastchange'] === '1')).toBe(true);
  });

  // ── 16. charCount ─────────────────────────────────────────────────────
  it('charCount equals JSON.stringify(nodes).length', () => {
    document.body.innerHTML = '<div>Hello</div><p>World</p>';
    const result = smartWalk(document.body, { skipHidden: false });
    expect(result.meta.charCount).toBe(JSON.stringify(result.nodes).length);
  });
});

// ── Bounding box (T9) ─────────────────────────────────────────────────────
describe('bounding box', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  // ── 11. bbox with captureBoundingBoxes=true ───────────────────────────
  it('captures bbox with integer values when enabled', () => {
    document.body.innerHTML = '<div id="test">Hello</div>';
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 10.7, y: 20.3, width: 100.5, height: 50.2,
      top: 20.3, right: 111.2, bottom: 70.5, left: 10.7,
      toJSON() { return ''; },
    } as DOMRect);
    const result = smartWalk(document.body, {
      captureBoundingBoxes: true,
      skipHidden: false,
    });
    const node = result.nodes.find(n => n.attrs.id === 'test');
    expect(node).toBeDefined();
    expect(node!.bbox).toBeDefined();
    expect(node!.bbox!.x).toBe(Math.round(10.7));
    expect(node!.bbox!.y).toBe(Math.round(20.3));
    expect(node!.bbox!.width).toBe(Math.round(100.5));
    expect(node!.bbox!.height).toBe(Math.round(50.2));
    expect(node!.bbox!.visible).toBe(true);
  });

  // ── 12. Zero-size bbox → visible=false ────────────────────────────────
  it('zero-size mock results in visible=false', () => {
    document.body.innerHTML = '<div id="zero">X</div>';
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, width: 0, height: 0,
      top: 0, right: 0, bottom: 0, left: 0,
      toJSON() { return ''; },
    } as DOMRect);
    const result = smartWalk(document.body, {
      captureBoundingBoxes: true,
      skipHidden: false,
    });
    const node = result.nodes.find(n => n.attrs.id === 'zero');
    expect(node?.bbox?.visible).toBe(false);
  });

  // ── 13. No bbox when disabled ─────────────────────────────────────────
  it('no bbox when captureBoundingBoxes is false (default)', () => {
    document.body.innerHTML = '<div>Hello</div>';
    const result = smartWalk(document.body, {
      captureBoundingBoxes: false,
      skipHidden: false,
    });
    const hasBbox = result.nodes.some(n => n.bbox !== undefined);
    expect(hasBbox).toBe(false);
  });
});

// ── buildSmartWalkScript ──────────────────────────────────────────────────
describe('buildSmartWalkScript', () => {
  let origW: PropertyDescriptor | undefined;
  let origH: PropertyDescriptor | undefined;

  beforeEach(() => {
    origW = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
    origH = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
      get(this: HTMLElement) {
        return this.classList.contains('hidden-display') ? 0 : 100;
      },
      configurable: true,
    });
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      get(this: HTMLElement) {
        return this.classList.contains('hidden-display') ? 0 : 50;
      },
      configurable: true,
    });
  });

  afterEach(() => {
    if (origW) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', origW);
    if (origH) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', origH);
  });

  // ── 7. Returns string ─────────────────────────────────────────────────
  it('returns a string', () => {
    const script = buildSmartWalkScript();
    expect(typeof script).toBe('string');
  });

  // ── 8. No import/require ──────────────────────────────────────────────
  it('contains no import or require', () => {
    const script = buildSmartWalkScript();
    expect(/\bimport\b|\brequire\b/.test(script)).toBe(false);
  });

  it('captures hidden inputs with skipHidden=true and assigns hidden-input priority', () => {
    document.body.innerHTML = `
      <form>
        <input class="hidden-display" type="hidden" name="fb_score" value="9" />
        <input class="hidden-display" type="hidden" name="csrf_token" value="abc" />
      </form>
    `;

    const script = buildSmartWalkScript({ skipHidden: true });
    const runScript = Function(`return ${script};`) as () => ReturnType<typeof smartWalk>;
    const result = runScript();

    const fbHidden = result.nodes.find(
      n => n.tag === 'input' && n.attrs.type === 'hidden' && n.attrs.name === 'fb_score',
    );
    const otherHidden = result.nodes.find(
      n => n.tag === 'input' && n.attrs.type === 'hidden' && n.attrs.name === 'csrf_token',
    );

    expect(fbHidden).toBeDefined();
    expect(otherHidden).toBeDefined();
    expect(fbHidden?.priority).toBe('high');
    expect(otherHidden?.priority).toBe('medium');
  });
});
