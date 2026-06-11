import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AppSettings,
  DEFAULT_SYSTEM_PROMPT,
  MODEL_OPTIONS,
  THEME_OPTIONS,
  Theme,
  ModelId,
} from "@/lib/settings";
import { RotateCcw, Trash2, Check, Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: AppSettings;
  onChange: (s: AppSettings) => void;
  onClearAll: () => void;
}

export const SettingsDialog = ({
  open,
  onOpenChange,
  settings,
  onChange,
  onClearAll,
}: SettingsDialogProps) => {
  const [confirmClear, setConfirmClear] = useState(false);
  const [uploadingModel, setUploadingModel] = useState(false);
  const [uploadedModel, setUploadedModel] = useState<string | null>(null);

  const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL as string | undefined) ?? "http://localhost:3001";

  const handlePickGguf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!/\.gguf$/i.test(file.name)) {
      toast.error("Please pick a .gguf model file.");
      return;
    }
    if (file.size > 8 * 1024 * 1024 * 1024) {
      toast.error("Model is larger than 8 GB — too big to upload through the browser.");
      return;
    }
    setUploadingModel(true);
    try {
      // Read file as base64
      const buf = await file.arrayBuffer();
      let binary = "";
      const bytes = new Uint8Array(buf);
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      const dataBase64 = btoa(binary);
      const resp = await fetch(`${BACKEND_URL}/api/upload-model`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, dataBase64 }),
      });
      const j = await resp.json().catch(() => ({}));
      if (!resp.ok || j.error) throw new Error(j.error ?? `HTTP ${resp.status}`);
      setUploadedModel(file.name);
      toast.success(`Loaded local model: ${file.name}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Couldn't upload model: ${msg}`);
    } finally {
      setUploadingModel(false);
    }
  };

  const setTheme = (theme: Theme) => onChange({ ...settings, theme });
  
  const postModelToBackend = async (model: ModelId) => {
    try {
      await fetch((import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001') + '/api/ai-mode', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'online', model })
      });
    } catch (e) {
      // ignore
    }
  };
  const setModel = (model: ModelId) => { onChange({ ...settings, model }); postModelToBackend(model); };
  const setPrompt = (systemPrompt: string) => onChange({ ...settings, systemPrompt });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto scrollbar-thin">
          <DialogHeader>
            <DialogTitle>Settings</DialogTitle>
            <DialogDescription>
              Personalize SARVIS. Changes save automatically.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-2">
            {/* Theme */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Theme</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {THEME_OPTIONS.map((opt) => {
                  const active = settings.theme === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setTheme(opt.value)}
                      className={cn(
                        "group relative flex flex-col gap-2 rounded-lg border p-2 text-left transition-all",
                        active
                          ? "border-primary ring-2 ring-primary/30"
                          : "border-border hover:border-foreground/30",
                      )}
                    >
                      <div
                        className="h-12 w-full overflow-hidden rounded-md border border-border"
                        style={{ background: opt.preview.bg }}
                      >
                        <div className="flex h-full items-center gap-1.5 px-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ background: opt.preview.accent }}
                          />
                          <span
                            className="h-1 flex-1 rounded-full opacity-50"
                            style={{ background: opt.preview.fg }}
                          />
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center gap-1 text-xs font-medium text-foreground">
                          {opt.label}
                          {active && <Check className="h-3 w-3 text-primary" />}
                        </div>
                        <div className="text-[10px] text-muted-foreground">{opt.hint}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Model */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">AI Model</Label>
              <Select value={settings.model} onValueChange={(v) => setModel(v as ModelId)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODEL_OPTIONS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      <div className="flex items-center gap-2">
                        <span>{m.label}</span>
                        <span className="text-xs text-muted-foreground">· {m.hint}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* System prompt */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Custom Instructions</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setPrompt(DEFAULT_SYSTEM_PROMPT)}
                  className="h-7 gap-1 text-xs"
                >
                  <RotateCcw className="h-3 w-3" />
                  Reset
                </Button>
              </div>
              <Textarea
                value={settings.systemPrompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={5}
                className="text-sm resize-none"
                placeholder="How should SARVIS behave?"
              />
              <p className="text-xs text-muted-foreground">
                Tell SARVIS your preferred tone, expertise level, or any rules to follow.
                Note: when "Study Ur Way" is on, the study tutor prompt is used instead.
              </p>
            </div>

            {/* Personalization & Briefing */}
            <div className="space-y-3 rounded-lg border border-border bg-secondary/30 p-3">
              <Label className="text-sm font-medium">Personalization & Briefing</Label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Your name</Label>
                  <input
                    type="text"
                    value={settings.userProfile?.name ?? ""}
                    onChange={(e) =>
                      onChange({
                        ...settings,
                        userProfile: { ...(settings.userProfile ?? { interests: [], grade: "", educationLevel: "", subjects: [], setupComplete: false }), name: e.target.value },
                      })
                    }
                    placeholder="e.g. Alex"
                    className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Country (ISO-2)</Label>
                  <input
                    type="text"
                    value={settings.userProfile?.country ?? ""}
                    onChange={(e) =>
                      onChange({
                        ...settings,
                        userProfile: { ...(settings.userProfile ?? { interests: [], grade: "", educationLevel: "", subjects: [], setupComplete: false }), country: e.target.value.toLowerCase().slice(0, 2) },
                      })
                    }
                    placeholder="ke, us, gb…"
                    className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                  />
                </div>
              </div>
              <label className="flex items-center justify-between text-sm">
                <span>Greet me with a briefing on startup</span>
                <input type="checkbox" checked={settings.startupBriefing}
                  onChange={(e) => onChange({ ...settings, startupBriefing: e.target.checked })} className="h-4 w-4" />
              </label>
              <label className="flex items-center justify-between text-sm">
                <span>Mark unread emails read after summarizing</span>
                <input type="checkbox" checked={settings.emailAutoMarkRead}
                  onChange={(e) => onChange({ ...settings, emailAutoMarkRead: e.target.checked })} className="h-4 w-4" />
              </label>
              <label className="flex items-center justify-between text-sm">
                <span>Use local Python model when offline</span>
                <input type="checkbox" checked={settings.useLocalModel}
                  onChange={(e) => onChange({ ...settings, useLocalModel: e.target.checked })} className="h-4 w-4" />
              </label>
              <label className="flex items-center justify-between text-sm">
                <span>Startup sound (speak the greeting aloud)</span>
                <input type="checkbox" checked={settings.startupSound}
                  onChange={(e) => onChange({ ...settings, startupSound: e.target.checked })} className="h-4 w-4" />
              </label>
              <label className="flex items-center justify-between text-sm">
                <span>Always start with a fresh chat</span>
                <input type="checkbox" checked={settings.alwaysNewChatOnLaunch}
                  onChange={(e) => onChange({ ...settings, alwaysNewChatOnLaunch: e.target.checked })} className="h-4 w-4" />
              </label>
              <label className="flex items-center justify-between text-sm">
                <span>🔓 Hacker mode (uncensored HF models + unrestricted terminal)</span>
                <input type="checkbox" checked={settings.hackerMode}
                  onChange={(e) => onChange({ ...settings, hackerMode: e.target.checked })} className="h-4 w-4" />
              </label>
              <label className="flex items-center justify-between text-sm">
                <span>Run SARVIS on system startup <span className="text-[10px] text-muted-foreground">(desktop app only)</span></span>
                <input
                  type="checkbox"
                  checked={!!settings.runOnStartup}
                  onChange={async (e) => {
                    const enabled = e.target.checked;
                    onChange({ ...settings, runOnStartup: enabled });
                    const desktop = (window as unknown as { sarvisDesktop?: { setAutostart: (b: boolean) => Promise<unknown> } }).sarvisDesktop;
                    if (desktop?.setAutostart) {
                      try { await desktop.setAutostart(enabled); toast.success(enabled ? "Run on startup enabled" : "Run on startup disabled"); }
                      catch { toast.error("Couldn't toggle autostart"); }
                    } else {
                      toast.info("Autostart only works in the SARVIS desktop app (Electron). See ELECTRON.md.");
                    }
                  }}
                  className="h-4 w-4"
                />
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="gguf-picker"
                  type="file"
                  accept=".gguf"
                  className="hidden"
                  onChange={handlePickGguf}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  disabled={uploadingModel}
                  onClick={() => document.getElementById("gguf-picker")?.click()}
                >
                  {uploadingModel ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  {uploadingModel ? "Uploading…" : "Pick GGUF model file"}
                </Button>
                {uploadedModel && (
                  <span className="truncate text-[11px] text-muted-foreground">
                    Loaded: <code>{uploadedModel}</code>
                  </span>
                )}
              </div>
            </div>

            {/* Danger zone */}
            <div className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <Label className="text-sm font-medium text-destructive">Danger zone</Label>
              <p className="text-xs text-muted-foreground">
                Permanently delete all of your conversations from this device.
              </p>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => setConfirmClear(true)}
                className="gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Clear all chats
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all chats?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete every conversation stored on this device.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onClearAll();
                setConfirmClear(false);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
