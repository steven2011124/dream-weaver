/**
 * Bridge to the Electron desktop runtime. When SARVIS is running as the
 * packaged desktop app, `window.sarvisDesktop` exposes safe IPC helpers
 * for OS actions (shell, file I/O, launch apps, scaffold projects).
 *
 * Every destructive call goes through a native confirmation dialog in main.cjs
 * so the user always sees what's about to run.
 */

export interface DesktopBridge {
  isElectron: true;
  setAutostart: (enabled: boolean) => Promise<{ ok: boolean }>;
  getAutostart: () => Promise<boolean>;
  runShell: (command: string, opts?: { cwd?: string; confirm?: boolean }) =>
    Promise<{ ok: boolean; stdout?: string; stderr?: string; code?: number; error?: string; cancelled?: boolean }>;
  launchApp: (appOrPath: string) =>
    Promise<{ ok: boolean; error?: string; cancelled?: boolean }>;
  openPath: (target: string) =>
    Promise<{ ok: boolean; error?: string }>;
  fsRead: (path: string) => Promise<{ ok: boolean; content?: string; error?: string }>;
  fsWrite: (path: string, content: string, opts?: { confirm?: boolean }) =>
    Promise<{ ok: boolean; error?: string; cancelled?: boolean }>;
  fsList: (path: string) => Promise<{ ok: boolean; items?: { name: string; isDir: boolean }[]; error?: string }>;
  scaffoldApp: (spec: { name: string; type: "html" | "node" | "python"; files?: Record<string, string> }) =>
    Promise<{ ok: boolean; path?: string; error?: string; cancelled?: boolean }>;
  /** Write to the running SARVIS project's own source — true self-modification. */
  selfEdit: (relPath: string, content: string) =>
    Promise<{ ok: boolean; error?: string; cancelled?: boolean }>;
}

export function getDesktop(): DesktopBridge | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { sarvisDesktop?: DesktopBridge };
  return w.sarvisDesktop ?? null;
}

export const isDesktop = (): boolean => getDesktop() !== null;
