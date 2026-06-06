import { useEffect, useState } from "react";
import { Newspaper, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getNews, type NewsArticle } from "@/lib/sarvis";
import { cn } from "@/lib/utils";

const TOPICS = [
  { id: "mix", label: "For You" },
  { id: "politics", label: "Politics" },
  { id: "schools", label: "Schools" },
  { id: "tech", label: "Tech" },
  { id: "ai", label: "AI" },
];

export const NewsWidget = () => {
  const [articles, setArticles] = useState<NewsArticle[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [topic, setTopic] = useState<string>("mix");

  const refresh = async (t = topic) => {
    setLoading(true);
    setError(null);
    const r = await getNews({ topic: t, country: "ke", pageSize: 8 });
    if (r.error) setError(r.error);
    else setArticles(r.articles ?? []);
    setLoading(false);
  };

  useEffect(() => {
    refresh(topic);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic]);

  return (
    <div className="flex flex-col rounded-2xl border border-border bg-card overflow-hidden">
      <header className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <Newspaper className="h-4 w-4 text-foreground/80" />
          <h3 className="text-sm font-semibold">Kenya Headlines</h3>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => refresh()} disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </Button>
      </header>
      <div className="flex gap-1 overflow-x-auto border-b border-border/60 px-3 py-2">
        {TOPICS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTopic(t.id)}
            className={cn(
              "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
              topic === t.id
                ? "bg-primary text-primary-foreground"
                : "bg-secondary/50 text-muted-foreground hover:bg-secondary",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="max-h-[480px] flex-1 overflow-auto">
        {error && <div className="p-4 text-xs text-destructive">{error}</div>}
        {!error && articles === null && (
          <div className="space-y-2 p-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        )}
        {articles?.length === 0 && <div className="p-4 text-xs text-muted-foreground">No news right now.</div>}
        {articles && articles.length > 0 && (
          <ol className="divide-y divide-border">
            {articles.map((a, i) => (
              <li key={`${a.url}-${i}`}>
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex gap-3 px-3 py-2.5 hover:bg-secondary/40 transition-colors"
                >
                  {a.imageUrl ? (
                    <img
                      src={a.imageUrl}
                      alt=""
                      loading="lazy"
                      onError={(e) => ((e.currentTarget.style.display = "none"))}
                      className="h-16 w-20 shrink-0 rounded-md object-cover border border-border bg-muted"
                    />
                  ) : (
                    <div className="h-16 w-20 shrink-0 rounded-md bg-secondary/60 flex items-center justify-center">
                      <Newspaper className="h-5 w-5 text-muted-foreground/50" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-2 text-sm font-medium text-foreground leading-snug">{a.title}</div>
                    {a.description && (
                      <div className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground/90">{a.description}</div>
                    )}
                    <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground/80">
                      {a.source}
                      {a.publishedAt && <> · {new Date(a.publishedAt).toLocaleDateString()}</>}
                    </div>
                  </div>
                </a>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
};
