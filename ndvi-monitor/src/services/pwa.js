import { showToast } from '../store'

const INSTALL_DISMISS_KEY = 'ndvi-install-dismissed'

let deferredPrompt = null
let inviteShown = false

export function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  )
}

export function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

export function installAvailable() {
  return !!deferredPrompt
}

export async function installApp() {
  if (!deferredPrompt) return false
  const p = deferredPrompt
  deferredPrompt = null
  p.prompt()
  await p.userChoice.catch(() => {})
  return true
}

export function showInstallHint() {
  const msg = isIOS()
    ? 'Tap Share, then "Add to Home Screen" to install the app.'
    : 'Open this site in your browser menu and choose "Install App".'
  showToast(msg, 6000, [{ label: 'OK', onClick: () => {} }])
}

function dismissInstallInvite() {
  try {
    localStorage.setItem(INSTALL_DISMISS_KEY, '1')
  } catch {}
}

// First-visit invite: shown once per browser, unless dismissed. On Android/
// Chrome it both advertises and triggers the native install prompt; on iOS it
// explains the Share -> Add to Home Screen path.
export function maybeShowInstallInvite() {
  if (inviteShown || isStandalone()) return
  inviteShown = true
  try {
    if (localStorage.getItem(INSTALL_DISMISS_KEY)) return
  } catch {}
  if (installAvailable()) {
    showToast(
      'Install the NDVI Rice app for one-tap access and offline maps.',
      12000,
      [
        { label: 'Install', onClick: installApp },
        { label: 'Later', onClick: dismissInstallInvite },
      ],
    )
  } else if (isIOS()) {
    showToast(
      'Tap Share, then "Add to Home Screen" to install the app.',
      12000,
      [{ label: 'Later', onClick: dismissInstallInvite }],
    )
  }
}

// Call once at app boot: registers the service worker and captures the native
// install prompt when the browser offers it.
export function attachPwa() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('SW registration failed:', err)
      })
    })
  }
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt = e
    maybeShowInstallInvite()
  })
}