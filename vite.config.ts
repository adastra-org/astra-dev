import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import { docsPlugin } from './scripts/docs/plugin.ts'
import { nativesPlugin } from './scripts/natives/plugin.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    docsPlugin(),
    nativesPlugin(),
    tailwindcss(),
    react(),
    babel({ presets: [reactCompilerPreset()] }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: true,
    // Como nginx en producción: /api/* llega al server de Ask Ether sin el prefijo. Así la UI
    // llama /api/chat en dev y en prod (mismo origen, misma cookie). Server: `bun run --cwd server dev`.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4100',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
