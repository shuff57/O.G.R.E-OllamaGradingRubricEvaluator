import electron from 'vite-plugin-electron/simple'
import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig(({ command }) => ({
  plugins: [
    svelte(),
    ...(command === 'serve'
      ? [
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
                },
              },
            },
          }),
        ]
      : []),
  ],
  server: {
    watch: {
      usePolling: true,
      interval: 300,
    },
  },
}))
