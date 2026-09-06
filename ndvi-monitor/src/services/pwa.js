import { showToast } from '../store'

// Simple one-time gate: as soon as this is true we stop showing the install
// popup. Initial state is "false" (absent). We set it to true the first time
// the invite is shown (and again when the user actually installs).
const IS_DOWNLOAD_KEY = 'isDownload'

let deferredPrompt = null
let inviteShown = false

function isDownloaded() {
  try {
    return localStorage.getItem(IS_DOWNLOAD_KEY) === 'true'
  } catch {
    return false
  }
}

function markDownloaded() {
  try {
    localStorage.setItem(IS_DOWNLOAD_KEY, 'true')
  } catch {}
}

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
  markDownloaded()
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

// First-visit invite: only ever shows once, then isDownload stops it. On
// Android/Chrome it both advertises and triggers the native install prompt; on
// iOS it explains the Share -> Add to Home Screen path.
export function maybeShowInstallInvite() {
  if (inviteShown || isStandalone() || isDownloaded()) return
  inviteShown = true
  markDownloaded()
  if (installAvailable()) {
    showToast(
      'Install the NDVI Rice app for one-tap access and offline maps.',
      12000,
      [{ label: 'Install', onClick: installApp }],
    )
  } else if (isIOS()) {
    showToast(
      'Tap Share, then "Add to Home Screen" to install the app.',
      12000,
      [{ label: 'OK', onClick: () => {} }],
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