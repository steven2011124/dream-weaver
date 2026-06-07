// Gmail edge function — list inbox, get message, mark read, send email.
// Uses GOOGLE_REFRESH_TOKEN to auto-mint short-lived access tokens.
// v2 — adds get/markRead actions used by the dashboard widget.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

let cached: { token: string; expiresAt: number } | null = null;
async function getGoogleAccessToken(): Promise<string> {
  if (cached && Date.now() < cached.expiresAt - 5 * 60 * 1000) return cached.token;
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  const refreshToken = Deno.env.get("GOOGLE_REFRESH_TOKEN");
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Google OAuth secrets not configured");
  }
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!resp.ok) throw new Error(`Google token refresh ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  cached = { token: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return cached.token;
}

function base64UrlEncodeUtf8(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function buildRfc2822(to: string, subject: string, body: string, cc?: string, bcc?: string): string {
  const lines = [
    `To: ${to}`,
    cc ? `Cc: ${cc}` : "",
    bcc ? `Bcc: ${bcc}` : "",
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    body,
  ].filter(Boolean);
  return lines.join("\r\n");
}

interface MessageMeta {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  date: string;
  unread: boolean;
}

Deno.serve(async (req) => {
  console.log("[google-gmail v3] request received", req.method);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action ?? "list";
    const token = await getGoogleAccessToken();
    const auth = { Authorization: `Bearer ${token}` };

    if (action === "list") {
      const max = Math.min(Math.max(parseInt(body.max) || 8, 1), 25);
      const q = typeof body.query === "string" ? `&q=${encodeURIComponent(body.query)}` : "";
      const listUrl = (withQuery: boolean) =>
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${max}${withQuery ? q : ""}`;
      let listResp = await fetch(listUrl(true), { headers: auth });
      if (!listResp.ok) {
        const errText = await listResp.text();
        // Tokens granted only gmail.metadata cannot use Gmail's q search. Keep the inbox usable
        // by falling back to the latest messages instead of returning a hard failure.
        if (listResp.status === 403 && q && /Metadata scope does not support 'q' parameter/i.test(errText)) {
          listResp = await fetch(listUrl(false), { headers: auth });
        } else {
          throw new Error(`Gmail list ${listResp.status}: ${errText}`);
        }
      }
      if (!listResp.ok) throw new Error(`Gmail list ${listResp.status}: ${await listResp.text()}`);
      const list = await listResp.json();
      const ids: { id: string }[] = list.messages ?? [];

      const messages: MessageMeta[] = await Promise.all(
        ids.map(async ({ id }) => {
          const r = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
            { headers: auth },
          );
          const m = await r.json();
          const headers = (m.payload?.headers ?? []) as { name: string; value: string }[];
          const find = (n: string) => headers.find((h) => h.name.toLowerCase() === n.toLowerCase())?.value ?? "";
          return {
            id: m.id,
            from: find("From"),
            subject: find("Subject") || "(no subject)",
            snippet: m.snippet ?? "",
            date: find("Date"),
            unread: (m.labelIds ?? []).includes("UNREAD"),
          };
        }),
      );

      return new Response(JSON.stringify({ messages }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "send") {
      const { to, subject, body: emailBody, cc, bcc } = body;
      if (!to || !subject || !emailBody) {
        return new Response(JSON.stringify({ error: "to, subject, body required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const raw = base64UrlEncodeUtf8(buildRfc2822(to, subject, emailBody, cc, bcc));
      const r = await fetch(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        {
          method: "POST",
          headers: { ...auth, "Content-Type": "application/json" },
          body: JSON.stringify({ raw }),
        },
      );
      if (!r.ok) {
        const errText = await r.text();
        if (r.status === 403 && /insufficient/i.test(errText)) {
          throw new Error(
            "Gmail SEND scope missing on your refresh token. Re-authorize Google with the gmail.send scope and update GOOGLE_REFRESH_TOKEN.",
          );
        }
        throw new Error(`Gmail send ${r.status}: ${errText}`);
      }
      const sent = await r.json();
      return new Response(JSON.stringify({ ok: true, id: sent.id, threadId: sent.threadId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "markRead") {
      const ids: string[] = Array.isArray(body.ids) ? body.ids.filter((x: unknown) => typeof x === "string") : [];
      if (ids.length === 0) {
        return new Response(JSON.stringify({ ok: true, marked: 0 }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Gmail batchModify can do up to 1000 ids in one shot.
      const r = await fetch(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/batchModify",
        {
          method: "POST",
          headers: { ...auth, "Content-Type": "application/json" },
          body: JSON.stringify({ ids, removeLabelIds: ["UNREAD"] }),
        },
      );
      if (!r.ok) {
        const errText = await r.text();
        if (r.status === 403 && /insufficient/i.test(errText)) {
          throw new Error(
            "Gmail MODIFY scope missing on your refresh token. Re-authorize Google with the gmail.modify scope and update GOOGLE_REFRESH_TOKEN.",
          );
        }
        throw new Error(`Gmail markRead ${r.status}: ${errText}`);
      }
      return new Response(JSON.stringify({ ok: true, marked: ids.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "get") {
      const id = typeof body.id === "string" ? body.id : "";
      if (!id) {
        return new Response(JSON.stringify({ error: "id required" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      let usedMetadataFallback = false;
      let r = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
        { headers: auth },
      );
      if (!r.ok) {
        const errText = await r.text();
        // If the saved refresh token still only has gmail.metadata, FULL is forbidden.
        // Fall back to metadata/snippet so opening a message no longer crashes with 403.
        if (r.status === 403 && /Metadata scope/i.test(errText)) {
          usedMetadataFallback = true;
          r = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
            { headers: auth },
          );
        } else {
          throw new Error(`Gmail get ${r.status}: ${errText}`);
        }
      }
      if (!r.ok) throw new Error(`Gmail get ${r.status}: ${await r.text()}`);
      const m = await r.json();
      const headers = (m.payload?.headers ?? []) as { name: string; value: string }[];
      const find = (n: string) => headers.find((h) => h.name.toLowerCase() === n.toLowerCase())?.value ?? "";

      // Walk MIME parts and prefer text/plain, fall back to text/html stripped.
      const decode = (data: string) => {
        try {
          const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
          const bin = atob(b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), "="));
          const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
          return new TextDecoder("utf-8").decode(bytes);
        } catch { return ""; }
      };
      let bodyText = m.snippet ?? "";
      if (!usedMetadataFallback) {
        let plain = "";
        let html = "";
        const walk = (part: Record<string, any>) => {
          if (!part) return;
          const mime = part.mimeType ?? "";
          const data = part.body?.data;
          if (data && mime === "text/plain" && !plain) plain = decode(data);
          else if (data && mime === "text/html" && !html) html = decode(data);
          if (Array.isArray(part.parts)) part.parts.forEach(walk);
        };
        walk(m.payload ?? {});
        bodyText = plain || (html ? html.replace(/<style[\s\S]*?<\/style>/gi, "")
          .replace(/<script[\s\S]*?<\/script>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/&nbsp;/g, " ")
          .replace(/\s{2,}/g, " ")
          .trim() : (m.snippet ?? ""));
      }

      return new Response(JSON.stringify({
        id: m.id,
        from: find("From"),
        to: find("To"),
        subject: find("Subject") || "(no subject)",
        date: find("Date"),
        snippet: m.snippet ?? "",
        body: bodyText,
        unread: (m.labelIds ?? []).includes("UNREAD"),
        bodyUnavailable: usedMetadataFallback,
        scopeWarning: usedMetadataFallback
          ? "The saved Google refresh token only has Gmail metadata permission. Re-authorize it with https://www.googleapis.com/auth/gmail.readonly to read full email bodies."
          : undefined,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "unknown action" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("google-gmail error", e);
    // Return 200 with an error field so the client widget can render it
    // gracefully instead of triggering the runtime-error overlay.
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "error" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
