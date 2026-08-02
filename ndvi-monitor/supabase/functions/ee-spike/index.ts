// Deno spike: does @google/earthengine work at all in Supabase Edge Functions?
// This is a throwaway test — not part of the real worker. Delete once the
// real ee-alerts-worker function proves this out for real.

import ee from "npm:@google/earthengine@0.1.395";

Deno.serve(async (req) => {
  try {
    const keyJson = Deno.env.get("EE_SERVICE_ACCOUNT_KEY");
    if (!keyJson) {
      return new Response(
        JSON.stringify({
          ok: false,
          step: "env",
          error: "EE_SERVICE_ACCOUNT_KEY not set",
        }),
        { status: 500 },
      );
    }

    const privateKey = JSON.parse(keyJson);

    const result = await new Promise((resolve, reject) => {
      ee.data.authenticateViaPrivateKey(
        privateKey,
        () => {
          ee.initialize(
            null,
            null,
            () => {
              ee.Number(1)
                .add(1)
                .evaluate((val: number, err: string) => {
                  if (err) reject(new Error(err));
                  else resolve(val);
                });
            },
            (err: string) => reject(new Error("ee.initialize failed: " + err)),
          );
        },
        (err: string) =>
          reject(new Error("authenticateViaPrivateKey failed: " + err)),
      );
    });

    return new Response(
      JSON.stringify({ ok: true, step: "complete", result }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, step: "exception", error: String(e) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
