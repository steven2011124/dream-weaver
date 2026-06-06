import { useEffect, useState } from "react";
import { PlayCircle, Loader2, RefreshCw, Eye, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getYouTubeTrending, type YouTubeTrendingVideo } from "@/lib/google";

export const TrendingVideosWidget = () => {
  const [videos, setVideos] = useState<YouTubeTrendingVideo[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    const r = await getYouTubeTrending("KE", 8);
    if (r.error) setError(r.error);
    else setVideos(r.videos ?? []);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  const featured = playing
    ? videos?.find((v) => v.videoId === playing)
    : videos?.[0];

  return (
    <div className="flex flex-col rounded-2xl border border-border bg-card overflow-hidden">
      <header className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <PlayCircle className="h-4 w-4 text-foreground/80" />
          <h3 className="text-sm font-semibold">Trending in Kenya</h3>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={refresh} disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </Button>
      </header>

      <div className="p-3">
        {error && <div className="text-xs text-destructive">{error}</div>}
        {!error && !videos && <Skeleton className="aspect-video w-full rounded-md" />}

        {featured && (
          <div className="relative overflow-hidden rounded-md border border-border bg-black">
            {playing ? (
              <>
                <iframe
                  className="aspect-video w-full"
                  src={`https://www.youtube.com/embed/${playing}?autoplay=1&rel=0`}
                  title={featured.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
                <button
                  onClick={() => setPlaying(null)}
                  className="absolute right-2 top-2 rounded-full bg-black/70 p-1 text-white hover:bg-black"
                  aria-label="Close"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </>
            ) : (
              <button
                onClick={() => setPlaying(featured.videoId)}
                className="group relative block w-full"
              >
                <img
                  src={featured.thumbnail}
                  alt={featured.title}
                  className="aspect-video w-full object-cover"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/50 transition-colors">
                  <PlayCircle className="h-12 w-12 text-white drop-shadow-lg" strokeWidth={1.5} />
                </div>
              </button>
            )}
            <div className="p-2.5">
              <div className="line-clamp-2 text-xs font-semibold text-foreground">{featured.title}</div>
              <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground tabular-nums">
                <span>{featured.channel}</span>
                <span className="flex items-center gap-0.5">
                  <Eye className="h-2.5 w-2.5" />
                  {featured.views.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {videos && videos.length > 1 && (
        <div className="border-t border-border/60 px-3 py-2">
          <ol className="grid grid-cols-2 gap-2 max-h-[260px] overflow-auto">
            {videos.slice(0, 8).map((v) => (
              <li key={v.videoId}>
                <button
                  onClick={() => setPlaying(v.videoId)}
                  className="block w-full text-left rounded-md hover:bg-secondary/50 p-1 transition-colors"
                >
                  <img
                    src={v.thumbnail}
                    alt={v.title}
                    loading="lazy"
                    className="aspect-video w-full rounded object-cover border border-border"
                  />
                  <div className="mt-1 line-clamp-2 text-[11px] font-medium text-foreground/90 leading-snug">
                    {v.title}
                  </div>
                  <div className="text-[9px] text-muted-foreground tabular-nums">
                    {v.views.toLocaleString()} views
                  </div>
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
};
