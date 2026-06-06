import { supabase } from "@/integrations/supabase/client";

export type Role = "user" | "assistant";

export interface NewsArticle {
  title: string;
  description: string | null;
  url: string;
  source: string;
  publishedAt: string;
  imageUrl: string | null;
}

export interface NearbyMapResult {
  category: string;
  center: { lat: number; lon: number };
  radius: number;
  places: Array<{
    id: string;
    name: string;
    category: string;
    address: string;
    lat: number;
    lon: number;
    distance: number;
    osmUrl: string;
  }>;
}

export interface Message {
  id: string;
  role: Role;
  content: string;
  imageUrl?: string;
  news?: { query: string | null; articles: NewsArticle[] };
  nearby?: NearbyMapResult;
  createdAt: number;
}

export interface Chat {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
}

const STORAGE_KEY = "sarvis_chats";

export function loadChats(): Chat[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveChats(chats: Chat[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
  } catch {
    // localStorage unavailable — silently continue
  }
}

export function newChat(): Chat {
  return {
    id: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title: "New Chat",
    messages: [],
    createdAt: Date.now(),
  };
}

export function newMessage(role: Role, content: string, imageUrl?: string): Message {
  return {
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    imageUrl,
    createdAt: Date.now(),
  };
}

export function deriveTitle(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length <= 30 ? t : t.slice(0, 30) + "…";
}

export function isImageRequest(text: string): boolean {
  return /\b(image|draw|picture|generate.+(image|picture)|paint|sketch)\b/i.test(text);
}

// Detects requests like "news about ai", "latest news on tesla", "headlines"
export function parseNewsRequest(text: string): { isNews: boolean; query: string | null } {
  const t = text.trim();
  // Headlines / top news (no topic)
  if (/^\s*(top\s+)?(news|headlines)\s*(today|now)?\s*\??\s*$/i.test(t)) {
    return { isNews: true, query: null };
  }
  const m = t.match(/(?:latest\s+|recent\s+|today'?s?\s+)?news\s+(?:about|on|regarding|for)\s+(.+)/i);
  if (m) return { isNews: true, query: m[1].replace(/[?.!]+$/, "").trim() };
  const m2 = t.match(/(?:latest|recent|today'?s?)\s+(?:headlines|news)\s+(?:about|on|for)\s+(.+)/i);
  if (m2) return { isNews: true, query: m2[1].replace(/[?.!]+$/, "").trim() };
  return { isNews: false, query: null };
}

export async function getNews(
  params: { query?: string | null; country?: string; category?: string; topic?: string; pageSize?: number } = {},
): Promise<{ articles?: NewsArticle[]; query?: string | null; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke("get-news", {
      body: params,
    });
    if (error) return { error: error.message };
    if (data?.error) return { error: data.error };
    return { articles: data?.articles ?? [], query: data?.query ?? null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "News API Error" };
  }
}


// ---------- Weather (Open-Meteo, no key) ----------
export interface WeatherForecast {
  place: string | null;
  lat: number;
  lon: number;
  timezone: string;
  current: {
    temp: number; feelsLike: number; humidity: number; wind: number;
    isDay: boolean; summary: string; code: number;
  };
  days: Array<{
    date: string; summary: string; tMax: number; tMin: number;
    pop: number; sunrise: string; sunset: string;
  }>;
}
export async function getWeather(
  params: { lat?: number; lon?: number; place?: string } = {},
): Promise<{ forecast?: WeatherForecast; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke("get-weather", { body: params });
    if (error) return { error: error.message };
    if (data?.error) return { error: data.error };
    return { forecast: data as WeatherForecast };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Weather API error" };
  }
}

const PROJECT_URL = import.meta.env.VITE_SUPABASE_URL as string;
const PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export async function streamChat({
  messages,
  model,
  systemPrompt,
  onDelta,
  onDone,
  onError,
  signal,
}: {
  messages: { role: Role; content: string }[];
  model?: string;
  systemPrompt?: string;
  onDelta: (chunk: string) => void;
  onDone: () => void;
  onError: (err: string) => void;
  signal?: AbortSignal;
}) {
  try {
    const resp = await fetch(`${PROJECT_URL}/functions/v1/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({
        messages,
        model,
        systemPrompt,
      }),
      signal,
    });

    if (!resp.ok || !resp.body) {
      let msg = `HTTP ${resp.status}`;
      try {
        const j = await resp.json();
        msg = j.error || msg;
      } catch {
        // ignore
      }
      if (resp.status === 429) msg = "Rate limit reached. Please wait a moment and try again.";
      if (resp.status === 402) msg = "AI credits exhausted. Add credits in Settings → Workspace → Usage.";
      onError(msg);
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let done = false;

    while (!done) {
      if (signal?.aborted) {
        reader.cancel();
        return;
      }

      const { done: rDone, value } = await reader.read();
      if (rDone) break;
      buffer += decoder.decode(value, { stream: true });

      let nl: number;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        let line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (!line || line.startsWith(":")) continue;
        if (!line.startsWith("data: ")) continue;
        const json = line.slice(6).trim();
        if (json === "[DONE]") {
          done = true;
          break;
        }
        try {
          const parsed = JSON.parse(json);
          const content = parsed.choices?.[0]?.delta?.content as string | undefined;
          if (content) onDelta(content);
        } catch {
          // partial JSON across chunks — push back and wait for more
          buffer = line + "\n" + buffer;
          break;
        }
      }
    }

    onDone();
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      onError("Message generation stopped");
    } else {
      onError(e instanceof Error ? e.message : "Unknown error");
    }
  }
}

export async function generateImage(prompt: string): Promise<{ imageUrl?: string; text?: string; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke("generate-image", {
      body: { prompt },
    });
    if (error) return { error: error.message };
    if (data?.error) return { error: data.error };
    return { imageUrl: data?.imageUrl, text: data?.text };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Image API Error" };
  }
}

// Non-streaming chat used by voice call (we want the full reply before TTS).
export async function sendChat({
  messages,
  model,
  systemPrompt,
}: {
  messages: { role: Role; content: string }[];
  model?: string;
  systemPrompt?: string;
}): Promise<{ reply?: string; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke("chat-once", {
      body: { messages, model, systemPrompt },
    });
    if (error) return { error: error.message };
    if (data?.error) return { error: data.error };
    return { reply: data?.reply ?? "" };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Unknown error" };
  }
}

// Local Python model bridge (used when offline / user opted in).
const BACKEND_URL_FOR_LOCAL = (import.meta.env.VITE_BACKEND_URL as string | undefined) ?? "http://localhost:3001";
export async function sendLocalChat({
  messages,
  systemPrompt,
}: {
  messages: { role: Role; content: string }[];
  systemPrompt?: string;
}): Promise<{ reply?: string; adapter?: string; error?: string }> {
  try {
    const resp = await fetch(`${BACKEND_URL_FOR_LOCAL}/api/local-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, system: systemPrompt }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) return { error: data?.error ?? `Local model HTTP ${resp.status}` };
    return { reply: data.reply, adapter: data.adapter };
  } catch (e) {
    return {
      error: `Cannot reach SARVIS bridge at ${BACKEND_URL_FOR_LOCAL}. Start it with: cd backend && npm run dev:backend`,
    };
  }
}

// Execute SARVIS system commands on the backend
export async function executeSarvisCommand(command: string, args: string = ""): Promise<{ output?: string; error?: string; os?: string }> {
  try {
    const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";
    const resp = await fetch(`${backendUrl}/api/sarvis`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ command, args }),
    });

    if (!resp.ok) {
      let errorMsg = `HTTP ${resp.status}`;
      try {
        const json = await resp.json();
        errorMsg = json.error || errorMsg;
      } catch {
        // ignore
      }
      return { error: errorMsg };
    }

    const data = await resp.json();
    if (data.error) {
      return { error: data.error };
    }

    return {
      output: data.output,
      os: data.os,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to execute command" };
  }
}

