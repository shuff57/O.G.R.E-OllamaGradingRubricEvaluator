<script lang="ts">
  import { onMount } from 'svelte';
  import { marked } from 'marked';
  import katex from 'katex';
  import 'katex/dist/katex.min.css';

  // Props
  let { 
    content = '', 
    streaming = false 
  } = $props();

  let container: HTMLDivElement;
  let htmlContent = $state('');

  // Configure marked options
  marked.setOptions({
    gfm: true,
    breaks: true,
  });

  // Custom renderer for math
  const renderMath = (text: string) => {
    // We need to protect math from markdown parsing first
    // This is a simplified approach - ideally we'd use a marked extension
    // But for this task, we'll try to process safely
    
    // First, render markdown to HTML
    // We'll let marked handle the structure
    const rawHtml = marked.parse(text) as string;
    return rawHtml;
  };

  // Process DOM after update to render math
  const processMathInDom = () => {
    if (!container) return;

    // Find all text nodes that might contain math
    // This is safer than regex on the whole HTML string which breaks tags
    renderMathInElement(container);
  };

  function renderMathInElement(element: HTMLElement) {
    // Config for delimiters
    const delimiters = [
      { left: "$$", right: "$$", display: true },
      { left: "$", right: "$", display: false }
    ];

    // We can use the auto-render extension logic or implement a simple version
    // Since we only installed 'katex', we'll implement a simple walker
    // or better yet, since we control the content updates, we can try to
    // parse math *before* markdown if we are careful about code blocks.

    // actually, let's use the regex approach on text nodes only to avoid breaking HTML attributes
    // But dealing with text nodes is complex.
    
    // Let's try the "render math in element" approach manually if we don't have the auto-render extension
    // However, for this task, a robust way is to use a pre-processor for marked.
    // Let's define a tokenizer for marked.
  }
  
  // Better approach: Marked Extension for Math
  const mathExtension = {
    name: 'math',
    level: 'inline',
    start(src: string) { return src.match(/\$/)?.index; },
    tokenizer(src: string, tokens: any) {
      const blockRule = /^\$\$([\s\S]+?)\$\$/;
      const inlineRule = /^\$([^$\n]+?)\$/;
      
      let match;
      
      // Block math
      if (match = blockRule.exec(src)) {
        return {
          type: 'math',
          raw: match[0],
          text: match[1],
          display: true
        };
      }
      
      // Inline math
      if (match = inlineRule.exec(src)) {
        return {
          type: 'math',
          raw: match[0],
          text: match[1],
          display: false
        };
      }
    },
    renderer(token: any) {
      try {
        return katex.renderToString(token.text, {
          displayMode: token.display,
          throwOnError: false
        });
      } catch (e) {
        return token.text;
      }
    }
  };

  marked.use({ extensions: [mathExtension] });

  // Update HTML when content changes
  $effect(() => {
    if (content) {
      // Use marked with our synchronous parsing
      Promise.resolve(marked.parse(content)).then(html => {
        htmlContent = html;
      });
    } else {
      htmlContent = '';
    }
  });

</script>

<div 
  class="response-renderer markdown-body" 
  class:streaming={streaming}
  bind:this={container}
>
  {@html htmlContent}
  {#if streaming}
    <span class="cursor"></span>
  {/if}
</div>

<style>
  .response-renderer {
    font-family: var(--font-body, system-ui, -apple-system, sans-serif);
    line-height: 1.6;
    color: var(--color-text-primary, #333);
    font-size: 0.95rem;
    overflow-wrap: break-word;
  }

  /* Basic Markdown Styles matching the app theme */
  :global(.response-renderer h1),
  :global(.response-renderer h2),
  :global(.response-renderer h3) {
    margin-top: 1.5em;
    margin-bottom: 0.5em;
    font-weight: 600;
    line-height: 1.25;
    color: var(--color-text-primary, inherit);
  }

  :global(.response-renderer h1) { font-size: 1.5em; border-bottom: 1px solid var(--color-border, #eee); padding-bottom: 0.3em; }
  :global(.response-renderer h2) { font-size: 1.3em; border-bottom: 1px solid var(--color-border, #eee); padding-bottom: 0.3em; }
  :global(.response-renderer h3) { font-size: 1.1em; }

  :global(.response-renderer p) {
    margin-bottom: 1em;
  }

  :global(.response-renderer ul),
  :global(.response-renderer ol) {
    padding-left: 1.5em;
    margin-bottom: 1em;
  }

  :global(.response-renderer li) {
    margin-bottom: 0.25em;
  }

  :global(.response-renderer code) {
    background-color: var(--color-bg-secondary, rgba(127, 127, 127, 0.1));
    padding: 0.2em 0.4em;
    border-radius: 3px;
    font-family: var(--font-mono, monospace);
    font-size: 0.9em;
  }

  :global(.response-renderer pre) {
    background-color: var(--color-bg-secondary, #f6f8fa);
    padding: 1em;
    border-radius: 6px;
    overflow-x: auto;
    margin-bottom: 1em;
  }

  :global(.response-renderer pre code) {
    background-color: transparent;
    padding: 0;
    font-size: 0.9em;
    color: inherit;
  }

  :global(.response-renderer blockquote) {
    margin: 0 0 1em;
    padding: 0 1em;
    color: var(--color-text-secondary, #666);
    border-left: 0.25em solid var(--color-border, #dfe2e5);
  }

  :global(.response-renderer table) {
    border-spacing: 0;
    border-collapse: collapse;
    margin-bottom: 1em;
    width: 100%;
    overflow: auto;
    display: block;
  }

  :global(.response-renderer th),
  :global(.response-renderer td) {
    padding: 6px 13px;
    border: 1px solid var(--color-border, #dfe2e5);
  }

  :global(.response-renderer tr:nth-child(2n)) {
    background-color: var(--color-bg-secondary, #f6f8fa);
  }

  /* Streaming Cursor */
  .cursor {
    display: inline-block;
    width: 0.5em;
    height: 1em;
    background-color: var(--color-primary, #0066cc);
    animation: blink 1s step-end infinite;
    vertical-align: text-bottom;
    margin-left: 2px;
  }

  @keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0; }
  }

  /* KaTeX Adjustments */
  :global(.katex-display) {
    overflow-x: auto;
    overflow-y: hidden;
    padding: 0.5em 0;
    margin: 1em 0;
  }
</style>
