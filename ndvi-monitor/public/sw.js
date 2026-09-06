/* Service worker: app-shell + runtime caching for the NDVI Rice monitor.
 * This is a mostly-online app (Supabase auth + Earth Engine Edge functions
 * drive the real data), so we precache the static shell and CDN deps and do a
 * network-first runtime cache for everything else, falling back to cache when
 * offline so the shell + last-viewed map assets still render. */
const VERSION = 'v1'
const STATIC_CACHE = `ndvi-static-${VERSION}`
const RUNTIME_CACHE = `ndvi-runtime-${VERSION}`

const PRECACHE_URLS = [
  '/',
  '/manifest.webmanifest',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.js',
  'https://unpkg.com/three@0.160.0/build/three.min.js',
]

/* Tabler icons webfont + fonts are used by the UI; cache them too so icons
 * and typography survive offline reloads. Leaflet draw CSS is referenced from
 * index.html as well. */
const EXTERNAL_STATIC = [
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.css',
  'https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.30.0/dist/tabler-icons.min.css',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&family=Kantumruy+Pro:wght@400;500;600;700&family=Noto+Sans+Khmer:wght@400;500;600;700&display=swap',
  'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&family=Instrument+Serif:ital@0;1&display=swap',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) =>
        Promise.allSettled(
          [...PRECACHE_URLS, ...EXTERNAL_STATIC].map((url) =>
            cache.add(url)
          )
        )
      )
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== STATIC_CACHE && k !== RUNTIME_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  )
})

/* Vite emits hashed asset filenames under /assets/** — cache those
 * network-first so a stale cache never serves a half-updated app. */
function isSameOriginAsset(url) {
  if (url.origin !== location.origin) return false
  return url.pathname.startsWith('/assets/') ||
    url.pathname === '/' ||
    url.pathname.startsWith('/icons/')
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // Same-origin app shell + hashed assets: network-first, fall back to cache.
  if (isSameOriginAsset(url)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy))
          return response
        })
        .catch(() =>
          caches.match(request).then((hit) => {
            if (hit) return hit
            // Fall back to cached index for any client-side route on a bad fetch.
            if (request.mode === 'navigate') return caches.match('/')
            return Response.error()
          })
        )
    )
    return
  }

  // Cross-origin: stale-while-revalidate for lookups, cache-first for static.
  if (request.destination === 'script' || request.destination === 'style' ||
      request.destination === 'font' || request.destination === 'image') {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((response) => {
            const copy = response.clone()
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy))
            return response
          })
          .catch(() => cached)
        return cached || network
      })
    )
  }
})