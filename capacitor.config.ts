import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'mx.xook.app',
  appName: 'Xook',
  webDir: 'www',
  server: { androidScheme: 'https' },
  android: { allowMixedContent: false },
  plugins: {
    // Native HTTP for the WebView's fetch: public APIs (Open Library, Wiktionary…) without CORS limits
    CapacitorHttp: { enabled: true }
  }
}

export default config
