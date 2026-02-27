# Decisions — turndown-extraction

## [2026-02-23] Plan Initialized

### Architecture Decisions
- Turndown + GFM plugin bundled as IIFE (not CDN) to bypass CSP
- Build script: `ogre-desktop/scripts/build-turndown-bundle.js` generates `src/lib/turndown-bundle.ts`
- Math preservation via Turndown `.keep()` rules for: `<math>`, `.katex`, `.MathJax`, `.MathJax_Display`
- Substring cap increased 2000→3000 for extractPageContent (markdown adds formatting chars)
- Tests-after approach with vitest

### Rejected Alternatives
- FireCrawl MCP: rejected (auth walls, cost, latency, redundancy)
- CDN injection: rejected (CSP blocking risk on LMS sites)
- ES6 inline scripts: rejected (existing ES5 convention)
