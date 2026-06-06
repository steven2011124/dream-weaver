// Fetch top news headlines via NewsAPI.
// Defaults to Kenya. Supports topic mix: politics, tech, AI, schools.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface NewsArticle {
  title: string;
  description: string | null;
  url: string;
  source: string;
  publishedAt: string;
  imageUrl: string | null;
}

const TOPIC_QUERIES: Record<string, string> = {
  politics: "Kenya politics OR parliament OR Ruto OR government",
  tech: "Kenya tech OR startup OR technology OR Safaricom",
  ai: "Kenya AI OR artificial intelligence OR machine learning",
  schools: "Kenya school strike OR education OR university OR teachers",
  business: "Kenya business OR economy OR shilling",
  sports: "Kenya sports OR Harambee Stars OR athletics",
};

async function fetchEverything(apiKey: string, q: string, pageSize: number): Promise<NewsArticle[]> {
  const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(q)}&language=en&sortBy=publishedAt&pageSize=${pageSize}`;
  const r = await fetch(url, { headers: { "X-Api-Key": apiKey, "User-Agent": "SARVIS/1.0" } });
  if (!r.ok) return [];
  const data = await r.json();
  return (data.articles ?? []).map((a: Record<string, unknown>) => ({
    title: String(a.title ?? "").trim(),
    description: a.description ? String(a.description).trim() : null,
    url: String(a.url ?? ""),
    source: String((a.source as Record<string, unknown>)?.name ?? "Unknown"),
    publishedAt: String(a.publishedAt ?? ""),
    imageUrl: a.urlToImage ? String(a.urlToImage) : null,
  })).filter((a: NewsArticle) => a.title && a.url);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { query, country, topic, pageSize } = await req.json().catch(() => ({}));
    const NEWS_API_KEY = Deno.env.get("NEWS_API_KEY");
    if (!NEWS_API_KEY) {
      return new Response(JSON.stringify({ error: "NEWS_API_KEY not configured" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const safePageSize = Math.min(Math.max(parseInt(pageSize) || 8, 1), 12);
    const ctry = (typeof country === "string" && /^[a-z]{2}$/i.test(country) ? country : "ke").toLowerCase();

    // Explicit user query overrides everything
    if (typeof query === "string" && query.trim().length > 0) {
      const articles = await fetchEverything(NEWS_API_KEY, query.trim().slice(0, 200), safePageSize);
      return new Response(JSON.stringify({ articles, query }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Topic-based query (Kenya focus)
    const t = typeof topic === "string" ? topic.toLowerCase() : "mix";
    if (t !== "mix" && TOPIC_QUERIES[t]) {
      const articles = await fetchEverything(NEWS_API_KEY, TOPIC_QUERIES[t], safePageSize);
      return new Response(JSON.stringify({ articles, topic: t }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Default: mix of Kenya politics + schools + tech + AI, interleaved
    const buckets = await Promise.all([
      fetchEverything(NEWS_API_KEY, TOPIC_QUERIES.politics, 3),
      fetchEverything(NEWS_API_KEY, TOPIC_QUERIES.schools, 3),
      fetchEverything(NEWS_API_KEY, TOPIC_QUERIES.tech, 3),
      fetchEverything(NEWS_API_KEY, TOPIC_QUERIES.ai, 3),
    ]);
    const seen = new Set<string>();
    const mixed: NewsArticle[] = [];
    const maxLen = Math.max(...buckets.map((b) => b.length));
    for (let i = 0; i < maxLen && mixed.length < safePageSize; i++) {
      for (const b of buckets) {
        const a = b[i];
        if (a && !seen.has(a.url)) {
          seen.add(a.url);
          mixed.push(a);
          if (mixed.length >= safePageSize) break;
        }
      }
    }
    // Fallback to top-headlines KE if nothing
    if (mixed.length === 0) {
      const url = `https://newsapi.org/v2/top-headlines?country=${ctry}&pageSize=${safePageSize}`;
      const r = await fetch(url, { headers: { "X-Api-Key": NEWS_API_KEY, "User-Agent": "SARVIS/1.0" } });
      if (r.ok) {
        const data = await r.json();
        const articles: NewsArticle[] = (data.articles ?? []).map((a: Record<string, unknown>) => ({
          title: String(a.title ?? "").trim(),
          description: a.description ? String(a.description).trim() : null,
          url: String(a.url ?? ""),
          source: String((a.source as Record<string, unknown>)?.name ?? "Unknown"),
          publishedAt: String(a.publishedAt ?? ""),
          imageUrl: a.urlToImage ? String(a.urlToImage) : null,
        }));
        return new Response(JSON.stringify({ articles, country: ctry }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({ articles: mixed, topic: "mix", country: ctry }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("get-news error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
