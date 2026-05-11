// supabase/functions/create-charge/index.ts
//
// Server-side charge handler. Two modes:
//
//   1. CREATE  — body: { token, amount, currency, tokens, return_url }
//      Calls Tap /v2/charges with 3DS enabled. If Tap returns:
//        CAPTURED   → credit tokens, return new balance
//        INITIATED  → return redirect URL so frontend can show 3DS challenge
//        anything else → log failed transaction, return reason
//
//   2. VERIFY  — body: { verify_charge_id, tokens, amount, currency }
//      Called after the user returns from a 3DS challenge. Fetches the
//      charge from Tap and credits tokens if CAPTURED.
//
// Deploy:
//   supabase secrets set TAP_SECRET_KEY=sk_test_…
//   supabase functions deploy create-charge --no-verify-jwt

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";

const TAP_BASE = "https://api.tap.company/v2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    // ---------- authenticate caller ----------
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const TAP_SECRET = Deno.env.get("TAP_SECRET_KEY");

    if (!TAP_SECRET) {
      return json(
        {
          error:
            "TAP_SECRET_KEY is not configured. Run: supabase secrets set TAP_SECRET_KEY=sk_test_xxx",
        },
        500,
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => null);
    if (!body) return json({ error: "Invalid JSON body" }, 400);

    // ===================================================================
    // MODE 2: verify an existing charge after 3DS redirect
    // ===================================================================
    if (body.verify_charge_id) {
      const { verify_charge_id, tokens, amount, currency } = body as {
        verify_charge_id: string;
        tokens: number;
        amount: number;
        currency: string;
      };

      const tapRes = await fetch(`${TAP_BASE}/charges/${verify_charge_id}`, {
        headers: { Authorization: `Bearer ${TAP_SECRET}` },
      });
      const charge = await tapRes.json().catch(() => ({} as any));

      if (!tapRes.ok) {
        return json(
          {
            status: "FAILED",
            reason: charge?.errors?.[0]?.description || `HTTP ${tapRes.status}`,
          },
          200,
        );
      }

      if (charge.status === "CAPTURED") {
        const { data: newBalance, error: rpcError } = await supabase.rpc(
          "add_tokens",
          {
            p_tokens: tokens,
            p_amount: amount,
            p_currency: currency,
            p_reference: charge.id,
          },
        );
        if (rpcError) {
          return json(
            {
              status: "CREDIT_FAILED",
              reason: rpcError.message,
              chargeId: charge.id,
            },
            500,
          );
        }
        return json({
          status: "CAPTURED",
          chargeId: charge.id,
          newBalance,
        });
      }

      const failReason =
        charge?.response?.message || charge?.message || charge.status;
      await supabase.rpc("record_failed_transaction", {
        p_amount: amount,
        p_currency: currency,
        p_reference: charge.id || `fail_${Date.now()}`,
        p_reason: String(failReason).slice(0, 200),
      });
      return json({
        status: charge.status || "FAILED",
        reason: failReason,
        chargeId: charge.id,
      });
    }

    // ===================================================================
    // MODE 1: create a new charge
    // ===================================================================
    const { token, amount, currency, tokens, return_url } = body as {
      token?: string;
      amount?: number;
      currency?: string;
      tokens?: number;
      return_url?: string;
    };

    if (!token || typeof token !== "string" || !token.startsWith("tok_")) {
      return json({ error: "Missing or invalid token" }, 400);
    }
    if (typeof amount !== "number" || amount <= 0) {
      return json({ error: "Invalid amount" }, 400);
    }
    if (!currency || typeof currency !== "string") {
      return json({ error: "Invalid currency" }, 400);
    }
    if (typeof tokens !== "number" || tokens <= 0) {
      return json({ error: "Invalid tokens count" }, 400);
    }

    // pull profile for customer info
    const { data: profile } = await supabase
      .from("profiles")
      .select("name")
      .eq("id", user.id)
      .single();

    const name = (profile?.name as string) ?? "";
    const [firstWord, ...rest] = name.trim().split(/\s+/).filter(Boolean);
    const firstName = (firstWord || "Test").slice(0, 30);
    const lastName = (rest.join(" ") || "User").slice(0, 30);

    const origin = req.headers.get("origin") || "";
    const redirectUrl = return_url || `${origin}/user`;

    const chargePayload = {
      amount,
      currency,
      threeDSecure: true, // merchant requires 3DS
      save_card: false,
      description: `Purchase of ${tokens} TodoApp tokens`,
      statement_descriptor: "TodoApp",
      reference: { order: `tdo_${user.id.slice(0, 8)}_${Date.now()}` },
      metadata: { user_id: user.id, tokens },
      receipt: { email: false, sms: false },
      customer: {
        first_name: firstName,
        last_name: lastName,
        email: user.email ?? "",
      },
      source: { id: token },
      redirect: { url: redirectUrl },
      post: { url: redirectUrl },
    };

    const tapRes = await fetch(`${TAP_BASE}/charges`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TAP_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(chargePayload),
    });

    const charge = await tapRes.json().catch(() => ({} as any));

    if (!tapRes.ok) {
      const reason =
        charge?.errors?.[0]?.description ||
        charge?.message ||
        `Tap returned ${tapRes.status}`;
      await supabase.rpc("record_failed_transaction", {
        p_amount: amount,
        p_currency: currency,
        p_reference: charge?.id || `http_${tapRes.status}`,
        p_reason: `HTTP ${tapRes.status}: ${reason}`.slice(0, 200),
      });
      return json({ status: "FAILED", reason, chargeId: charge?.id }, 200);
    }

    const status: string = charge.status || "UNKNOWN";

    // ---------- CAPTURED → credit immediately ----------
    if (status === "CAPTURED") {
      const { data: newBalance, error: rpcError } = await supabase.rpc(
        "add_tokens",
        {
          p_tokens: tokens,
          p_amount: amount,
          p_currency: currency,
          p_reference: charge.id,
        },
      );
      if (rpcError) {
        return json(
          {
            status: "CREDIT_FAILED",
            reason: rpcError.message,
            chargeId: charge.id,
          },
          500,
        );
      }
      return json({ status: "CAPTURED", chargeId: charge.id, newBalance });
    }

    // ---------- INITIATED → return 3DS redirect URL ----------
    if (status === "INITIATED" && charge.transaction?.url) {
      return json({
        status: "INITIATED",
        chargeId: charge.id,
        redirectUrl: charge.transaction.url,
      });
    }

    // ---------- anything else → log + return ----------
    const failReason =
      charge?.response?.message ||
      charge?.response?.code ||
      charge?.message ||
      status;

    await supabase.rpc("record_failed_transaction", {
      p_amount: amount,
      p_currency: currency,
      p_reference: charge?.id || `fail_${Date.now()}`,
      p_reason: String(failReason).slice(0, 200),
    });

    return json({ status, reason: failReason, chargeId: charge?.id });
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});
