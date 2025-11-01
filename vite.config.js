import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    https: false, // Force HTTP
    host: true,   // Allow external connections
  }
})
