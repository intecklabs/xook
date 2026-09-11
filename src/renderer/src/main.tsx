import '@fontsource/roboto/300.css'
import '@fontsource/roboto/400.css'
import '@fontsource/roboto/400-italic.css'
import '@fontsource/roboto/500.css'
import '@fontsource/roboto/700.css'
import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

async function bootstrap(): Promise<void> {
  // Electron injects window.api from the preload script; on Android/iOS (Capacitor) or a plain
  // browser we install the mobile implementation first.
  if (__XOOK_MOBILE__ && !window.api) {
    const { installMobileApi } = await import('./platform/mobileApi')
    await installMobileApi()
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}

void bootstrap()
