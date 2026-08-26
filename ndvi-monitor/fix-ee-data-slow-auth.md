# Fix: ee-data is slow — re-authenticating Earth Engine on every request

## Symptom
Chrome DevTools network trace shows `ee-data` responses of ~1KB taking 3-32 seconds each,
one per mode switch (NDVI → NDWI → LSWI). Tiny payload + multi-second time = the delay is
server-side compute before the response starts, not data transfer.

## Root cause
`ee-data/index.ts` almost certainly calls `ee.data.authenticateViaPrivateKey(...)` and
`ee.initialize(...)` fresh inside the request handler on every invocation — the same
pattern `ee-alerts-worker` uses, which is fine for a once-a-day cron job but wrong for an
interactive endpoint hit many times per page view. Each auth call is itself a network
round-trip to Google, which explains both the multi-second latency and why the timing is
inconsistent (16s, then 4s, then 32s) rather than a fixed cost.

## Fix — cache the EE session at module scope

Move authentication OUTSIDE the request handler so it only runs once per warm function
instance (Deno Edge Functions reuse the same module/process across requests until they go
cold), and guard it so concurrent requests during startup don't all try to authenticate at
once:

```ts
// Module scope — runs once per warm instance, not once per request
let eeReady: Promise<void> | null = null;

function initEE(): Promise<void> {
  if (!eeReady) {
    eeReady = new Promise((resolve, reject) => {
      const key = JSON.parse(Deno.env.get('EE_SERVICE_ACCOUNT_KEY')!);
      ee.data.authenticateViaPrivateKey(
        key,
        () => ee.initialize(null, null, () => resolve(), reject),
        reject
      );
    });
  }
  return eeReady;
}

Deno.serve(async (req) => {
  await initEE(); // no-ops after the first successful call on this instance
  // ... existing action routing (getIndexTile, getIndexTimeSeries, etc.)
});
```

Key points for whoever implements this:
- `eeReady` must be a **module-level** variable (outside the `Deno.serve` callback), not
  re-declared per request — otherwise this fix does nothing.
- If `initEE()` throws/rejects, reset `eeReady = null` so the *next* request retries
  authentication instead of permanently caching a failed session.
- This does NOT eliminate cold-start latency (first request after the function has been
  idle and spun down will still pay the auth cost) — it eliminates the *repeated* cost on
  every subsequent request while the instance stays warm, which is what the screenshot
  shows happening (many requests in quick succession, each paying full auth cost).

## Secondary check — is the frontend serializing independent requests?

While looking at this, also confirm the mode-switch handler in the frontend doesn't await
one `ee-data` call before starting the next when there's no actual dependency between them
(e.g. prefetching NDWI/LSWI tiles isn't needed, but if the UI ever fires more than one
`ee-data` call for a single user action, those should run via `Promise.all`, not
sequential awaits).

## Not needed right now
- No caching of NDVI/tile results is required to fix this specific symptom — the module-
  scope auth fix should bring each call down to roughly what `ee-alerts-worker`'s actual EE
  query time is (should be well under a second for a single-month tile request). Only add
  response caching later if it's still too slow after this fix.

## Done when
Repeating the same DevTools trace (switch NDVI → NDWI → LSWI a few times) shows request
times dropping to well under 1 second after the first request in a warm session, with only
the very first request (cold start) taking longer.
