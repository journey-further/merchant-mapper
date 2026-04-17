import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const devApiHost = process.env.VITE_DEV_API_HOST ?? '127.0.0.1'
const devApiPort = process.env.VITE_DEV_API_PORT ?? '8787'
const devApiTarget = `http://${devApiHost}:${devApiPort}`

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // Use an explicit IPv4 loopback target. On Windows, `localhost` often
      // resolves to `::1` first, while the Python dev server is listening on
      // IPv4 only, which makes Vite surface a 502 before the request hits it.
      '/api': devApiTarget,
      '/dev-blobs': devApiTarget,
    },
  },
})
