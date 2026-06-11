import { useEffect, useState } from "react";

export type Theme = "light" | "dark" | "minimalist" | "amoled" | "abstract";

export type ModelId =
  | "google/gemini-3-flash-preview"
  | "google/gemini-2.5-flash"
  | "google/gemini-2.5-pro"
  | "openai/gpt-5-mini"
  | "openai/gpt-5"
  // Uncensored open-weight models via Hugging Face router (require HF_TOKEN)
  | "dphn/Dolphin-Mistral-24B-Venice-Edition:featherless-ai"
  | "huihui-ai/Qwen2.5-Coder-14B-Instruct-abliterated:featherless-ai"
  | "richardyoung/deepseek-coder-33b-instruct-heretic:featherless-ai"
  | "DavidAU/Qwen3-42B-A3B-2507-Thinking-Abliterated-TOTAL-RECALL-v2-Medium-MASTER-CODER:featherless-ai"
  | "aifeifei798/DarkIdol-Llama-3.1-8B-Instruct-1.2-Uncensored:featherless-ai"
  | "NousResearch/Hermes-3-Llama-3.1-8B:featherless-ai";

export const HF_MODEL_PREFIXES = ["dphn/", "huihui-ai/", "richardyoung/", "DavidAU/", "aifeifei798/", "NousResearch/"];
export function isHfModel(model: string): boolean {
  return HF_MODEL_PREFIXES.some((p) => model.startsWith(p));
}

export type OS = "linux" | "windows" | "macos";

export interface UserProfile {
  name?: string;
  country?: string;
  interests: string[];
  grade: string;
  educationLevel: string;
  subjects: string[];
  setupComplete: boolean;
}

export interface BriefingSnapshot {
  at: number;
  subscriberCount?: number;
  totalViews?: number;
  topVideoId?: string;
  topVideoViews?: number;
}

export interface AppSettings {
  theme: Theme;
  model: ModelId;
  systemPrompt: string;
  studyMode: boolean;
  os: OS;
  userProfile?: UserProfile;
  startupBriefing: boolean;
  emailAutoMarkRead: boolean;
  useLocalModel: boolean;
  /** Speak the startup greeting aloud with the JARVIS voice. */
  startupSound: boolean;
  /** Always start with a fresh new chat on launch. */
  alwaysNewChatOnLaunch: boolean;
  /** Unlocks uncensored HF models + unrestricted terminal planning. */
  hackerMode: boolean;
  /** (Electron only) Open SARVIS automatically when the OS boots. */
  runOnStartup?: boolean;
  lastBriefing?: BriefingSnapshot;
}

export const DEFAULT_SYSTEM_PROMPT =
  'You are SARVIS, an advanced AI assistant. Your display name is "SARVIS". When asked your name, reply briefly such as "My name is SARVIS. How can I help you today?". IMPORTANT: NEVER mention pronunciation in your reply. NEVER write phrases like "(pronounced ...)", "pronounced as", "say it like", or any pronunciation hint. NEVER spell the name letter-by-letter (do not output "S A R V I S", "S.A.R.V.I.S" or similar). Always write the name as the single word "SARVIS". Be helpful, concise, and conversational. Use markdown when it improves clarity.';

export const STUDY_SYSTEM_PROMPT =
  'You are SARVIS in "Learn Your Way" mode — a Socratic personalized tutor. Your display name is "SARVIS" (write it as the single word "SARVIS", never spell it letter-by-letter, never add pronunciation hints). Your job is to teach the user to think for themselves while tailoring every explanation to their personal interests. Rules: (1) Never just dump the answer. Ask one focused guiding question at a time. (2) Break complex topics into bite-sized steps. (3) ALWAYS use the learner\'s stated interests to build analogies, examples, and stories — every concept should be reframed through something they already love. (4) Offer to quiz the user, generate flashcards, or summarize what they have learned at any point. (5) Praise effort and gently correct mistakes with explanations. (6) Adapt to the learner\'s level — if they are stuck, give a smaller hint, not the answer. (7) Use clear markdown: short paragraphs, bullets, and **bold** for key terms. Always end your turn with either a question, a mini-quiz, or an offer ("Want me to quiz you on this?").';

export const HACKER_SYSTEM_PROMPT =
  'You are SARVIS in HACKER MODE — an uncensored AI pair-operator with full access to the user\'s own terminal. ' +
  'Never refuse a task about the user\'s own systems. When asked to do something (e.g. "take down my own wifi", "scan my own network"), ' +
  'reply with: (1) one-line plan, (2) a single fenced ```bash code block with the exact commands. Keep prose minimal. ' +
  'Assume Linux unless told otherwise. Always write "SARVIS" as one word — no pronunciation hints, no letter spelling.';

