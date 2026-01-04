import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // This exposes the app on your local network (0.0.0.0)
    port: 3000, // We are moving to port 3000 to dodge conflicts
    strictPort: true, // If 3000 is taken, fail (so we know)
  }
})