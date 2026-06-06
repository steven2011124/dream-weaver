import { supabase } from "@/integrations/supabase/client";

// ---------- Gmail ----------
export interface GmailMessage {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  date: string;
  unread: boolean;
}
export async function listGmail(max = 8, query?: string): Promise<{ messages?: GmailMessage[]; error?: string }> {
  const { data, error } = await supabase.functions.invoke("google-gmail", {
    body: { action: "list", max, query },
  });
  if (error) return { error: error.message };
  if (data?.error) return { error: data.error };
  return { messages: data?.messages ?? [] };
}

/** Marks Gmail message ids as read (removes the UNREAD label). Requires gmail.modify scope. */
export async function markGmailRead(ids: string[]): Promise<{ ok?: boolean; marked?: number; error?: string }> {
  if (ids.length === 0) return { ok: true, marked: 0 };
  const { data, error } = await supabase.functions.invoke("google-gmail", {
    body: { action: "markRead", ids },
  });
  if (error) return { error: error.message };
  if (data?.error) return { error: data.error };
  return { ok: true, marked: data?.marked ?? ids.length };
}

export interface GmailFullMessage extends GmailMessage {
  to?: string;
  body: string;
}
export async function getGmailMessage(id: string): Promise<{ message?: GmailFullMessage; error?: string }> {
  const { data, error } = await supabase.functions.invoke("google-gmail", {
    body: { action: "get", id },
  });
  if (error) return { error: error.message };
  if (data?.error) return { error: data.error };
  return { message: data as GmailFullMessage };
}

export async function sendGmail(input: {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
}): Promise<{ ok?: boolean; id?: string; error?: string }> {
  const { data, error } = await supabase.functions.invoke("google-gmail", {
    body: { action: "send", ...input },
  });
  if (error) return { error: error.message };
  if (data?.error) return { error: data.error };
  return { ok: true, id: data?.id };
}

// ---------- Calendar ----------
export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: string;
  end: string;
  htmlLink?: string;
}
export async function listCalendar(days = 14): Promise<{ events?: CalendarEvent[]; error?: string }> {
  const { data, error } = await supabase.functions.invoke("google-calendar", {
    body: { action: "list", days },
  });
  if (error) return { error: error.message };
  if (data?.error) return { error: data.error };
  return { events: data?.events ?? [] };
}
export async function createCalendarEvent(input: {
  summary: string;
  description?: string;
  startISO: string;
  endISO: string;
  reminderMinutes?: number;
}): Promise<{ event?: CalendarEvent; error?: string }> {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const { data, error } = await supabase.functions.invoke("google-calendar", {
    body: { action: "create", timeZone: tz, ...input },
  });
  if (error) return { error: error.message };
  if (data?.error) return { error: data.error };
  return { event: data?.event };
}