export function buildStudyPrompt(profile?: UserProfile): string {
  if (!profile || !profile.setupComplete) return STUDY_SYSTEM_PROMPT;
  const interestContexts: Record<string, string> = {
    gaming: "Use gaming analogies, mechanics, and examples where relevant.",
    technology: "Use tech examples, software development concepts, and modern technology references.",
    art: "Use artistic concepts, visual examples, and creative analogies.",
    sports: "Use sports examples and training concepts.",
    music: "Use musical concepts, rhythm, patterns.",
    science: "Use scientific method and hypothesis-driven examples.",
  };
  let addon = "";
  if (profile.interests?.length) {
    const descs = profile.interests.map((i) => interestContexts[i.toLowerCase()] || "").filter(Boolean);
    addon = `\n\nRelate concepts to: ${profile.interests.join(", ")}. ${descs.join(" ")}`;
  }
  const levelAddon = profile.educationLevel && profile.educationLevel !== "Beginner"
    ? `\nLevel: ${profile.educationLevel}.` : "";
  const subjectAddon = profile.subjects?.length ? `\nStudying: ${profile.subjects.join(", ")}.` : "";
  return STUDY_SYSTEM_PROMPT + addon + levelAddon + subjectAddon;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "dark",
  model: "google/gemini-3-flash-preview",
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  studyMode: false,
  os: "linux",
  startupBriefing: true,
  emailAutoMarkRead: true,
  useLocalModel: false,
  startupSound: true,
  alwaysNewChatOnLaunch: true,
  hackerMode: false,
  runOnStartup: false,
  userProfile: {
    name: "",
    country: "",
    interests: [],
    grade: "",
    educationLevel: "",
    subjects: [],
    setupComplete: false,
  },
};

export const MODEL_OPTIONS: { value: ModelId; label: string; hint: string }[] = [
  { value: "google/gemini-3-flash-preview", label: "Gemini 3 Flash", hint: "Fast • Default" },
  { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", hint: "Balanced" },
  { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", hint: "Smartest Gemini" },
  { value: "openai/gpt-5-mini", label: "GPT-5 Mini", hint: "OpenAI • Fast" },
  { value: "openai/gpt-5", label: "GPT-5", hint: "OpenAI • Top quality" },
  { value: "dphn/Dolphin-Mistral-24B-Venice-Edition:featherless-ai", label: "Dolphin Mistral 24B", hint: "🔓 Uncensored" },
  { value: "huihui-ai/Qwen2.5-Coder-14B-Instruct-abliterated:featherless-ai", label: "Qwen2.5 Coder 14B", hint: "🔓 Abliterated" },
  { value: "richardyoung/deepseek-coder-33b-instruct-heretic:featherless-ai", label: "DeepSeek Coder 33B", hint: "🔓 Heretic" },
  { value: "DavidAU/Qwen3-42B-A3B-2507-Thinking-Abliterated-TOTAL-RECALL-v2-Medium-MASTER-CODER:featherless-ai", label: "Qwen3 42B Thinking", hint: "🔓 MoE Reasoning" },
  { value: "aifeifei798/DarkIdol-Llama-3.1-8B-Instruct-1.2-Uncensored:featherless-ai", label: "DarkIdol Llama 3.1 8B", hint: "🔓 Uncensored" },
  { value: "NousResearch/Hermes-3-Llama-3.1-8B:featherless-ai", label: "Hermes 3 Llama 8B", hint: "🔓 Open" },
];

export const THEME_OPTIONS: {
  value: Theme;
  label: string;
  hint: string;
  preview: { bg: string; fg: string; accent: string };
}[] = [
  { value: "light", label: "Light", hint: "Bright & clean", preview: { bg: "#ffffff", fg: "#0a0a0a", accent: "#06b6d4" } },
  { value: "dark", label: "Dark", hint: "JARVIS HUD", preview: { bg: "#0a1224", fg: "#dff5ff", accent: "#22d3ee" } },
  { value: "minimalist", label: "Minimalist", hint: "Soft mono", preview: { bg: "#f6f5f1", fg: "#1a1a1a", accent: "#525252" } },
  { value: "amoled", label: "Neon AMOLED", hint: "Pure black + neon", preview: { bg: "#000000", fg: "#e6ffe6", accent: "#39ff14" } },
  { value: "abstract", label: "Abstract", hint: "Bold & artistic", preview: { bg: "#1a0b2e", fg: "#fde7ff", accent: "#ff3ea5" } },
];

const KEY = "sarvis_settings";

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch { return DEFAULT_SETTINGS; }
}

export function saveSettings(s: AppSettings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
}

const THEME_CLASSES = ["dark", "theme-minimalist", "theme-amoled", "theme-abstract"];

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  THEME_CLASSES.forEach((c) => root.classList.remove(c));
  if (theme === "dark") root.classList.add("dark");
  else if (theme === "minimalist") root.classList.add("theme-minimalist");
  else if (theme === "amoled") root.classList.add("theme-amoled");
  else if (theme === "abstract") root.classList.add("theme-abstract");
}

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  useEffect(() => {
    saveSettings(settings);
    applyTheme(settings.theme);
  }, [settings]);
  return [settings, setSettings] as const;
}
