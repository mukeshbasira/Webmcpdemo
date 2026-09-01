import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { buildId } from './build-id.mjs'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // stamped into the bundle so a deploy can prove the live page is THIS build and not the last one
  define: { __BUILD__: JSON.stringify(buildId()) },
})
