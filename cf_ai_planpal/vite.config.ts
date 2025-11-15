// Vite configuration for the React frontend
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // React plugin enables fast refresh and sensible defaults
  plugins: [react()],
})
