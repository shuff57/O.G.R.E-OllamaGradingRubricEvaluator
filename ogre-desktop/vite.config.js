import electron from 'vite-plugin-electron/simple'
import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig(() => ({
  plugins: [
    svelte(),
    electron({
      main: {
        entry: 'electron-main/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['better-sqlite3'],
            },
          },
        },
      },
      preload: {
        input: 'electron-main/preload.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              output: {
                format: 'cjs',
                entryFileNames: '[name].cjs',
              },
            },
          },
        },
      },
    }),
  ],
  define: {
    // Polyfill Buffer for renderer process (gray-matter and other Node libs need it)
    global: 'globalThis',
  },
  optimizeDeps: {
    include: ['buffer'],
  },
  server: {
    watch: {
      usePolling: true,
      interval: 300,
    },
  },
}))
