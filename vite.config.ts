import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

const appNodeModules = path.resolve(__dirname, 'node_modules')
const devApiHost = process.env.VITE_DEV_API_HOST ?? '127.0.0.1'
const devApiPort = process.env.VITE_DEV_API_PORT ?? '8787'
const devApiTarget = `http://${devApiHost}:${devApiPort}`

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      react: path.resolve(appNodeModules, 'react'),
      'react-dom': path.resolve(appNodeModules, 'react-dom'),
      'react/jsx-runtime': path.resolve(appNodeModules, 'react/jsx-runtime.js'),
      'react/jsx-dev-runtime': path.resolve(appNodeModules, 'react/jsx-dev-runtime.js'),
      'react-dom/client': path.resolve(appNodeModules, 'react-dom/client.js'),
    },
  },
  server: {
    fs: {
      allow: [path.resolve(__dirname, '..')],
    },
    proxy: {
      // Use an explicit IPv4 loopback target. On Windows, `localhost` often
      // resolves to `::1` first, while the Python dev server is listening on
      // IPv4 only, which makes Vite surface a 502 before the request hits it.
      '/api': devApiTarget,
      '/dev-blobs': devApiTarget,
    },
  },
})
