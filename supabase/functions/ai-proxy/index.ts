/**
 * Supabase Edge Function: ai-proxy
 *
 * Receives authenticated requests from the frontend,
 * verifies the user has a valid Supabase session,
 * and forwards requests to backend-ai with the
 * x-internal-key header added server-side.
 *
 * The internal key NEVER touches the browser.
 *
 * Deploy via Supabase Dashboard:
 *   1. Go to Edge Functions in your Supabase project dashboard
 *   2. Click "Deploy a new function"
 *   3. Name it "ai-proxy"
 *   4. Paste this code
 *   5. Set secrets: INTERNAL_API_KEY, BACKEND_AI_URL
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── CORS Headers ─────────────────────────────────────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// ── Main Handler ─────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── 1. Verify Supabase Session ──────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired session" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 2. Parse the proxy request ──────────────────────────────────
    const url = new URL(req.url);
    const action = url.searchParams.get("action"); // "qa" | "summary" | "chapters"

    const backendAiUrl = Deno.env.get("BACKEND_AI_URL") || "http://localhost:8001";
    const internalApiKey = Deno.env.get("INTERNAL_API_KEY");

    if (!internalApiKey) {
      return new Response(
        JSON.stringify({ error: "Server misconfigured: missing INTERNAL_API_KEY" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let targetUrl: string;

    if (action === "qa") {
      // ── Q&A Streaming ──────────────────────────────────────────────
      const bookId = url.searchParams.get("book_id");
      const question = url.searchParams.get("question");
      const bookTitle = url.searchParams.get("book_title") || "Unknown Book";

      if (!bookId || !question) {
        return new Response(
          JSON.stringify({ error: "Missing required params: book_id, question" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const params = new URLSearchParams({ book_id: bookId, question, book_title: bookTitle });
      targetUrl = `${backendAiUrl}/qa?${params.toString()}`;

    } else if (action === "summary") {
      // ── Book Summary ───────────────────────────────────────────────
      const bookId = url.searchParams.get("book_id");
      if (!bookId) {
        return new Response(
          JSON.stringify({ error: "Missing required param: book_id" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      targetUrl = `${backendAiUrl}/summarize/${bookId}`;

    } else if (action === "chapters") {
      // ── Chapter Summaries ──────────────────────────────────────────
      const bookId = url.searchParams.get("book_id");
      if (!bookId) {
        return new Response(
          JSON.stringify({ error: "Missing required param: book_id" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      targetUrl = `${backendAiUrl}/summarize/${bookId}/chapters`;

    } else {
      return new Response(
        JSON.stringify({ error: "Unknown action. Use: qa, summary, chapters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 3. Forward to backend-ai ────────────────────────────────────
    const backendResponse = await fetch(targetUrl, {
      method: "GET",
      headers: {
        "x-internal-key": internalApiKey,
        "Accept": action === "qa" ? "text/event-stream" : "application/json",
      },
    });

    if (!backendResponse.ok) {
      const errorText = await backendResponse.text();
      return new Response(
        JSON.stringify({ error: `Backend error: ${backendResponse.status}`, detail: errorText }),
        { status: backendResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 4. Stream SSE or return JSON ────────────────────────────────
    if (action === "qa" && backendResponse.body) {
      // Stream the SSE response through to the frontend
      return new Response(backendResponse.body, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    }

    // JSON response for summary/chapters
    const data = await backendResponse.json();
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("ai-proxy error:", err);
    return new Response(
      JSON.stringify({ error: "Internal proxy error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
