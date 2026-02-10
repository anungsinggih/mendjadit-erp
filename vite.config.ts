import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    allowedHosts: true,
  },
  build: {
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('react') || id.includes('react-dom') || id.includes('scheduler') || id.includes('react-router-dom')) {
            return 'vendor-react'
          }
          if (id.includes('@radix-ui')) {
            return 'vendor-radix'
          }
          if (id.includes('@supabase')) {
            return 'vendor-supabase'
          }
          if (id.includes('xlsx')) {
            return 'vendor-xlsx'
          }
          if (id.includes('browser-image-compression')) {
            return 'vendor-image'
          }
          return
        },
      },
    },
  },
})
