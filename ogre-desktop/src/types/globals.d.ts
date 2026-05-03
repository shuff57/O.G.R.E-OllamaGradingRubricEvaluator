// Global constants injected by Vite define() from package.json at build time
declare const __APP_VERSION__: string;

// Allow side-effect CSS imports (e.g. katex/dist/katex.min.css)
declare module '*.css' {
  const styles: Record<string, string>;
  export default styles;
}

// Vite ?raw imports — returns file contents as a string
declare module '*?raw' {
  const content: string;
  export default content;
}
