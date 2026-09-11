import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'mx.xook.app',
  appName: 'Xook',
  webDir: 'www',
  server: { androidScheme: 'https' },
  // Android 15 draws edge-to-edge; keep the WebView below the status bar and above the nav bar
  android: { allowMixedContent: false, adjustMarginsForEdgeToEdge: 'force' },
  plugins: {
    // Native HTTP for the WebView's fetch: public APIs (Open Library, Wiktionary…) without CORS limits
    CapacitorHttp: { enabled: true }
  }
}

export default config
