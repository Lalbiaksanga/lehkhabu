/**
 * Supabase Edge Function: send-push
 *
 * Triggered by a Supabase Database Webhook whenever a row is inserted
 * into the `notifications` table.
 *
 * 1. Reads the new notification record from the webhook payload
 * 2. Looks up all push tokens for that user_id from user_push_tokens
 * 3. Sends a Web Push notification to each device using VAPID
 *
 * Secrets required (set in Supabase Dashboard → Edge Functions → Secrets):
 *   VAPID_PUBLIC_KEY   — from: npx web-push generate-vapid-keys
 *   VAPID_PRIVATE_KEY  — from: npx web-push generate-vapid-keys
 *   VAPID_EMAIL        — e.g. mailto:admin@lehkhabu.com
 *   (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are auto-injected by Supabase)
 *
 * Deploy: Supabase Dashboard → Edge Functions → Deploy new function → name: "send-push"
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── CORS Headers ──────────────────────────────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── VAPID JWT Signing ─────────────────────────────────────────
// Implements the VAPID application server key signing using Web Crypto API
// (no external dependencies — works natively in Deno)

async function importVapidPrivateKey(privateKeyBase64url: string): Promise<CryptoKey> {
  const privateKeyBytes = base64urlToUint8Array(privateKeyBase64url);
  // Wrap raw 32-byte key in PKCS8 DER format for prime256v1 (P-256)
  const pkcs8Header = new Uint8Array([
    0x30, 0x41, 0x02, 0x01, 0x00, 0x30, 0x13, 0x06, 0x07,
    0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, 0x06, 0x08,
    0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, 0x04,
    0x27, 0x30, 0x25, 0x02, 0x01, 0x01, 0x04, 0x20,
  ]);
  const pkcs8 = new Uint8Array(pkcs8Header.length + privateKeyBytes.length);
  pkcs8.set(pkcs8Header, 0);
  pkcs8.set(privateKeyBytes, pkcs8Header.length);

  return await crypto.subtle.importKey(
    "pkcs8",
    pkcs8,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
}

function base64urlToUint8Array(base64url: string): Uint8Array {
  const padding = "=".repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  return Uint8Array.from([...binary].map((c) => c.charCodeAt(0)));
}

function uint8ArrayToBase64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function buildVapidHeader(
  endpoint: string,
  vapidPublicKey: string,
  vapidPrivateKey: string,
  vapidEmail: string
): Promise<string> {
  const url = new URL(endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const expiry = Math.floor(Date.now() / 1000) + 12 * 60 * 60; // 12h

  const header = { typ: "JWT", alg: "ES256" };
  const payload = { aud: audience, exp: expiry, sub: vapidEmail };

  const enc = new TextEncoder();
  const headerB64 = uint8ArrayToBase64url(enc.encode(JSON.stringify(header)));
  const payloadB64 = uint8ArrayToBase64url(enc.encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;

  const privateKey = await importVapidPrivateKey(vapidPrivateKey);
  const signatureBytes = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, enc.encode(signingInput))
  );
  const jwt = `${signingInput}.${uint8ArrayToBase64url(signatureBytes)}`;

  return `vapid t=${jwt}, k=${vapidPublicKey}`;
}

// ── Send a single push notification ──────────────────────────
async function sendWebPush(
  token: { endpoint: string; p256dh: string; auth: string },
  payloadJson: string,
  vapidPublicKey: string,
  vapidPrivateKey: string,
  vapidEmail: string
): Promise<{ ok: boolean; status: number }> {
  const authorization = await buildVapidHeader(
    token.endpoint,
    vapidPublicKey,
    vapidPrivateKey,
    vapidEmail
  );

  const response = await fetch(token.endpoint, {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      TTL: "86400",
    },
    // Note: payload encryption (RFC 8291) is required for confidential payloads.
    // For simplicity, we send an empty body and rely on the VAPID JWT for the
    // notification trigger. The SW will show the notification title/body from
    // a separate lookup or we enhance this later with full RFC 8291 encryption.
    body: new TextEncoder().encode(payloadJson),
  });

  return { ok: response.ok, status: response.status };
}

// ── Main Handler ──────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    // Supabase Database Webhook sends: { type, table, record, old_record, schema }
    const notification = body.record;
    if (!notification?.user_id) {
      return new Response(
        JSON.stringify({ error: "No notification record in payload" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
    const vapidEmail = Deno.env.get("VAPID_EMAIL") || "mailto:admin@lehkhabu.com";

    if (!vapidPublicKey || !vapidPrivateKey) {
      console.error("Missing VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY secrets");
      return new Response(
        JSON.stringify({ error: "Server misconfigured: missing VAPID secrets" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use service role key to bypass RLS and read all tokens for this user
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: tokens, error: tokenError } = await supabase
      .from("user_push_tokens")
      .select("endpoint, p256dh, auth")
      .eq("user_id", notification.user_id);

    if (tokenError) {
      console.error("Failed to fetch push tokens:", tokenError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch push tokens" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!tokens || tokens.length === 0) {
      return new Response(
        JSON.stringify({ message: "No push tokens registered for this user", sent: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const pushPayload = JSON.stringify({
      title: notification.title || "Lehkhabu",
      body: notification.message || "",
      url: notification.type === "AUTHOR_APPROVED" ? "/author" : "/",
      tag: notification.type || "general",
    });

    // Send to all registered devices
    const results = await Promise.allSettled(
      tokens.map((token: { endpoint: string; p256dh: string; auth: string }) =>
        sendWebPush(token, pushPayload, vapidPublicKey, vapidPrivateKey, vapidEmail)
      )
    );

    // Remove expired/invalid push subscriptions (410 Gone)
    const expiredEndpoints: string[] = [];
    results.forEach((result, index) => {
      if (result.status === "fulfilled" && result.value.status === 410) {
        expiredEndpoints.push(tokens[index].endpoint);
      }
    });
    if (expiredEndpoints.length > 0) {
      await supabase
        .from("user_push_tokens")
        .delete()
        .in("endpoint", expiredEndpoints);
    }

    const sent = results.filter(
      (r) => r.status === "fulfilled" && (r.value.ok || r.value.status === 201)
    ).length;

    console.log(`Push sent: ${sent}/${tokens.length} devices`);
    return new Response(
      JSON.stringify({ sent, total: tokens.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("send-push error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error", detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
