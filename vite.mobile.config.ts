import { resolve } from 'path'
import { readFileSync } from 'fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')) as {
  version: string
}

// The Capacitor WebView serves the app from https://localhost and loads SQLite as WebAssembly
const MOBILE_CSP = [
  "default-src 'self' https://localhost http://localhost",
  "script-src 'self' 'wasm-unsafe-eval' https://localhost",
  "style-src 'self' 'unsafe-inline' https://localhost",
  "img-src 'self' data: blob: https: http://localhost",
  "media-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "font-src 'self' data:",
  "connect-src 'self' https: http://localhost https://localhost"
].join('; ')

function mobileHtml(): Plugin {
  return {
    name: 'xook-mobile-html',
    transformIndexHtml(html) {
      return html
        .replace(/content="default-src[^"]*"/, `content="${MOBILE_CSP}"`)
        .replace(
          '<meta charset="UTF-8" />',
          '<meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no" />'
        )
    }
  }
}

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  base: './',
  publicDir: false,
  plugins: [react(), mobileHtml()],
  resolve: {
    alias: { '@renderer': resolve(__dirname, 'src/renderer/src') }
  },
  define: {
    __XOOK_MOBILE__: 'true',
    __APP_VERSION__: JSON.stringify(pkg.version)
  },
  optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
  build: {
    outDir: resolve(__dirname, 'www'),
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 3000
  },
  server: { port: 5180 }
})
