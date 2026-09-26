import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'

export default defineConfig(({ mode }) => ({
  main: {
    build: {
      rollupOptions: {
        output: { interop: 'auto' }
      }
    },
    define: {
      'import.meta.env.MAIN_VITE_MICROSOFT_CLIENT_ID': JSON.stringify(
        loadEnv(mode, process.cwd(), '').MICROSOFT_CLIENT_ID || ''
      )
    }
  },
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        styles: resolve('src/renderer/src/styles')
      }
    },
    plugins: [react()]
  }
}))
