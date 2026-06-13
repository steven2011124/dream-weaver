/**
 * Runtime UI self-modification. The AI can hide elements, recolor things,
 * or inject custom CSS without rebuilding the app. Persisted in localStorage
 * so changes survive reloads.
 *
 * This is the browser-safe half of "let SARVIS modify its own code".
 * The Electron half (real file writes) lives in electron/main.cjs.
 */

const STORAGE_KEY = "sarvis.uiOverrides.v1";
const STYLE_ID = "sarvis-ui-overrides";

export interface UiOverrides {
  /** CSS selectors to hide (display:none !important). */
  hiddenSelectors: string[];
  /** Free-form CSS appended to the page (AI-generated rules). */
  customCss: string;
}

const DEFAULT: UiOverrides = { hiddenSelectors: [], customCss: "" };

export function loadOverrides(): UiOverrides {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT };
    const parsed = JSON.parse(raw);
    return {
      hiddenSelectors: Array.isArray(parsed.hiddenSelectors) ? parsed.hiddenSelectors : [],
      customCss: typeof parsed.customCss === "string" ? parsed.customCss : "",
    };
  } catch {
    return { ...DEFAULT };
  }
}

export function saveOverrides(o: UiOverrides) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(o));
  applyOverrides(o);
}

export function applyOverrides(o: UiOverrides = loadOverrides()) {
  if (typeof document === "undefined") return;
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  const hideRules = o.hiddenSelectors
    .filter(Boolean)
    .map((sel) => `${sel} { display: none !important; }`)
    .join("\n");
  style.textContent = `${hideRules}\n${o.customCss}`;
}

export function hideElement(selector: string) {
  const o = loadOverrides();
  if (!o.hiddenSelectors.includes(selector)) {
    o.hiddenSelectors.push(selector);
    saveOverrides(o);
  }
}

export function showElement(selector: string) {
  const o = loadOverrides();
  o.hiddenSelectors = o.hiddenSelectors.filter((s) => s !== selector);
  saveOverrides(o);
}

export function appendCss(css: string) {
  const o = loadOverrides();
  o.customCss = `${o.customCss}\n${css}`.trim();
  saveOverrides(o);
}

export function resetOverrides() {
  saveOverrides({ ...DEFAULT });
}

/**
 * Resolve a natural-language target ("the settings button", "the sidebar")
 * to a CSS selector. Best-effort — uses common test/aria/text hints.
 */
export function resolveSelector(phrase: string): string | null {
  if (typeof document === "undefined") return null;
  const p = phrase.toLowerCase().trim();

  // 1. Try data-testid
  const byTid = document.querySelector(`[data-testid*="${p}"]`);
  if (byTid) return `[data-testid*="${cssEscape(p)}"]`;

  // 2. Common UI keywords -> selectors
  const map: Record<string, string> = {
    sidebar: '[data-sidebar], aside',
    "side bar": '[data-sidebar], aside',
    settings: '[aria-label*="settings" i], [data-testid*="settings"]',
    "settings button": '[aria-label*="settings" i]',
    header: "header",
    footer: "footer",
    "new chat": '[aria-label*="new chat" i]',
    "send button": 'button[type="submit"]',
    composer: '[data-testid="composer"], form textarea',
    avatar: '[data-testid*="avatar"], [aria-label*="avatar" i]',
    logo: '[aria-label*="logo" i], .logo',
  };
  if (map[p]) return map[p];

  // 3. Match buttons / links by visible text
  const all = Array.from(document.querySelectorAll("button, a, [role=button]")) as HTMLElement[];
  const hit = all.find((el) => (el.innerText || el.textContent || "").trim().toLowerCase() === p);
  if (hit) {
    if (hit.id) return `#${cssEscape(hit.id)}`;
    if (hit.getAttribute("aria-label")) return `[aria-label="${cssEscape(hit.getAttribute("aria-label")!)}"]`;
  }
  return null;
}

function cssEscape(s: string): string {
  return s.replace(/(["\\])/g, "\\$1");
}
