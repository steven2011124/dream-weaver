import { useState, useEffect } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, MessageSquare, Pencil, Trash2, Settings, PanelLeftClose, PanelLeftOpen, X, Cpu, Battery, HardDrive, Wifi, Bluetooth, User, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Chat } from "@/lib/sarvis";
import { ScrollArea } from "@/components/ui/scroll-area";
import sarvisLogo from "@/assets/sarvis-logo.png";

const ModelToggle = () => {
  const [mode, setMode] = useState<'online'|'offline'>('online');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch('/api/ai-mode');
        if (!res.ok) return;
        const j = await res.json();
        if (mounted && j && j.mode) setMode(j.mode);
      } catch (e) { /* ignore */ }
    })();
    return () => { mounted = false };
  }, []);

  const setServerMode = async (newMode: 'online'|'offline', modelName?: string) => {
    setLoading(true);
    try {
      await fetch('/api/ai-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: newMode, model: modelName }),
      });
      setMode(newMode);
    } catch (e) {
      console.error('Failed to set ai mode', e);
    } finally {
      setLoading(false);
    }
  };

  const onToggle = async () => {
    if (mode === 'online') {
      // switch to offline -> ask user to pick a gguf file
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.gguf';
      input.onchange = async () => {
        const f = input.files?.[0];
        if (!f) return;
        const arr = await f.arrayBuffer();
        const header = new Uint8Array(arr.slice(0,4));
        const magic = String.fromCharCode(...header);
        if (magic !== 'GGUF') {
          alert('Selected file does not appear to be a GGUF model');
          return;
        }
        // send base64 to backend for saving
        const b64 = btoa(String.fromCharCode(...new Uint8Array(arr)));
        setLoading(true);
        try {
          const r = await fetch('/api/upload-model', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: f.name, dataBase64: b64 }),
          });
          if (r.ok) {
            await setServerMode('offline', f.name);
          } else {
            alert('Upload failed');
          }
        } catch (e) {
          console.error(e);
          alert('Upload failed');
        } finally { setLoading(false); }
      };
      input.click();
    } else {
      // offline -> go online
      await setServerMode('online');
    }
  };

  return (
    <button
      title={loading ? 'Updating...' : mode === 'online' ? 'AI: Online (click to go offline)' : 'AI: Offline (click to go online)'}
      onClick={onToggle}
      className="flex items-center gap-2"
      style={{ cursor: loading ? 'wait' : 'pointer' }}
    >
      <span
        className="h-3 w-3 rounded-full"
        style={{ backgroundColor: mode === 'online' ? '#16a34a' : '#ef4444', display: 'inline-block' }}
      />
      <span className="text-[11px] text-muted-foreground">{mode === 'online' ? 'Online' : 'Offline'}</span>
    </button>
  );
};

interface SystemInfo {
  os: string;
  username: string;
  time: string;
  uptime: string;
  cpu?: string;
  ram?: string;
  storage?: string;
  battery?: string;
  wifi?: string;
  netStat?: string;
  bluetooth?: string;
}

const BACKEND_URL_FOR_SYSINFO =
  (import.meta.env.VITE_BACKEND_URL as string | undefined) ?? "http://localhost:3001";

