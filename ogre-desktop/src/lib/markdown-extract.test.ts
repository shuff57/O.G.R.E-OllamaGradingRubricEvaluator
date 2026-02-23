import { describe, test, expect } from 'vitest';
import { htmlToMarkdownDirect } from './markdown-extract';

describe('htmlToMarkdownDirect', () => {
  // Test 1: Table conversion
  test('converts HTML tables to markdown tables', () => {
    const html = `
      <table>
        <tr>
          <th>Name</th>
          <th>Score</th>
        </tr>
        <tr>
          <td>Alice</td>
          <td>95</td>
        </tr>
        <tr>
          <td>Bob</td>
          <td>87</td>
        </tr>
      </table>
    `;
    const result = htmlToMarkdownDirect(html);
    expect(result).toContain('| Name | Score |');
    expect(result).toContain('| Alice | 95 |');
    expect(result).toContain('| Bob | 87 |');
  });

  // Test 2: H1 heading
  test('converts h1 heading to markdown h1', () => {
    const html = '<h1>Main Title</h1>';
    const result = htmlToMarkdownDirect(html);
    expect(result.trim()).toBe('# Main Title');
  });

  // Test 3: H2 heading
  test('converts h2 heading to markdown h2', () => {
    const html = '<h2>Subtitle</h2>';
    const result = htmlToMarkdownDirect(html);
    expect(result.trim()).toBe('## Subtitle');
  });

  // Test 4: H3 heading
  test('converts h3 heading to markdown h3', () => {
    const html = '<h3>Section</h3>';
    const result = htmlToMarkdownDirect(html);
    expect(result.trim()).toBe('### Section');
  });

  // Test 5: Unordered list
  test('converts unordered list to markdown list', () => {
    const html = `
      <ul>
        <li>Item A</li>
        <li>Item B</li>
        <li>Item C</li>
      </ul>
    `;
    const result = htmlToMarkdownDirect(html);
    expect(result).toContain('Item A');
    expect(result).toContain('Item B');
    expect(result).toContain('Item C');
    // Turndown uses * or - for lists
    expect(result).toMatch(/[*\-]\s+Item A/);
  });

  // Test 6: Ordered list
  test('converts ordered list to markdown numbered list', () => {
    const html = `
      <ol>
        <li>First</li>
        <li>Second</li>
        <li>Third</li>
      </ol>
    `;
    const result = htmlToMarkdownDirect(html);
    expect(result).toContain('First');
    expect(result).toContain('Second');
    expect(result).toContain('Third');
    // Turndown uses numbered lists
    expect(result).toMatch(/\d+\.\s+First/);
  });

  // Test 7: Math element preservation
  test('preserves MathML math elements as raw HTML', () => {
    const html = '<p>Formula: <math><mi>x</mi><mo>=</mo><mn>5</mn></math></p>';
    const result = htmlToMarkdownDirect(html);
    expect(result).toContain('<math>');
    expect(result).toContain('</math>');
  });

  // Test 8: KaTeX class preservation
  test('preserves KaTeX class elements as raw HTML', () => {
    const html = '<p>Equation: <span class="katex"><span class="katex-html">x^2</span></span></p>';
    const result = htmlToMarkdownDirect(html);
    expect(result).toContain('katex');
  });

  // Test 9: Nested content with formatting
  test('converts nested content with bold and italic', () => {
    const html = '<div><p><strong>Bold</strong> and <em>italic</em> text</p></div>';
    const result = htmlToMarkdownDirect(html);
    expect(result).toContain('**Bold**');
    expect(result).toContain('italic');
    // Turndown uses _ or * for emphasis
    expect(result).toMatch(/[*_]+italic[*_]+/);
  });

  // Test 10: Empty string input
  test('returns empty string for empty input', () => {
    const result = htmlToMarkdownDirect('');
    expect(result).toBe('');
  });

  // Test 11: Null/undefined handling
  test('returns empty string for null input', () => {
    const result = htmlToMarkdownDirect(null as any);
    expect(result).toBe('');
  });

  // Test 12: Undefined handling
  test('returns empty string for undefined input', () => {
    const result = htmlToMarkdownDirect(undefined as any);
    expect(result).toBe('');
  });

  // Test 13: Large input (10KB+)
  test('handles large HTML input without crashing', () => {
    // Generate 10KB+ HTML with repeated content
    let largeHtml = '<div>';
    for (let i = 0; i < 500; i++) {
      largeHtml += `<p>Paragraph ${i}: This is a test paragraph with some content to make it larger.</p>`;
    }
    largeHtml += '</div>';

    expect(largeHtml.length).toBeGreaterThan(10000);

    const result = htmlToMarkdownDirect(largeHtml);
    expect(result).toBeTruthy();
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain('Paragraph');
  });

  // Test 14: Code block preservation
  test('preserves code blocks with fenced syntax', () => {
    const html = '<pre><code>function hello() {\n  console.log("world");\n}</code></pre>';
    const result = htmlToMarkdownDirect(html);
    expect(result).toContain('```');
    expect(result).toContain('function hello()');
  });

  // Test 15: Link conversion
  test('converts links to markdown format', () => {
    const html = '<p>Check out <a href="https://example.com">this link</a></p>';
    const result = htmlToMarkdownDirect(html);
    expect(result).toContain('[this link](https://example.com)');
  });

  // Test 16: GFM strikethrough
  test('preserves strikethrough with GFM plugin', () => {
    const html = '<p><del>strikethrough</del> text</p>';
    const result = htmlToMarkdownDirect(html);
    expect(result).toContain('strikethrough');
    // Turndown uses ~ for strikethrough
    expect(result).toMatch(/~+strikethrough~+/);
  });

  // Test 17: MathJax class preservation
  test('preserves MathJax class elements as raw HTML', () => {
    const html = '<span class="MathJax_Preview">x = 5</span>';
    const result = htmlToMarkdownDirect(html);
    expect(result).toContain('MathJax');
  });

  // Test 18: Complex nested table
  test('handles complex nested table structures', () => {
    const html = `
      <table>
        <thead>
          <tr>
            <th>Header 1</th>
            <th>Header 2</th>
            <th>Header 3</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Cell 1</td>
            <td>Cell 2</td>
            <td>Cell 3</td>
          </tr>
          <tr>
            <td>Cell 4</td>
            <td>Cell 5</td>
            <td>Cell 6</td>
          </tr>
        </tbody>
      </table>
    `;
    const result = htmlToMarkdownDirect(html);
    expect(result).toContain('| Header 1 | Header 2 | Header 3 |');
    expect(result).toContain('| Cell 1 | Cell 2 | Cell 3 |');
    expect(result).toContain('| Cell 4 | Cell 5 | Cell 6 |');
  });

  // Test 19: Annotation element preservation (MathML)
  test('preserves annotation elements within math', () => {
    const html = '<math><annotation>x = 5</annotation></math>';
    const result = htmlToMarkdownDirect(html);
    expect(result).toContain('<math>');
    expect(result).toContain('annotation');
  });

  // Test 20: Whitespace handling
  test('handles excessive whitespace correctly', () => {
    const html = `
      <p>
        Text with
        lots of
        whitespace
      </p>
    `;
    const result = htmlToMarkdownDirect(html);
    expect(result).toBeTruthy();
    expect(result.length).toBeGreaterThan(0);
  });

  // Test 21: Mixed content with multiple elements
  test('converts mixed content with headings, lists, and paragraphs', () => {
    const html = `
      <h1>Title</h1>
      <p>Introduction paragraph.</p>
      <h2>Section 1</h2>
      <ul>
        <li>Point A</li>
        <li>Point B</li>
      </ul>
      <h2>Section 2</h2>
      <ol>
        <li>Step 1</li>
        <li>Step 2</li>
      </ol>
    `;
    const result = htmlToMarkdownDirect(html);
    expect(result).toContain('# Title');
    expect(result).toContain('## Section 1');
    expect(result).toContain('## Section 2');
    expect(result).toContain('Point A');
    // Turndown uses numbered lists
    expect(result).toMatch(/\d+\.\s+Step 1/);
  });

  // Test 22: Blockquote conversion
  test('converts blockquotes to markdown format', () => {
    const html = '<blockquote><p>This is a quote</p></blockquote>';
    const result = htmlToMarkdownDirect(html);
    expect(result).toContain('> This is a quote');
  });

  // Test 23: Horizontal rule
  test('converts horizontal rules', () => {
    const html = '<p>Before</p><hr /><p>After</p>';
    const result = htmlToMarkdownDirect(html);
    expect(result).toContain('Before');
    expect(result).toContain('After');
    // Turndown converts hr to * * * or --- or ___
    expect(result).toMatch(/[\*\-_\s]+/);
  });

  // Test 24: Image conversion
  test('converts images to markdown format', () => {
    const html = '<img src="image.png" alt="Test Image" />';
    const result = htmlToMarkdownDirect(html);
    expect(result).toContain('![Test Image](image.png)');
  });

  // Test 25: Return type is always string
  test('always returns a string type', () => {
    const testCases = [
      '<p>Test</p>',
      '',
      '<h1>Title</h1>',
      '<table><tr><td>Cell</td></tr></table>',
    ];

    testCases.forEach((html) => {
      const result = htmlToMarkdownDirect(html);
      expect(typeof result).toBe('string');
    });
  });
});
