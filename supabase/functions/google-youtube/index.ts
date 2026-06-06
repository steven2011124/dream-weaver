// YouTube edge function — channel info, search, basic analytics summary.

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
  if (!clientId || !clientSecret || !refreshToken) throw new Error("Google OAuth secrets not configured");
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action ?? "channel";
    const token = await getGoogleAccessToken();
    const auth = { Authorization: `Bearer ${token}` };

    if (action === "channel" || action === "analytics") {
      const channelId = body.channelId || Deno.env.get("YOUTUBE_CHANNEL_ID");
      const url = channelId
        ? `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${channelId}`
        : `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true`;
      const r = await fetch(url, { headers: auth });
      if (!r.ok) throw new Error(`YouTube channel ${r.status}: ${await r.text()}`);
      const data = await r.json();
      const ch = data.items?.[0];
      if (!ch) {
        return new Response(JSON.stringify({ error: "channel not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const channel = {
        id: ch.id,
        title: ch.snippet?.title,
        thumbnail: ch.snippet?.thumbnails?.default?.url,
        subscriberCount: parseInt(ch.statistics?.subscriberCount ?? "0"),
        subscriberHidden: ch.statistics?.hiddenSubscriberCount === true,
        viewCount: parseInt(ch.statistics?.viewCount ?? "0"),
        videoCount: parseInt(ch.statistics?.videoCount ?? "0"),
      };

      if (action === "channel") {
        return new Response(JSON.stringify(channel), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ---- analytics: pull recent uploads + their per-video stats ----
      const uploadsPlaylist = `UU${(channel.id ?? "").slice(2)}`;
      const playR = await fetch(
        `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&maxResults=10&playlistId=${uploadsPlaylist}`,
        { headers: auth },
      );
      let recent: Array<Record<string, unknown>> = [];
      if (playR.ok) {
        const playJson = await playR.json();
        const ids = (playJson.items ?? [])
          .map((it: Record<string, any>) => it.contentDetails?.videoId)
          .filter(Boolean)
          .join(",");
        if (ids) {
          const vR = await fetch(
            `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${ids}`,
            { headers: auth },
          );
          if (vR.ok) {
            const vJson = await vR.json();
            recent = (vJson.items ?? []).map((v: Record<string, any>) => ({
              videoId: v.id,
              title: v.snippet?.title,
              publishedAt: v.snippet?.publishedAt,
              thumbnail: v.snippet?.thumbnails?.medium?.url,
              views: parseInt(v.statistics?.viewCount ?? "0"),
              likes: parseInt(v.statistics?.likeCount ?? "0"),
              comments: parseInt(v.statistics?.commentCount ?? "0"),
            }));
          }
        }
      }

      const top = [...recent].sort((a, b) => Number(b.views ?? 0) - Number(a.views ?? 0)).slice(0, 5);
      const totalRecentViews = recent.reduce((s, v) => s + Number(v.views ?? 0), 0);
      const avgViews = recent.length ? Math.round(totalRecentViews / recent.length) : 0;

      return new Response(
        JSON.stringify({ channel, recent, top, totalRecentViews, avgViews }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (action === "search") {
      const q = String(body.query ?? "").trim();
      const max = Math.min(Math.max(parseInt(body.max) || 6, 1), 15);
      if (!q) {
        return new Response(JSON.stringify({ error: "query required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=${max}&q=${encodeURIComponent(q)}`;
      const r = await fetch(url, { headers: auth });
      if (!r.ok) throw new Error(`YouTube search ${r.status}: ${await r.text()}`);
      const data = await r.json();
      const videos = (data.items ?? []).map((it: Record<string, any>) => ({
        videoId: it.id?.videoId,
        title: it.snippet?.title,
        description: it.snippet?.description,
        channel: it.snippet?.channelTitle,
        publishedAt: it.snippet?.publishedAt,
        thumbnail: it.snippet?.thumbnails?.medium?.url,
      }));
      return new Response(JSON.stringify({ videos }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "trending") {
      const region = String(body.region ?? "KE").toUpperCase().slice(0, 2);
      const max = Math.min(Math.max(parseInt(body.max) || 8, 1), 20);
      const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&chart=mostPopular&regionCode=${region}&maxResults=${max}`;
      const r = await fetch(url, { headers: auth });
      if (!r.ok) throw new Error(`YouTube trending ${r.status}: ${await r.text()}`);
      const data = await r.json();
      const videos = (data.items ?? []).map((v: Record<string, any>) => ({
        videoId: v.id,
        title: v.snippet?.title,
        description: v.snippet?.description,
        channel: v.snippet?.channelTitle,
        publishedAt: v.snippet?.publishedAt,
        thumbnail: v.snippet?.thumbnails?.medium?.url ?? v.snippet?.thumbnails?.high?.url,
        views: parseInt(v.statistics?.viewCount ?? "0"),
        likes: parseInt(v.statistics?.likeCount ?? "0"),
      }));
      return new Response(JSON.stringify({ videos, region }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("google-youtube error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
