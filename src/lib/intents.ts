// Lightweight, instant client-side intent detection that runs BEFORE the
// AI call. Anything matched here returns a structured action so SARVIS can
// actually DO the thing (open a tab, change theme, clear chats…) instead of
// just saying "okay, opening youtube" while nothing happens.

import type { Theme } from "@/lib/settings";

const SITE_MAP: Record<string, string> = {
  youtube: "https://www.youtube.com",
  yt: "https://www.youtube.com",
  gmail: "https://mail.google.com",
  mail: "https://mail.google.com",
  google: "https://www.google.com",
  drive: "https://drive.google.com",
  calendar: "https://calendar.google.com",
  maps: "https://maps.google.com",
  news: "https://news.google.com",
  twitter: "https://twitter.com",
  x: "https://x.com",
  facebook: "https://facebook.com",
  fb: "https://facebook.com",
  instagram: "https://instagram.com",
  ig: "https://instagram.com",
  reddit: "https://reddit.com",
  github: "https://github.com",
  stackoverflow: "https://stackoverflow.com",
  amazon: "https://amazon.com",
  netflix: "https://netflix.com",
  spotify: "https://open.spotify.com",
  linkedin: "https://linkedin.com",
  whatsapp: "https://web.whatsapp.com",
  discord: "https://discord.com/app",
  chatgpt: "https://chat.openai.com",
  claude: "https://claude.ai",
  perplexity: "https://perplexity.ai",
  wikipedia: "https://wikipedia.org",
  tiktok: "https://tiktok.com",
};

export type Intent =
  | { kind: "open_url"; url: string; label: string }
  | { kind: "search_web"; query: string }
  | { kind: "play_music"; query: string }
  | { kind: "set_theme"; theme: Theme }
  | { kind: "clear_chats" }
  | { kind: "open_dashboard" }
  // --- Self-modification ---
  | { kind: "ui_hide"; phrase: string }
  | { kind: "ui_show"; phrase: string }
  | { kind: "ui_reset" }
  // --- OS control (Electron desktop only) ---
  | { kind: "os_shell"; command: string }
  | { kind: "os_launch"; target: string }
  | { kind: "os_scaffold"; name: string; type: "html" | "node" | "python" }
  | { kind: "none" };

const THEME_WORDS: Record<string, Theme> = {
  light: "light", bright: "light", day: "light",
  dark: "dark", jarvis: "dark", hud: "dark", night: "dark",
  minimalist: "minimalist", minimal: "minimalist", mono: "minimalist",
  amoled: "amoled", neon: "amoled", black: "amoled",
  abstract: "abstract", artistic: "abstract", colorful: "abstract", colourful: "abstract",
};

