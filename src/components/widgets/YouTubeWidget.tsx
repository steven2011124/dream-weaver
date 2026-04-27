import { useEffect, useRef, useState } from "react";
import { Youtube, Loader2, RefreshCw, Users, PartyPopper, Eye, ThumbsUp, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { getYouTubeAnalytics, type YouTubeAnalytics } from "@/lib/google";

const STORAGE_KEY = "yt_last_subscribers";
const POLL_MS = 3 * 60 * 1000; // 3 minutes

const formatRelative = (iso: string): string => {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const day = 86_400_000;
  if (diff < day) return "today";
  if (diff < 2 * day) return "yesterday";
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  if (diff < 30 * day) return `${Math.floor(diff / (7 * day))}w ago`;
  if (diff < 365 * day) return `${Math.floor(diff / (30 * day))}mo ago`;
  return `${Math.floor(diff / (365 * day))}y ago`;
};

export const YouTubeWidget = () => {
  const [data, setData] = useState<YouTubeAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastNotifiedRef = useRef<number | null>(null);

  const refresh = async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    const r = await getYouTubeAnalytics();
    if (!silent) setLoading(false);
    if (r.error) {
      if (!silent) setError(r.error);
      return;
    }
    if (!r.analytics) return;
    setData(r.analytics);

    const ch = r.analytics.channel;
    if (ch.subscriberHidden) return;
    const stored = lastNotifiedRef.current;
    if (stored !== null && ch.subscriberCount > stored) {
      const diff = ch.subscriberCount - stored;
      toast.success(
        `🎉 ${diff} new subscriber${diff > 1 ? "s" : ""}! Congrats — you're at ${ch.subscriberCount.toLocaleString()}.`,
        { duration: 8000 },
      );
    }
    lastNotifiedRef.current = ch.subscriberCount;
    localStorage.setItem(STORAGE_KEY, String(ch.subscriberCount));
  };

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) lastNotifiedRef.current = parseInt(stored);
    refresh();
    const id = setInterval(() => refresh(true), POLL_MS);
    return () => clearInterval(id);
  }, []);

  const channel = data?.channel;
  const recent = data?.recent ?? [];

  return (
    <div className="flex flex-col rounded-2xl border border-border bg-card overflow-hidden">
      <header className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <Youtube className="h-4 w-4 text-foreground/80" />
          <h3 className="text-sm font-semibold">YouTube</h3>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => refresh()} disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </Button>
      </header>
      <div className="p-4">
        {error && <div className="text-xs text-destructive">{error}</div>}
        {!error && !channel && <Skeleton className="h-24 w-full" />}
        {channel && (
          <div className="flex items-center gap-3">
            {channel.thumbnail && (
              <img src={channel.thumbnail} alt={channel.title} className="h-14 w-14 rounded-full border border-border" />
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-foreground">{channel.title}</div>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Users className="h-3 w-3" />
                {channel.subscriberHidden ? (
                  <span>Subscribers hidden</span>
                ) : (
                  <span className="tabular-nums">{channel.subscriberCount.toLocaleString()} subscribers</span>
                )}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground/80 tabular-nums">
                {channel.videoCount} videos · {channel.viewCount.toLocaleString()} views
              </div>
            </div>
          </div>
        )}
      </div>

      {recent.length > 0 && (
        <div className="border-t border-border/60 px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recent videos</h4>
            <span className="text-[10px] text-muted-foreground/70 tabular-nums">{recent.length}</span>
          </div>
          <ol className="max-h-[280px] space-y-2 overflow-auto pr-1">
            {recent.map((v) => (
              <li key={v.videoId}>
                <a
                  href={`https://www.youtube.com/watch?v=${v.videoId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex gap-2.5 rounded-md p-1.5 hover:bg-secondary/50 transition-colors"
                >
                  <img
                    src={v.thumbnail}
                    alt={v.title}
                    loading="lazy"
                    className="h-12 w-20 shrink-0 rounded object-cover border border-border"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-2 text-xs font-medium text-foreground/90 leading-snug">{v.title}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground/80 tabular-nums">
                      <span className="flex items-center gap-0.5"><Eye className="h-2.5 w-2.5" />{v.views.toLocaleString()}</span>
                      <span className="flex items-center gap-0.5"><ThumbsUp className="h-2.5 w-2.5" />{v.likes.toLocaleString()}</span>
                      <span className="flex items-center gap-0.5"><MessageSquare className="h-2.5 w-2.5" />{v.comments.toLocaleString()}</span>
                      <span>· {formatRelative(v.publishedAt)}</span>
                    </div>
                  </div>
                </a>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="flex items-center gap-1.5 border-t border-border/60 px-4 py-2 text-[11px] text-muted-foreground/70">
        <PartyPopper className="h-3 w-3" />
        Auto-checks every 3 min — toast on new subs.
      </div>
    </div>
  );
};
