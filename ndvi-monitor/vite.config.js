import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  // The repo root also contains legacy static prototypes (three.js imports)
  // that are not part of the Vue app. Scan only the real app entry so Vite
  // does not try to pre-bundle dependencies those files need.
  optimizeDeps: {
    entries: ['index.html'],
  },
})