export function detectIntent(raw: string): Intent {
  const t = raw.trim().toLowerCase();
  if (!t) return { kind: "none" };

  // ---- Theme switch ----
  const themeMatch = t.match(/\b(?:change|switch|set|make|use)\s+(?:the\s+)?theme\s+(?:to\s+)?([a-z]+)\b/);
  const themeAlt = t.match(/\b(?:enable|activate|turn on)\s+([a-z]+)\s+(?:theme|mode)\b/);
  const themeWord = (themeMatch?.[1] ?? themeAlt?.[1]) as string | undefined;
  if (themeWord && THEME_WORDS[themeWord]) {
    return { kind: "set_theme", theme: THEME_WORDS[themeWord] };
  }

  // ---- Self-modification (UI overrides) ----
  if (/\b(reset|restore|clear)\s+(the\s+)?(ui|interface|overrides|customizations)\b/.test(t)) {
    return { kind: "ui_reset" };
  }
  const hideMatch = t.match(/\b(?:hide|remove|delete|get rid of)\s+(?:the\s+)?(.+?)(?:\s+from\s+(?:the\s+)?(?:ui|interface|page|app))?\.?$/);
  if (hideMatch && !/\b(chat|conversation|message|history)\b/.test(hideMatch[1])) {
    return { kind: "ui_hide", phrase: hideMatch[1].trim() };
  }
  const showMatch = t.match(/\b(?:show|restore|bring back|unhide)\s+(?:the\s+)?(.+?)\.?$/);
  if (showMatch) return { kind: "ui_show", phrase: showMatch[1].trim() };

  // ---- OS: scaffold an app ----
  const scaffoldMatch = t.match(/\b(?:create|make|build|scaffold|generate)\s+(?:me\s+)?(?:an?\s+)?(html|node|python|web|cli)\s+app(?:\s+(?:called|named)\s+([\w-]+))?/);
  if (scaffoldMatch) {
    const rawType = scaffoldMatch[1];
    const type = rawType === "web" ? "html" : rawType === "cli" ? "node" : (rawType as "html" | "node" | "python");
    return { kind: "os_scaffold", name: scaffoldMatch[2] || `sarvis-${type}-${Date.now().toString(36)}`, type };
  }

  // ---- OS: launch app ("open calculator", "launch vscode") ----
  const launchMatch = t.match(/^(?:launch|start|run|open)\s+(?:the\s+)?(calculator|notepad|terminal|spotify|vscode|code|chrome|firefox|safari|finder|explorer|files|settings)\b/);
  if (launchMatch) {
    const apps: Record<string, string> = {
      calculator: process(/mac/i) ? "Calculator" : "calc.exe",
      notepad: "notepad.exe", terminal: process(/mac/i) ? "Terminal" : "wt.exe",
      spotify: "Spotify", vscode: "Visual Studio Code", code: "code",
      chrome: process(/mac/i) ? "Google Chrome" : "chrome.exe", firefox: "firefox",
      safari: "Safari", finder: "Finder", explorer: "explorer.exe",
      files: "Files", settings: process(/mac/i) ? "System Settings" : "ms-settings:",
    };
    return { kind: "os_launch", target: apps[launchMatch[1]] || launchMatch[1] };
  }

  // ---- OS: raw shell ("run: <cmd>" / "exec: <cmd>") ----
  const shellMatch = raw.trim().match(/^(?:run|exec|shell|cmd|terminal)[:\s]+(.+)$/i);
  if (shellMatch) return { kind: "os_shell", command: shellMatch[1].trim() };

  // ---- Clear all chats ----
  if (/\b(clear|delete|wipe|reset)\s+(all\s+)?(of\s+)?(our|my)?\s*(chats?|conversations?|history)\b/.test(t)) {
    return { kind: "clear_chats" };
  }

  // ---- Open dashboard ----
  if (/\bopen\s+(the\s+)?dashboard\b/.test(t)) return { kind: "open_dashboard" };

  // ---- Play music / song ----
  const playMatch = t.match(/\b(?:play|put on|queue)\s+(?:the\s+|some\s+)?(?:song|music|track|tune)?\s*(.+?)(?:\s+(?:on|in)\s+(?:youtube|spotify))?$/);
  if (/^play\s+/.test(t) && playMatch?.[1] && playMatch[1].length > 1) {
    return { kind: "play_music", query: playMatch[1].trim() };
  }

  // ---- Open <site or url> ----
  const openMatch = t.match(/^(?:open|launch|go to|navigate to|visit|browse)\s+(.+?)\.?$/);
  if (openMatch) {
    const target = openMatch[1].trim().replace(/^["']|["']$/g, "");
    // Direct URL
    if (/^https?:\/\//.test(target) || /^[\w-]+\.[\w.-]+/.test(target)) {
      const url = /^https?:\/\//.test(target) ? target : `https://${target}`;
      return { kind: "open_url", url, label: target };
    }
    // Known site name (first word)
    const firstWord = target.split(/\s+/)[0].replace(/[^a-z0-9]/g, "");
    if (SITE_MAP[firstWord]) {
      const rest = target.replace(firstWord, "").trim();
      if (firstWord === "youtube" && rest) {
        return {
          kind: "open_url",
          url: `https://www.youtube.com/results?search_query=${encodeURIComponent(rest)}`,
          label: `YouTube — ${rest}`,
        };
      }
      if (firstWord === "google" && rest) {
        return { kind: "search_web", query: rest };
      }
      return { kind: "open_url", url: SITE_MAP[firstWord], label: firstWord };
    }
    // Fallback: google search the phrase
    return { kind: "search_web", query: target };
  }

  // ---- Search the web for X ----
  const searchMatch = t.match(/^(?:search|google|look up)\s+(?:for\s+|the\s+web\s+for\s+)?(.+)$/);
  if (searchMatch) return { kind: "search_web", query: searchMatch[1].trim() };

  return { kind: "none" };
}

export function executeIntent(
  intent: Intent,
  helpers: { setTheme: (t: Theme) => void; clearChats: () => void; navigate: (path: string) => void },
): { handled: boolean; reply: string } {
  switch (intent.kind) {
    case "open_url": {
      window.open(intent.url, "_blank", "noopener,noreferrer");
      return { handled: true, reply: `Opening **${intent.label}** → ${intent.url}` };
    }
    case "search_web": {
      const url = `https://www.google.com/search?q=${encodeURIComponent(intent.query)}`;
      window.open(url, "_blank", "noopener,noreferrer");
      return { handled: true, reply: `Searching the web for **${intent.query}**.` };
    }
    case "play_music": {
      const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(intent.query)}`;
      window.open(url, "_blank", "noopener,noreferrer");
      return { handled: true, reply: `Playing **${intent.query}** on YouTube.` };
    }
    case "set_theme": {
      helpers.setTheme(intent.theme);
      return { handled: true, reply: `Theme switched to **${intent.theme}**.` };
    }
    case "clear_chats": {
      helpers.clearChats();
      return { handled: true, reply: "All chats cleared." };
    }
    case "open_dashboard": {
      helpers.navigate("/dashboard");
      return { handled: true, reply: "Opening dashboard." };
    }
    default:
      return { handled: false, reply: "" };
  }
}
