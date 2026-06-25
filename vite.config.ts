import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5180, // distinct from the Sev & Tick project (5173/5174)
    host: true, // expose on LAN so a real device can hit Capacitor live-reload later
  },
})
