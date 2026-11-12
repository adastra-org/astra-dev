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
  },
})