const SystemInfoComponent = () => {
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);

  const fetchSystemInfo = async () => {
    setRefreshing(true);
    try {
      const response = await fetch(`${BACKEND_URL_FOR_SYSINFO}/api/system-info?t=${Date.now()}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(1500),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setSystemInfo(data);
      setLastSynced(new Date());
      setUnavailable(false);
    } catch {
      setUnavailable(true);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    const sync = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      await fetchSystemInfo();
      inFlight = false;
    };

    sync();
    const interval = setInterval(sync, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (unavailable && !systemInfo) {
    return (
      <div className="p-4 border-t border-sidebar-border space-y-2">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          System Info
        </div>
        <div className="flex items-center gap-2">
          <ModelToggle />
        </div>
        <div className="text-xs text-muted-foreground">
          Local bridge offline. Retrying automatically…
        </div>
      </div>
    );
  }

  if (!systemInfo) {
    return (
      <div className="p-4 border-t border-sidebar-border">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <RefreshCw className="h-3 w-3 animate-spin" />
          Syncing system info…
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 border-t border-sidebar-border space-y-2">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          System Info
        </div>
        <button
          type="button"
          onClick={fetchSystemInfo}
          className="rounded p-1 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
          aria-label="Refresh system info"
          title="Refresh system info"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>
      <div className="space-y-1 text-xs">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium">&nbsp;</div>
          <div className="flex items-center gap-2">
            <ModelToggle />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <User className="h-3 w-3" />
          <span>{systemInfo.username}</span>
        </div>
        <div className="flex items-center gap-2">
          <Cpu className="h-3 w-3" />
          <span>CPU: {systemInfo.cpu || 'N/A'}%</span>
        </div>
        <div className="flex items-center gap-2">
          <HardDrive className="h-3 w-3" />
          <span>RAM: {systemInfo.ram || 'N/A'}</span>
        </div>
        <div className="flex items-center gap-2">
          <HardDrive className="h-3 w-3" />
          <span>Storage: {systemInfo.storage || 'N/A'}</span>
        </div>
        <div className="flex items-center gap-2">
          <Battery className="h-3 w-3" />
          <span>Battery: {systemInfo.battery || 'N/A'}</span>
        </div>
        <div className="flex items-center gap-2">
          <Wifi className="h-3 w-3" />
          <span>WiFi: {systemInfo.wifi || 'N/A'}</span>
        </div>
        <div className="flex items-center gap-2">
          <Bluetooth className="h-3 w-3" />
          <span>Bluetooth: {systemInfo.bluetooth || 'N/A'}</span>
        </div>
        <div className="text-xs text-muted-foreground mt-2">
          Uptime: {systemInfo.uptime}
        </div>
        {lastSynced && (
          <div className="text-[11px] text-muted-foreground/80">
            Synced {lastSynced.toLocaleTimeString()}
          </div>
        )}
      </div>
    </div>
  );
};

interface ChatSidebarProps {
  chats: Chat[];
  activeId: string | null;
  collapsed: boolean;
  isMobile?: boolean;
  mobileOpen?: boolean;
  onToggleCollapse: () => void;
  onCloseMobile?: () => void;
  onNew: () => void;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onOpenSettings: () => void;
}

export const ChatSidebar = ({
  chats,
  activeId,
  collapsed,
  isMobile = false,
  mobileOpen = false,
  onToggleCollapse,
  onCloseMobile,
  onNew,
  onSelect,
  onRename,
  onDelete,
  onOpenSettings,
}: ChatSidebarProps) => {
  const [renameTarget, setRenameTarget] = useState<Chat | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Chat | null>(null);

  const startRename = (chat: Chat) => {
    setRenameTarget(chat);
    setRenameValue(chat.title);
  };

  const confirmRename = () => {
    if (renameTarget && renameValue.trim()) {
      onRename(renameTarget.id, renameValue.trim());
    }
    setRenameTarget(null);
  };

  if (collapsed && !isMobile) {
    return (
      <aside className="flex h-full w-14 shrink-0 flex-col items-center border-r border-sidebar-border bg-sidebar py-3 gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleCollapse}
          aria-label="Open sidebar"
          className="h-9 w-9"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onNew}
          aria-label="New chat"
          className="h-9 w-9"
        >
          <Plus className="h-4 w-4" />
        </Button>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenSettings}
          aria-label="Settings"
          className="h-9 w-9"
        >
          <Settings className="h-4 w-4" />
        </Button>
      </aside>
    );
  }

  const sidebarInner = (
    <aside
      className={cn(
        "flex h-full flex-col border-r border-sidebar-border bg-sidebar",
        isMobile
          ? "w-[80vw] max-w-xs"
          : "w-64 lg:w-72 xl:w-80 2xl:w-96 shrink-0",
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3">
        <div className="flex items-center gap-2 px-1">
          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-primary/40 bg-background overflow-hidden glow-ring">
            <img src={sarvisLogo} alt="SARVIS" className="h-full w-full object-cover" />
          </div>
          <span className="text-sm font-semibold tracking-wider text-sidebar-foreground text-glow">SARVIS</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={isMobile ? onCloseMobile : onToggleCollapse}
          aria-label={isMobile ? "Close sidebar" : "Collapse sidebar"}
          className="h-8 w-8"
        >
          {isMobile ? <X className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </Button>
      </div>

      {/* New chat */}
      <div className="px-3 pb-2">
        <Button
          onClick={onNew}
          variant="outline"
          className="w-full justify-start gap-2 h-9 bg-transparent text-sidebar-foreground border-sidebar-border hover:bg-sidebar-accent"
        >
          <Plus className="h-4 w-4" />
          New chat
        </Button>
      </div>

      {/* Chat list */}
      <ScrollArea className="flex-1 px-2 py-2 scrollbar-thin">
        {chats.length > 0 && (
          <div className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Chats
          </div>
        )}
        <div className="space-y-0.5">
          {chats.length === 0 ? (
            <p className="px-3 py-8 text-center text-xs text-muted-foreground">
              No conversations yet.
            </p>
          ) : (
            chats.map((chat) => (
              <div
                key={chat.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelect(chat.id)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(chat.id)}
                className={cn(
                  "group relative flex items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors cursor-pointer",
                  activeId === chat.id
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60",
                )}
              >
                <MessageSquare className="h-4 w-4 shrink-0 opacity-60" />
                <span className="flex-1 truncate">{chat.title}</span>

                <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      startRename(chat);
                    }}
                    className="rounded p-1 hover:bg-background/40"
                    aria-label="Rename chat"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(chat);
                    }}
                    className="rounded p-1 hover:bg-destructive/20 hover:text-destructive"
                    aria-label="Delete chat"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      {/* System Info */}
      <SystemInfoComponent />

      {/* Footer */}
      <div className="border-t border-sidebar-border p-2">
        <Button
          variant="ghost"
          onClick={onOpenSettings}
          className="w-full justify-start gap-2 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          <Settings className="h-4 w-4" />
          Settings
        </Button>
      </div>

      {/* Rename dialog */}
      <Dialog open={!!renameTarget} onOpenChange={(o) => !o && setRenameTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename chat</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && confirmRename()}
            autoFocus
            placeholder="Chat title"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameTarget(null)}>
              Cancel
            </Button>
            <Button onClick={confirmRename}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.title}" will be permanently removed. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteTarget) onDelete(deleteTarget.id);
                setDeleteTarget(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  );

  if (isMobile) {
    return (
      <>
        {mobileOpen && (
          <div
            className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm md:hidden animate-in fade-in duration-150"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
        )}
        <div
          className={cn(
            "fixed inset-y-0 left-0 z-50 md:hidden transition-transform duration-200",
            mobileOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          {sidebarInner}
        </div>
      </>
    );
  }

  return sidebarInner;
};
