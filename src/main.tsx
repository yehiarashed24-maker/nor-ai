import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Register Service Worker for PWA
if ('serviceWorker' in navigator && !window.location.host.startsWith('localhost:')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js?v=3', { updateViaCache: 'none' })
      .then((registration) => registration.update())
      .catch((err) => {
        console.warn('PWA service worker registration error:', err);
      });
  });
}
