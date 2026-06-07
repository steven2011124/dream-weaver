import { useEffect, useState } from "react";
import { Mail, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  listGmail,
  getGmailMessage,
  markGmailRead,
  type GmailMessage,
  type GmailFullMessage,
} from "@/lib/google";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

export const GmailWidget = () => {
  const [messages, setMessages] = useState<GmailMessage[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [openId, setOpenId] = useState<string | null>(null);
  const [openMsg, setOpenMsg] = useState<GmailFullMessage | null>(null);
  const [openLoading, setOpenLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    const r = await listGmail(8);
    if (r.error) setError(r.error);
    else setMessages(r.messages ?? []);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleOpen = async (m: GmailMessage) => {
    setOpenId(m.id);
    setOpenMsg(null);
    setOpenLoading(true);
    const r = await getGmailMessage(m.id);
    setOpenLoading(false);
    if (r.error) {
      toast.error(r.error);
      setOpenId(null);
      return;
    }
    setOpenMsg(r.message ?? null);

    // If it was unread, mark it read in Gmail and locally.
    if (m.unread) {
      const mr = await markGmailRead([m.id]);
      if (mr.error) {
        toast.message("Couldn't mark as read", { description: mr.error });
      } else {
        setMessages((prev) =>
          prev ? prev.map((x) => (x.id === m.id ? { ...x, unread: false } : x)) : prev,
        );
      }
    }
  };

  const close = () => {
    setOpenId(null);
    setOpenMsg(null);
  };

  return (
    <div className="flex flex-col rounded-2xl border border-border bg-card overflow-hidden">
      <header className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-foreground/80" />
          <h3 className="text-sm font-semibold">Gmail</h3>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={refresh} disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </Button>
      </header>
      <div className="max-h-[360px] flex-1 overflow-auto">
        {error && <div className="p-4 text-xs text-destructive">{error}</div>}
        {!error && messages === null && (
          <div className="space-y-2 p-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        )}
        {messages?.length === 0 && <div className="p-4 text-xs text-muted-foreground">Inbox is empty.</div>}
        {messages && messages.length > 0 && (
          <ol className="divide-y divide-border">
            {messages.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => handleOpen(m)}
                  className="block w-full text-left px-4 py-2.5 text-sm hover:bg-secondary/40 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`truncate ${m.unread ? "font-semibold text-foreground" : "text-foreground/80"}`}>
                      {m.from.split("<")[0].trim()}
                    </span>
                    {m.unread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                  </div>
                  <div className={`truncate text-[13px] ${m.unread ? "text-foreground" : "text-muted-foreground"}`}>
                    {m.subject}
                  </div>
                  <div className="truncate text-xs text-muted-foreground/80">{m.snippet}</div>
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>

      <Dialog open={openId !== null} onOpenChange={(o) => !o && close()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="pr-6">{openMsg?.subject ?? "Loading…"}</DialogTitle>
            <DialogDescription className="text-xs">
              {openMsg ? (
                <>
                  <span className="font-medium text-foreground">{openMsg.from}</span>
                  {openMsg.date && <span> · {openMsg.date}</span>}
                </>
              ) : "Fetching message…"}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] rounded-md border border-border bg-background/50 p-3">
            {openLoading && (
              <div className="space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            )}
            {!openLoading && openMsg && (
              <div className="space-y-3">
                {openMsg.scopeWarning && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                    {openMsg.scopeWarning}
                  </div>
                )}
                <pre className="whitespace-pre-wrap break-words font-sans text-sm text-foreground/90">
                  {openMsg.body || openMsg.snippet || (openMsg.bodyUnavailable ? "Body preview unavailable until Gmail readonly scope is granted." : "(empty body)")}
                </pre>
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
};
