import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Forward API calls to the Express backend so the app needs no base URL config.
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
})