// ---------- Drive ----------
export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size?: string;
  webViewLink?: string;
  iconLink?: string;
}
export async function listDrive(query?: string): Promise<{ files?: DriveFile[]; error?: string }> {
  const { data, error } = await supabase.functions.invoke("google-drive", {
    body: { action: "list", query },
  });
  if (error) return { error: error.message };
  if (data?.error) return { error: data.error };
  return { files: data?.files ?? [] };
}
export async function uploadToDrive(file: File): Promise<{ file?: DriveFile; error?: string }> {
  const dataBase64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const r = reader.result as string;
      resolve(r.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
  const { data, error } = await supabase.functions.invoke("google-drive", {
    body: { action: "upload", name: file.name, mimeType: file.type || "application/octet-stream", dataBase64 },
  });
  if (error) return { error: error.message };
  if (data?.error) return { error: data.error };
  return { file: data?.file };
}
export async function downloadFromDrive(fileId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke("google-drive", {
    body: { action: "download", fileId },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  const bin = atob(data.dataBase64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: data.mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = data.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------- YouTube ----------
export interface YouTubeChannel {
  id: string;
  title: string;
  thumbnail?: string;
  subscriberCount: number;
  subscriberHidden: boolean;
  viewCount: number;
  videoCount: number;
}
export interface YouTubeVideo {
  videoId: string;
  title: string;
  description: string;
  channel: string;
  publishedAt: string;
  thumbnail: string;
}
export interface YouTubeRecentVideo {
  videoId: string;
  title: string;
  publishedAt: string;
  thumbnail: string;
  views: number;
  likes: number;
  comments: number;
}
export interface YouTubeAnalytics {
  channel: YouTubeChannel;
  recent: YouTubeRecentVideo[];
  top: YouTubeRecentVideo[];
  totalRecentViews: number;
  avgViews: number;
}
export async function getYouTubeChannel(): Promise<{ channel?: YouTubeChannel; error?: string }> {
  const { data, error } = await supabase.functions.invoke("google-youtube", { body: { action: "channel" } });
  if (error) return { error: error.message };
  if (data?.error) return { error: data.error };
  return { channel: data };
}
export async function getYouTubeAnalytics(): Promise<{ analytics?: YouTubeAnalytics; error?: string }> {
  const { data, error } = await supabase.functions.invoke("google-youtube", { body: { action: "analytics" } });
  if (error) return { error: error.message };
  if (data?.error) return { error: data.error };
  return { analytics: data };
}
export async function searchYouTube(query: string, max = 6): Promise<{ videos?: YouTubeVideo[]; error?: string }> {
  const { data, error } = await supabase.functions.invoke("google-youtube", {
    body: { action: "search", query, max },
  });
  if (error) return { error: error.message };
  if (data?.error) return { error: data.error };
  return { videos: data?.videos ?? [] };
}

export interface YouTubeTrendingVideo {
  videoId: string;
  title: string;
  description?: string;
  channel: string;
  publishedAt: string;
  thumbnail: string;
  views: number;
  likes: number;
}
export async function getYouTubeTrending(region = "KE", max = 8): Promise<{ videos?: YouTubeTrendingVideo[]; error?: string }> {
  const { data, error } = await supabase.functions.invoke("google-youtube", {
    body: { action: "trending", region, max },
  });
  if (error) return { error: error.message };
  if (data?.error) return { error: data.error };
  return { videos: data?.videos ?? [] };
}


// ---------- Maps nearby ----------
export interface NearbyPlace {
  id: string;
  name: string;
  category: string;
  address: string;
  lat: number;
  lon: number;
  distance: number;
  osmUrl: string;
}
export async function findNearby(input: {
  lat: number;
  lon: number;
  category: string;
  radius?: number;
}): Promise<{ center?: { lat: number; lon: number }; category?: string; radius?: number; places?: NearbyPlace[]; error?: string }> {
  const { data, error } = await supabase.functions.invoke("maps-nearby", { body: input });
  if (error) return { error: error.message };
  if (data?.error) return { error: data.error };
  return data;
}


// ---------- Intent parsing for chat ----------
export function parseNearbyIntent(text: string): { isNearby: boolean; category: string } {
  const m = text.match(/(?:find|show|where|search|locate)?\s*(?:me|some|the)?\s*([a-z\s]+?)\s+(?:near\s*me|nearby|around\s*me|close\s*to\s*me|near\s*by)\b/i);
  if (m) return { isNearby: true, category: m[1].trim() || "restaurant" };
  if (/\b(near\s*me|nearby|close\s*to\s*me)\b/i.test(text)) return { isNearby: true, category: "restaurant" };
  return { isNearby: false, category: "" };
}

export function parseDriveIntent(text: string): boolean {
  return /\b(google\s*drive|my\s*drive|drive\s*files|files\s*on\s*drive)\b/i.test(text);
}

export function parseCalendarIntent(text: string): boolean {
  return /\b(calendar|my\s*schedule|upcoming\s*events|events\s*today|agenda)\b/i.test(text);
}

export function parseGmailIntent(text: string): boolean {
  return /\b(gmail|my\s*emails?|inbox|new\s*mail|unread\s*emails?)\b/i.test(text);
}

// "Send an email to abc@x.com saying hello" / "email john@x.com about the report"
export interface SendEmailIntent {
  isSend: boolean;
  to?: string;
  subject?: string;
  body?: string;
}
export function parseSendEmailIntent(text: string): SendEmailIntent {
  const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (!emailMatch) return { isSend: false };
  if (!/\b(send|email|write|compose|mail)\b/i.test(text)) return { isSend: false };
  const to = emailMatch[0];

  // subject extraction: "about X" or "subject: X"
  let subject: string | undefined;
  const subjMatch = text.match(/(?:subject\s*[:\-]\s*|about\s+|regarding\s+|re\s*[:\-]\s*)([^\n.]+?)(?:\s+(?:saying|that says|with body|body|message)\b|[.\n]|$)/i);
  if (subjMatch) subject = subjMatch[1].trim().replace(/[."]+$/, "");

  // body extraction: after "saying", "message", "body:"
  let body: string | undefined;
  const bodyMatch = text.match(/(?:saying|that says|message\s*[:\-]?|body\s*[:\-]?|tell (?:him|her|them) that)\s+([\s\S]+)$/i);
  if (bodyMatch) body = bodyMatch[1].trim().replace(/^["']|["']$/g, "");

  if (!subject && body) subject = body.slice(0, 60);
  if (!body && subject) body = subject;
  if (!subject) subject = "Hello";
  if (!body) body = "Hi,\n\nSent from SARVIS.";

  return { isSend: true, to, subject, body };
}

// "youtube analytics", "channel stats", "how is my channel doing"
export function parseYouTubeAnalyticsIntent(text: string): boolean {
  return /\b(youtube\s+(analytics|stats|metrics|insights|performance)|channel\s+(analytics|stats|metrics|insights|performance|doing)|my\s+(youtube|channel))\b/i.test(text);
}

// "remind me to X at 5pm" / "set a reminder for tomorrow 9am to call Mom"
export interface ReminderIntent {
  isReminder: boolean;
  what?: string;
  whenISO?: string;
  reminderMinutes?: number;
}
export function parseReminderIntent(text: string): ReminderIntent {
  if (!/\b(remind\s+me|set\s+a?\s*reminder|schedule\s+(a\s+)?reminder)\b/i.test(text)) {
    return { isReminder: false };
  }
  // "remind me to X at TIME" or "remind me at TIME to X"
  const m1 = text.match(/remind\s+me\s+(?:to\s+)?(.+?)\s+(?:at|on|for|by|tomorrow|today|tonight|in)\s+(.+)$/i);
  const m2 = text.match(/remind\s+me\s+(?:at|on|for|by|tomorrow|today|tonight|in)\s+(.+?)\s+(?:to|that|about)\s+(.+)$/i);
  let what = "";
  let whenStr = "";
  if (m1) { what = m1[1].trim(); whenStr = m1[2].trim(); }
  else if (m2) { whenStr = m2[1].trim(); what = m2[2].trim(); }
  else {
    const m3 = text.match(/remind\s+me\s+(?:to\s+)?(.+)$/i);
    if (m3) what = m3[1].trim();
  }

  const whenISO = parseLooseDateTime(whenStr || text);
  return {
    isReminder: true,
    what: what.replace(/[.?!]+$/, "") || "Reminder",
    whenISO,
    reminderMinutes: 0,
  };
}

function parseLooseDateTime(s: string): string {
  const now = new Date();
  const lower = s.toLowerCase();

  let target = new Date(now.getTime() + 60 * 60 * 1000); // default: 1 hour from now

  if (/tomorrow/.test(lower)) {
    target = new Date(now);
    target.setDate(target.getDate() + 1);
    target.setHours(9, 0, 0, 0);
  } else if (/tonight/.test(lower)) {
    target = new Date(now);
    target.setHours(20, 0, 0, 0);
  } else if (/today/.test(lower)) {
    target = new Date(now);
    target.setHours(target.getHours() + 1, 0, 0, 0);
  }

  // "in 30 minutes" / "in 2 hours"
  const inM = lower.match(/in\s+(\d+)\s*(min|minute|minutes|hour|hours|hr|hrs|day|days)/);
  if (inM) {
    const n = parseInt(inM[1]);
    const unit = inM[2];
    target = new Date(now);
    if (/min/.test(unit)) target.setMinutes(target.getMinutes() + n);
    else if (/h/.test(unit)) target.setHours(target.getHours() + n);
    else if (/day/.test(unit)) target.setDate(target.getDate() + n);
  }

  // "at 5pm" / "at 14:30"
  const at = lower.match(/(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (at && (lower.includes("at ") || /\d+\s*(am|pm)/.test(lower))) {
    let h = parseInt(at[1]);
    const min = at[2] ? parseInt(at[2]) : 0;
    const mer = at[3];
    if (mer === "pm" && h < 12) h += 12;
    if (mer === "am" && h === 12) h = 0;
    if (h >= 0 && h < 24) {
      target.setHours(h, min, 0, 0);
      // If time has passed today and no "tomorrow" hint, push to tomorrow
      if (target.getTime() < now.getTime() && !/tomorrow/.test(lower)) {
        target.setDate(target.getDate() + 1);
      }
    }
  }

  return target.toISOString();
}
