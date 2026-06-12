import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { detectIntent, executeIntent } from "@/lib/intents";
import { speakWithMaleVoice } from "@/lib/voice";
import { Phone, Sparkles, Image as ImageIcon, ArrowUp, Menu, Paperclip, X, Plus, FileText, Presentation, Film, GraduationCap, Check, Terminal, Square, LayoutDashboard } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChatSidebar } from "@/components/ChatSidebar";
import { MessageBubble } from "@/components/MessageBubble";
import { CallOverlay } from "@/components/CallOverlay";
import { SettingsDialog } from "@/components/SettingsDialog";
import { StudyProfileDialog } from "@/components/StudyProfileDialog";
import LearnDialog from "@/components/LearnDialog";
import { CodeCanvas, type CanvasContent } from "@/components/CodeCanvas";
import { toast } from "sonner";
import {
  Chat,
  Message,
  deriveTitle,
  generateImage,
  isImageRequest,
  loadChats,
  newChat,
  newMessage,
  saveChats,
  streamChat,
  executeSarvisCommand,
  parseNewsRequest,
  getNews,
  getWeather,
} from "@/lib/sarvis";
import {
  parseNearbyIntent,
  parseCalendarIntent,
  parseGmailIntent,
  parseDriveIntent,
  parseSendEmailIntent,
  parseYouTubeAnalyticsIntent,
  parseReminderIntent,
  findNearby,
  listCalendar,
  listGmail,
  listDrive,
  sendGmail,
  getYouTubeAnalytics,
  createCalendarEvent,
} from "@/lib/google";
import { generateDocument, generateSlides, generateVideo } from "@/lib/generators";
import { useSettings, applyTheme, STUDY_SYSTEM_PROMPT, buildStudyPrompt, type OS, type UserProfile } from "@/lib/settings";
import { isSlashCommand, buildCommand, parseSlash, COMMAND_HELP } from "@/lib/systemCommands";
import { SlideStyleDialog, rememberSlideStyle, type SlideStyleId } from "@/components/SlideStyleDialog";
import {
  parseComputerIntent,
  parseSelfEditIntent,
  planCommand,
  planSelfEdit,
  execCommand,
  readProjectFile,
  writeProjectFile,
  type PlannedCommand,
} from "@/lib/computer";
import { ConfirmCommandDialog } from "@/components/ConfirmCommandDialog";
import { SelfEditDialog } from "@/components/SelfEditDialog";
import sarvisLogo from "@/assets/sarvis-logo.png";

interface AttachedFile {
  name: string;
  size: number;
  text: string;
}

const MAX_TEXT_FILE_SIZE = 200 * 1024; // 200KB

const Index = () => {
  const [settings, setSettings] = useSettings();
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [callOpen, setCallOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [attachments, setAttachments] = useState<AttachedFile[]>([]);
  const [canvasOpen, setCanvasOpen] = useState(false);
  const [canvasContent, setCanvasContent] = useState<CanvasContent | null>(null);
  const [studyProfileOpen, setStudyProfileOpen] = useState(false);
  const [learnOpen, setLearnOpen] = useState(false);
  const [slideStyleOpen, setSlideStyleOpen] = useState(false);
  const [pendingSlideTopic, setPendingSlideTopic] = useState<string>("");

  // SARVIS computer-control + self-edit dialogs
  const [cmdDialogOpen, setCmdDialogOpen] = useState(false);
  const [cmdPlan, setCmdPlan] = useState<{
    explanation: string;
    commands: PlannedCommand[];
    os: string;
    chatId: string;
    placeholderId: string;
    originalRequest: string;
  } | null>(null);

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editPlan, setEditPlan] = useState<{
    path: string;
    oldContent: string;
    newContent: string;
    explanation: string;
    chatId: string;
    placeholderId: string;
  } | null>(null);

  const isMobile = useIsMobile();

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const initialized = useRef(false);
  const navigate = useNavigate();
  const profileShownRef = useRef(false);
  const streamAbortControllerRef = useRef<AbortController | null>(null);

  // SEO + theme on mount
  useEffect(() => {
    document.title = "SARVIS AI — Intelligent Chat Assistant";
    const desc =
      "SARVIS AI: a clean ChatGPT-style chat interface with voice calls, image generation, code canvas, and conversation history.";
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "description");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", desc);
    applyTheme(settings.theme);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const loaded = loadChats();
    // Always start with a fresh chat at the top if the user wants it.
    if (settings.alwaysNewChatOnLaunch) {
      const c = newChat();
      setChats([c, ...loaded]);
      setActiveId(c.id);
    } else if (loaded.length > 0) {
      setChats(loaded);
      setActiveId(loaded[0].id);
    } else {
      const c = newChat();
      setChats([c]);
      setActiveId(c.id);
    }

    if (settings.startupBriefing) {
      (async () => {
        try {
          const { buildStartupBriefing } = await import("@/lib/briefing");
          const result = await buildStartupBriefing(settings);
          setChats((prev) => {
            if (prev.length === 0) return prev;
            const target = prev[0];
            const msg = newMessage("assistant", result.text);
            return prev.map((c) => (c.id === target.id ? { ...c, messages: [...c.messages, msg] } : c));
          });
          setSettings((s) => ({ ...s, lastBriefing: result.newSnapshot }));
          // Speak the briefing aloud when the user turned on startup sound.
          if (settings.startupSound) {
            // Strip markdown for cleaner TTS
            const spoken = result.text.replace(/[#*_`>[\]()]/g, "").replace(/https?:\/\/\S+/g, "");
            speakWithMaleVoice(spoken.slice(0, 1200));
          }
        } catch (e) {
          console.warn("[sarvis] briefing failed", e);
        }
      })();
    }
  }, []);


  // Monitor study mode and show profile dialog if needed
  useEffect(() => {
    if (
      settings.studyMode &&
      (!settings.userProfile || !settings.userProfile.setupComplete) &&
      !profileShownRef.current
    ) {
      profileShownRef.current = true;
      setStudyProfileOpen(true);
    } else if (!settings.studyMode) {
      profileShownRef.current = false;
    }
  }, [settings.studyMode, settings.userProfile]);

  useEffect(() => {
    if (chats.length > 0) saveChats(chats);
  }, [chats]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [chats, streamingId]);

  const activeChat = useMemo(
    () => chats.find((c) => c.id === activeId) ?? null,
    [chats, activeId],
  );

  const sortedChats = useMemo(
    () => [...chats].sort((a, b) => b.createdAt - a.createdAt),
    [chats],
  );

  const handleNew = () => {
    const c = newChat();
    setChats((prev) => [c, ...prev]);
    setActiveId(c.id);
  };

  const handleSelect = (id: string) => {
    if (chats.some((c) => c.id === id)) setActiveId(id);
  };

  const handleRename = (id: string, title: string) => {
    setChats((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)));
  };

  const handleDelete = (id: string) => {
    setChats((prev) => {
      const next = prev.filter((c) => c.id !== id);
      if (activeId === id) {
        if (next.length > 0) setActiveId(next[0].id);
        else {
          const c = newChat();
          setActiveId(c.id);
          return [c];
        }
      }
      return next;
    });
  };

  const handleClearAll = () => {
    const c = newChat();
    setChats([c]);
    setActiveId(c.id);
    toast.success("All chats cleared");
  };

  const handleSaveProfile = (profile: UserProfile) => {
    setSettings({ ...settings, userProfile: profile });
    setStudyProfileOpen(false);
    toast.success("Profile saved! Ready to study with personalized learning.");
  };

  const updateChat = (id: string, mutator: (c: Chat) => Chat) => {
    setChats((prev) => prev.map((c) => (c.id === id ? mutator(c) : c)));
  };

  const appendMessage = (chatId: string, msg: Message) => {
    updateChat(chatId, (c) => {
      const isFirstUser = c.messages.length === 0 && msg.role === "user";
      return {
        ...c,
        title: isFirstUser ? deriveTitle(msg.content) : c.title,
        messages: [...c.messages, msg],
      };
    });
  };

  const updateMessageContent = (
    chatId: string,
    msgId: string,
    updater: (prev: string) => string,
    extra?: Partial<Message>,
  ) => {
    updateChat(chatId, (c) => ({
      ...c,
      messages: c.messages.map((m) =>
        m.id === msgId ? { ...m, content: updater(m.content), ...(extra ?? {}) } : m,
      ),
    }));
  };

  const handleAttachClick = () => fileInputRef.current?.click();

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    const newAttachments: AttachedFile[] = [];
    for (const file of files) {
      if (file.size > MAX_TEXT_FILE_SIZE) {
        toast.error(`${file.name} is too large (max 200KB for text files)`);
        continue;
      }
      const isLikelyText =
        file.type.startsWith("text/") ||
        /\.(txt|md|json|csv|xml|yaml|yml|js|jsx|ts|tsx|py|go|rs|java|c|cpp|h|css|html|sh|sql|env|toml|ini|log)$/i.test(
          file.name,
        );
      if (!isLikelyText) {
        toast.error(`${file.name}: only text files are supported for now`);
        continue;
      }
      try {
        const text = await file.text();
        newAttachments.push({ name: file.name, size: file.size, text });
      } catch {
        toast.error(`Failed to read ${file.name}`);
      }
    }
    if (newAttachments.length > 0) {
      setAttachments((prev) => [...prev, ...newAttachments]);
      toast.success(
        newAttachments.length === 1
          ? `Attached ${newAttachments[0].name}`
          : `Attached ${newAttachments.length} files`,
      );
    }
    // Reset so selecting the same file again works
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeAttachment = (idx: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  const buildOutgoingText = (rawText: string): string => {
    if (attachments.length === 0) return rawText;
    const parts = attachments.map(
      (a) => `--- File: ${a.name} (${a.size} bytes) ---\n${a.text}`,
    );
    return `${rawText}\n\n[Attached files]\n${parts.join("\n\n")}`;
  };

  const handleOpenCanvas = (content: CanvasContent) => {
    setCanvasContent(content);
    setCanvasOpen(true);
  };

  const handleStop = () => {
    if (streamAbortControllerRef.current) {
      streamAbortControllerRef.current.abort();
      streamAbortControllerRef.current = null;
    }
    setBusy(false);
    setStreamingId(null);
  };

  const handleSend = async () => {
    const text = input.trim();
    if ((!text && attachments.length === 0) || busy || !activeChat) return;

    const chatId = activeChat.id;

    // ---- Fast-path intents: open <site>, search, theme switch, clear chats, play music ----
    if (text && !text.startsWith("/")) {
      const intent = detectIntent(text);
      const result = executeIntent(intent, {
        setTheme: (theme) => setSettings({ ...settings, theme }),
        clearChats: () => handleClearAll(),
        navigate: (path) => navigate(path),
      });
      if (result.handled) {
        appendMessage(chatId, newMessage("user", text));
        appendMessage(chatId, newMessage("assistant", result.reply));
        setInput("");
        return;
      }
    }

    // ---- SARVIS slash commands (execute on backend) ----

    if (text && isSlashCommand(text)) {
      const result = buildCommand(settings.os, text);
      const { cmd, arg } = parseSlash(text);
      
      appendMessage(chatId, newMessage("user", text));
      
      // Execute the command on the backend
      setBusy(true);
      const execResult = await executeSarvisCommand(cmd, arg);
      setBusy(false);
      
      if (execResult.error) {
        const errorDisplay = `**${result.title}** _(for ${settings.os})_\n\n❌ Error: ${execResult.error}\n\nThe script has been opened in the canvas as fallback. Tap **Copy**, paste it into your terminal, and run it manually.`;
        appendMessage(chatId, newMessage("assistant", errorDisplay));
        handleOpenCanvas({
          kind: "code",
          title: result.title,
          language: result.language,
          code: result.code,
          speakText: result.speak,
        });
      } else {
        const output = execResult.output || "Command executed successfully";
        const display = `**${result.title}** _(${execResult.os || settings.os})_\n\n\`\`\`\n${output.slice(0, 1000)}${output.length > 1000 ? "\n... (output truncated)" : ""}\n\`\`\``;
        appendMessage(chatId, newMessage("assistant", display));
      }
      
      setInput("");
      return;
    }

    // ---- SARVIS computer-control intent (natural language → shell plan) ----
    if (text) {
      const compIntent = parseComputerIntent(text);
      if (compIntent.isComputer) {
        appendMessage(chatId, newMessage("user", text));
        const placeholder = newMessage(
          "assistant",
          `🖥️  Planning shell commands for your **${settings.os}**…`,
        );
        appendMessage(chatId, placeholder);
        setStreamingId(placeholder.id);
        setBusy(true);

        const { plan, error } = await planCommand(compIntent.request, settings.os);
        setStreamingId(null);
        setBusy(false);

        if (error || !plan) {
          updateMessageContent(chatId, placeholder.id, () => `Couldn't plan that command: ${error ?? "no plan returned"}`);
          toast.error(error ?? "Plan failed");
          setInput("");
          return;
        }
        if (plan.refused || plan.commands.length === 0) {
          updateMessageContent(chatId, placeholder.id, () => `I won't run that. ${plan.explanation}`);
          setInput("");
          return;
        }
        updateMessageContent(
          chatId,
          placeholder.id,
          () => `**Plan ready** — ${plan.explanation}\n\nReview & approve in the dialog to run on your ${settings.os}.`,
        );
        setCmdPlan({
          explanation: plan.explanation,
          commands: plan.commands,
          os: settings.os,
          chatId,
          placeholderId: placeholder.id,
          originalRequest: compIntent.request,
        });
        setCmdDialogOpen(true);
        setInput("");
        return;
      }

      const editIntent = parseSelfEditIntent(text);
      if (editIntent.isSelfEdit) {
        appendMessage(chatId, newMessage("user", text));
        const placeholder = newMessage("assistant", "✏️  Planning a code edit…");
        appendMessage(chatId, placeholder);
        setStreamingId(placeholder.id);
        setBusy(true);

        const { plan, error } = await planSelfEdit(editIntent.request);
        setStreamingId(null);
        setBusy(false);

        if (error || !plan) {
          updateMessageContent(chatId, placeholder.id, () => `Couldn't plan the edit: ${error ?? "no plan returned"}`);
          toast.error(error ?? "Self-edit plan failed");
          setInput("");
          return;
        }
        if (plan.refused) {
          updateMessageContent(chatId, placeholder.id, () => `I won't make that change. ${plan.refuseReason ?? plan.explanation}`);
          setInput("");
          return;
        }

        const { content: oldContent, error: readErr } = await readProjectFile(plan.path);
        if (readErr) {
          updateMessageContent(
            chatId,
            placeholder.id,
            () => `Couldn't read **${plan.path}** from disk: ${readErr}\n\nMake sure the SARVIS bridge is running on \`localhost:3001\`.`,
          );
          toast.error("File read failed");
          setInput("");
          return;
        }

        updateMessageContent(
          chatId,
          placeholder.id,
          () => `**Edit ready** — ${plan.explanation}\n\nReview the diff for \`${plan.path}\` and approve to apply.`,
        );
        setEditPlan({
          path: plan.path,
          oldContent: oldContent ?? "",
          newContent: plan.newContent,
          explanation: plan.explanation,
          chatId,
          placeholderId: placeholder.id,
        });
        setEditDialogOpen(true);
        setInput("");
        return;
      }
    }

    const visibleText =
      text || (attachments.length > 0 ? `(Sent ${attachments.length} file(s))` : "");
    const outgoing = buildOutgoingText(text);

    const userMsg = newMessage("user", visibleText);
    appendMessage(chatId, userMsg);
    setInput("");
    setAttachments([]);
    setBusy(true);

    const historyForApi = [
      ...activeChat.messages.map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: outgoing },
    ];

    // ---- Weather (Open-Meteo) ----
    const weatherMatch = text.match(/\b(weather|forecast|rain|temperature|how (?:hot|cold))\b(?:\s+(?:in|at|for)\s+([a-z][a-z\s,'-]{1,60}))?/i);
    if (weatherMatch) {
      const place =
        (weatherMatch[2] || "").trim() ||
        settings.userProfile?.country ||
        "";
      const placeholder = newMessage("assistant", "");
      appendMessage(chatId, placeholder);
      setStreamingId(placeholder.id);
      const r = await getWeather(place ? { place } : {});
      setStreamingId(null);
      if (r.error || !r.forecast) {
        updateMessageContent(chatId, placeholder.id, () => `Weather error: ${r.error ?? "no data"}`);
      } else {
        const f = r.forecast;
        const dayLines = f.days.slice(0, 4)
          .map((d) => {
            const dt = new Date(d.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
            return `- **${dt}** — ${d.summary} · ${Math.round(d.tMin)}°–${Math.round(d.tMax)}°C · rain ${d.pop}%`;
          })
          .join("\n");
        updateMessageContent(
          chatId,
          placeholder.id,
          () =>
            `## ☀️ Weather${f.place ? ` — ${f.place}` : ""}\n\n` +
            `**Now:** ${Math.round(f.current.temp)}°C · ${f.current.summary} · feels ${Math.round(f.current.feelsLike)}°C · 💧${f.current.humidity}% · 🌬 ${Math.round(f.current.wind)} km/h\n\n` +
            `**Next 4 days:**\n${dayLines}\n\n_Open the [Dashboard](/dashboard) for the full widget._`,
        );
      }
      setBusy(false);
      return;
    }

    const newsIntent = parseNewsRequest(text);
    if (newsIntent.isNews) {
      const placeholder = newMessage("assistant", "");
      appendMessage(chatId, placeholder);
      setStreamingId(placeholder.id);

      const result = await getNews({ query: newsIntent.query });
      setStreamingId(null);

      if (result.error) {
        updateMessageContent(chatId, placeholder.id, () => `News error: ${result.error}`);
        toast.error(result.error);
      } else {
        const headerText = newsIntent.query
          ? `Here are the latest stories on **${newsIntent.query}**:`
          : "Here are today's top headlines:";
        updateMessageContent(chatId, placeholder.id, () => headerText, {
          news: { query: newsIntent.query, articles: result.articles ?? [] },
        });
      }
      setBusy(false);
      return;
    }

    // ---- Nearby places (Maps) ----
    const nearbyIntent = parseNearbyIntent(text);
    if (nearbyIntent.isNearby) {
      const placeholder = newMessage("assistant", "");
      appendMessage(chatId, placeholder);
      setStreamingId(placeholder.id);

      try {
        const coords = await new Promise<{ lat: number; lon: number }>((resolve, reject) => {
          if (!navigator.geolocation) return reject(new Error("Geolocation unsupported"));
          navigator.geolocation.getCurrentPosition(
            (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
            (e) => reject(new Error(e.message)),
            { enableHighAccuracy: true, timeout: 10000 },
          );
        });
        const r = await findNearby({ lat: coords.lat, lon: coords.lon, category: nearbyIntent.category, radius: 1500 });
        setStreamingId(null);
        if (r.error || !r.places) {
          updateMessageContent(chatId, placeholder.id, () => `Couldn't search nearby: ${r.error ?? "no results"}`);
        } else {
          updateMessageContent(
            chatId,
            placeholder.id,
            () => `Found ${r.places.length} ${nearbyIntent.category} near you:`,
            { nearby: { category: nearbyIntent.category, center: r.center!, radius: r.radius ?? 1500, places: r.places } },
          );
        }
      } catch (err) {
        setStreamingId(null);
        const msg = err instanceof Error ? err.message : "Location unavailable";
        updateMessageContent(chatId, placeholder.id, () => `Location error: ${msg}. Please allow browser location access.`);
        toast.error(msg);
      }
      setBusy(false);
      return;
    }

    // ---- Calendar ----
    if (parseCalendarIntent(text)) {
      const placeholder = newMessage("assistant", "");
      appendMessage(chatId, placeholder);
      setStreamingId(placeholder.id);
      const r = await listCalendar(14);
      setStreamingId(null);
      if (r.error) {
        updateMessageContent(chatId, placeholder.id, () => `Calendar error: ${r.error}`);
      } else if (!r.events || r.events.length === 0) {
        updateMessageContent(chatId, placeholder.id, () => "You have no upcoming events in the next 14 days. Open the [Dashboard](/dashboard) to add a reminder.");
      } else {
        const lines = r.events
          .slice(0, 8)
          .map((e) => `- **${e.summary}** — ${new Date(e.start).toLocaleString()}${e.location ? ` · ${e.location}` : ""}`)
          .join("\n");
        updateMessageContent(
          chatId,
          placeholder.id,
          () => `Here's your upcoming agenda:\n\n${lines}\n\nOpen the [Dashboard](/dashboard) to add a reminder.`,
        );
      }
      setBusy(false);
      return;
    }

    // ---- Gmail ----
    if (parseGmailIntent(text)) {
      const placeholder = newMessage("assistant", "");
      appendMessage(chatId, placeholder);
      setStreamingId(placeholder.id);
      const r = await listGmail(8);
      setStreamingId(null);
      if (r.error) {
        updateMessageContent(chatId, placeholder.id, () => `Gmail error: ${r.error}`);
      } else if (!r.messages || r.messages.length === 0) {
        updateMessageContent(chatId, placeholder.id, () => "Your inbox is empty.");
      } else {
        const lines = r.messages
          .map((m) => `- ${m.unread ? "🔵 " : ""}**${m.from.split("<")[0].trim()}** — ${m.subject}`)
          .join("\n");
        updateMessageContent(chatId, placeholder.id, () => `Here are your recent emails:\n\n${lines}`);
      }
      setBusy(false);
      return;
    }

    // ---- Drive ----
    if (parseDriveIntent(text)) {
      const placeholder = newMessage("assistant", "");
      appendMessage(chatId, placeholder);
      setStreamingId(placeholder.id);
      const r = await listDrive();
      setStreamingId(null);
      if (r.error) {
        updateMessageContent(chatId, placeholder.id, () => `Drive error: ${r.error}`);
      } else if (!r.files || r.files.length === 0) {
        updateMessageContent(chatId, placeholder.id, () => "Your Drive is empty.");
      } else {
        const lines = r.files
          .slice(0, 10)
          .map((f) => `- [${f.name}](${f.webViewLink ?? "#"})`)
          .join("\n");
        updateMessageContent(
          chatId,
          placeholder.id,
          () => `Recent files in your Drive:\n\n${lines}\n\nOpen the [Dashboard](/dashboard) to upload from your PC.`,
        );
      }
      setBusy(false);
      return;
    }

    // ---- Send email via Gmail ----
    const sendEmail = parseSendEmailIntent(text);
    if (sendEmail.isSend && sendEmail.to) {
      const placeholder = newMessage("assistant", "");
      appendMessage(chatId, placeholder);
      setStreamingId(placeholder.id);
      const r = await sendGmail({
        to: sendEmail.to,
        subject: sendEmail.subject ?? "Hello",
        body: sendEmail.body ?? "Hi,\n\nSent from SARVIS.",
      });
      setStreamingId(null);
      if (r.error) {
        updateMessageContent(chatId, placeholder.id, () => `Couldn't send email: ${r.error}`);
        toast.error(r.error);
      } else {
        updateMessageContent(
          chatId,
          placeholder.id,
          () => `✅ Email sent to **${sendEmail.to}**\n\n**Subject:** ${sendEmail.subject}\n\n${sendEmail.body}`,
        );
        toast.success("Email sent");
      }
      setBusy(false);
      return;
    }

    // ---- YouTube channel analytics ----
    if (parseYouTubeAnalyticsIntent(text)) {
      const placeholder = newMessage("assistant", "");
      appendMessage(chatId, placeholder);
      setStreamingId(placeholder.id);
      const r = await getYouTubeAnalytics();
      setStreamingId(null);
      if (r.error || !r.analytics) {
        updateMessageContent(chatId, placeholder.id, () => `YouTube error: ${r.error ?? "no data"}`);
      } else {
        const a = r.analytics;
        const subs = a.channel.subscriberHidden ? "hidden" : a.channel.subscriberCount.toLocaleString();
        const topLines = a.top.slice(0, 3)
          .map((v, i) => `${i + 1}. **${v.title}** — ${v.views.toLocaleString()} views, ${v.likes.toLocaleString()} likes`)
          .join("\n");
        updateMessageContent(
          chatId,
          placeholder.id,
          () => `📊 **${a.channel.title}** analytics:\n\n- Subscribers: **${subs}**\n- Total views: **${a.channel.viewCount.toLocaleString()}**\n- Videos: **${a.channel.videoCount.toLocaleString()}**\n- Avg views (last ${a.recent.length}): **${a.avgViews.toLocaleString()}**\n\n**Top recent videos:**\n${topLines || "_No recent videos_"}\n\nOpen the [Dashboard](/dashboard) for live stats.`,
        );
      }
      setBusy(false);
      return;
    }

    // ---- Reminder (creates calendar event) ----
    const reminder = parseReminderIntent(text);
    if (reminder.isReminder && reminder.whenISO && reminder.what) {
      const placeholder = newMessage("assistant", "");
      appendMessage(chatId, placeholder);
      setStreamingId(placeholder.id);
      const start = new Date(reminder.whenISO);
      const end = new Date(start.getTime() + 30 * 60 * 1000);
      const r = await createCalendarEvent({
        summary: reminder.what,
        startISO: start.toISOString(),
        endISO: end.toISOString(),
        reminderMinutes: reminder.reminderMinutes ?? 0,
      });
      setStreamingId(null);
      if (r.error) {
        updateMessageContent(chatId, placeholder.id, () => `Couldn't set reminder: ${r.error}`);
        toast.error(r.error);
      } else {
        updateMessageContent(
          chatId,
          placeholder.id,
          () => `⏰ Reminder set: **${reminder.what}** on ${start.toLocaleString()}.`,
        );
        toast.success("Reminder added to calendar");
      }
      setBusy(false);
      return;
    }

    if (isImageRequest(text)) {
      const placeholder = newMessage("assistant", "");
      appendMessage(chatId, placeholder);
      setStreamingId(placeholder.id);

      const result = await generateImage(text, { uncensored: settings.hackerMode });
      setStreamingId(null);

      if (result.error) {
        updateMessageContent(chatId, placeholder.id, () => `Image API Error: ${result.error}`);
        toast.error(result.error);
      } else {
        updateMessageContent(
          chatId,
          placeholder.id,
          () => result.text || "Here's your generated image:",
          { imageUrl: result.imageUrl },
        );
      }
      setBusy(false);
      return;
    }

    const aiMsg = newMessage("assistant", "");
    appendMessage(chatId, aiMsg);
    setStreamingId(aiMsg.id);

    // Initialize AbortController for streaming
    streamAbortControllerRef.current = new AbortController();

    let acc = "";
    const { withLocalContext } = await import("@/lib/localContext");
    const basePrompt = settings.studyMode
      ? buildStudyPrompt(settings.userProfile)
      : settings.systemPrompt;
    const effectiveSystem = withLocalContext(basePrompt);

    // Local Python model path (offline / opted-in). No streaming — one-shot reply.
    if (settings.useLocalModel) {
      const { sendLocalChat } = await import("@/lib/sarvis");
      const r = await sendLocalChat({ messages: historyForApi, systemPrompt: effectiveSystem });
      if (r.error) {
        updateMessageContent(chatId, aiMsg.id, () => `⚠️ Local model unavailable: ${r.error}\n\nFalling back to online.`);
        // fall through to online streaming below
      } else {
        updateMessageContent(chatId, aiMsg.id, () => `${r.reply ?? ""}\n\n_via local model (${r.adapter ?? "offline"}) — real-time data may be unavailable._`);
        setStreamingId(null);
        setBusy(false);
        streamAbortControllerRef.current = null;
        return;
      }
    }

    await streamChat({
      messages: historyForApi,
      model: settings.model,
      systemPrompt: effectiveSystem,
      signal: streamAbortControllerRef.current.signal,
      onDelta: (chunk) => {
        acc += chunk;
        updateMessageContent(chatId, aiMsg.id, () => acc);
      },
      onDone: () => {
        if (!acc) updateMessageContent(chatId, aiMsg.id, () => "No response");
        setStreamingId(null);
        setBusy(false);
        streamAbortControllerRef.current = null;
      },
      onError: (err) => {
        if (err !== "Message generation stopped") {
          updateMessageContent(chatId, aiMsg.id, () => `Error: ${err}`);
          toast.error(err);
        }
        setStreamingId(null);
        setBusy(false);
        streamAbortControllerRef.current = null;
      },
    });
  };

  const runFileGenerator = async (
    kind: "pdf" | "pptx" | "video",
    label: string,
    themeId?: SlideStyleId,
  ) => {
    if (busy || !activeChat) return;
    const topicSource = input.trim();
    const lastUser = [...activeChat.messages].reverse().find((m) => m.role === "user");
    const topic = topicSource || lastUser?.content || "";
    if (!topic) {
      toast.error(`Type a topic first, then tap "${label}".`);
      return;
    }

    // Slides → ask user to pick a style first (skip if one was just chosen)
    if (kind === "pptx" && !themeId) {
      setPendingSlideTopic(topic);
      setSlideStyleOpen(true);
      return;
    }

    const chatId = activeChat.id;
    appendMessage(chatId, newMessage("user", `[${label}] ${topic}`));
    setInput("");
    setBusy(true);

    const placeholder = newMessage("assistant", `Generating ${label.toLowerCase()}…`);
    appendMessage(chatId, placeholder);
    setStreamingId(placeholder.id);

    const result =
      kind === "pdf"
        ? await generateDocument(topic, settings.model)
        : kind === "pptx"
        ? await generateSlides(topic, settings.model, themeId)
        : await generateVideo(topic, settings.model);
    setStreamingId(null);
    setBusy(false);

    if (result.error) {
      updateMessageContent(chatId, placeholder.id, () => `Error: ${result.error}`);
      toast.error(result.error);
      return;
    }

    const canvasKind = kind === "pdf" ? "pdf" : kind === "pptx" ? "pptx" : "video";
    const display =
      kind === "pptx"
        ? `Your **${result.title ?? label}** slide deck is ready in the **${result.theme?.name ?? "selected"}** style — preview it on the right. Tap **Download** to save the .pptx.`
        : `Done. Opened ${label.toLowerCase()} in the canvas — tap **Download** to save.`;
    updateMessageContent(chatId, placeholder.id, () => display);
    handleOpenCanvas({
      kind: canvasKind,
      title: result.title ?? label,
      filename: result.filename,
      mimeType: result.mimeType,
      dataBase64: result.dataBase64,
      speakText: result.speakText,
      outline: result.outline,
      theme: result.theme,
      videoFrames: result.videoFrames,
      narration: result.narration,
      secondsPerFrame: result.secondsPerFrame,
    });
    toast.success(`${label} ready`);
  };

  const handlePickSlideStyle = (style: SlideStyleId) => {
    rememberSlideStyle(style);
    setSlideStyleOpen(false);
    const topic = pendingSlideTopic;
    setPendingSlideTopic("");
    if (topic) {
      setInput(topic);
      setTimeout(() => runFileGenerator("pptx", "Slides", style), 0);
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleVoiceTurn = (userText: string, aiText: string) => {
    if (!activeChat) return;
    const chatId = activeChat.id;
    appendMessage(chatId, newMessage("user", userText));
    appendMessage(chatId, newMessage("assistant", aiText));
  };

  // ---- Approve & run planned shell commands on the user's machine ----
  const runApprovedCommands = async (selected: PlannedCommand[]) => {
    if (!cmdPlan) return;
    const { chatId, placeholderId, originalRequest, os } = cmdPlan;
    setCmdDialogOpen(false);
    setBusy(true);

    const blocks: string[] = [`**Running on your ${os}…**\n`];
    let appendix = "";

    for (let i = 0; i < selected.length; i++) {
      const step = selected[i];
      blocks.push(`\n**Step ${i + 1}** — ${step.why}\n\`\`\`\n$ ${step.cmd}\n\`\`\``);
      updateMessageContent(chatId, placeholderId, () => blocks.join("\n") + appendix);

      // The backend classifier may still flag "risky" — user already approved here, so confirmed=true.
      const result = await execCommand(step.cmd, true);

      if ("error" in result && !("classification" in result)) {
        blocks.push(`\n❌ ${result.error}`);
        appendix = "";
        updateMessageContent(chatId, placeholderId, () => blocks.join("\n"));
        toast.error(result.error);
        break;
      }
      const r = result as Awaited<ReturnType<typeof execCommand>> & { ok: boolean; output: string; error: string; code: number };

      const out = (r.output ?? "").trim();
      const err = (r.error ?? "").trim();
      const tail = out ? `\n\`\`\`\n${out.slice(0, 1500)}${out.length > 1500 ? "\n…[truncated]" : ""}\n\`\`\`` : "";
      const errTail = err ? `\n_stderr:_\n\`\`\`\n${err.slice(0, 800)}\n\`\`\`` : "";
      blocks.push(`${r.ok ? "✅" : "❌"} exit ${r.code}${tail}${errTail}`);
      updateMessageContent(chatId, placeholderId, () => blocks.join("\n"));

      if (!r.ok) {
        // Auto-retry: ask the planner to fix the failing command.
        blocks.push(`\n🔧 Asking SARVIS to suggest a fix…`);
        updateMessageContent(chatId, placeholderId, () => blocks.join("\n"));
        const fix = await planCommand(originalRequest, settings.os, {
          cmd: step.cmd,
          code: r.code,
          output: out,
          error: err,
        });
        if (fix.plan && fix.plan.commands.length > 0 && !fix.plan.refused) {
          blocks.push(`\n💡 Suggested fix — ${fix.plan.explanation}\n\nClick "Run again" below to retry.`);
          updateMessageContent(chatId, placeholderId, () => blocks.join("\n"));
          // Queue the new plan for user approval
          setCmdPlan({
            ...cmdPlan,
            explanation: `Retry: ${fix.plan.explanation}`,
            commands: fix.plan.commands,
          });
          setCmdDialogOpen(true);
        } else {
          blocks.push(`\nNo automatic fix available. ${fix.plan?.explanation ?? fix.error ?? ""}`);
          updateMessageContent(chatId, placeholderId, () => blocks.join("\n"));
        }
        break;
      }
    }

    setBusy(false);
    setCmdPlan(null);
  };

  // ---- Approve & write a planned self-edit ----
  const applyApprovedEdit = async () => {
    if (!editPlan) return;
    const { path, newContent, chatId, placeholderId } = editPlan;
    setEditDialogOpen(false);
    setBusy(true);

    const result = await writeProjectFile(path, newContent, true);
    setBusy(false);

    if (result.error) {
      updateMessageContent(
        chatId,
        placeholderId,
        () => `❌ Couldn't write **${path}**: ${result.error}`,
      );
      toast.error(result.error);
    } else {
      updateMessageContent(
        chatId,
        placeholderId,
        () => `✅ Updated **${path}** on disk. Vite will hot-reload the change. A backup is in \`.sarvis-backups/\`.`,
      );
      toast.success(`Saved ${path}`);
    }
    setEditPlan(null);
  };

  const messages = activeChat?.messages ?? [];
  const isEmpty = messages.length === 0;

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-background">
      <ChatSidebar
        chats={sortedChats}
        activeId={activeId}
        collapsed={sidebarCollapsed}
        isMobile={isMobile}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
        onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
        onNew={() => {
          handleNew();
          setMobileSidebarOpen(false);
        }}
        onSelect={(id) => {
          handleSelect(id);
          setMobileSidebarOpen(false);
        }}
        onRename={handleRename}
        onDelete={handleDelete}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <main className="flex flex-1 flex-col min-w-0">
        <header className="flex items-center justify-between gap-2 border-b border-border bg-background/80 px-3 sm:px-4 py-2.5 backdrop-blur-sm">
          <div className="flex items-center gap-2 min-w-0">
            {isMobile && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileSidebarOpen(true)}
                aria-label="Open sidebar"
                className="h-9 w-9 shrink-0"
              >
                <Menu className="h-5 w-5" />
              </Button>
            )}
            <h2 className="truncate text-sm sm:text-base font-medium text-foreground">
              {activeChat?.title ?? "New Chat"}
            </h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {settings.studyMode && (
              <button
                type="button"
                onClick={() => setSettings({ ...settings, studyMode: false })}
                className="hidden sm:inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/20 transition-colors"
                title="Click to exit Learn Your Way mode"
              >
                <GraduationCap className="h-3 w-3" />
                Learn Your Way
              </button>
            )}
            <Button asChild variant="ghost" size="sm" className="h-8 gap-1.5 px-2">
              <Link to="/dashboard" aria-label="Open dashboard">
                <LayoutDashboard className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Dashboard</span>
              </Link>
            </Button>
            <span className="text-xs tracking-widest text-primary/80 text-glow">SARVIS AI</span>
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="mx-auto flex w-full max-w-3xl xl:max-w-4xl 2xl:max-w-5xl flex-col gap-4 sm:gap-6 px-3 sm:px-4 lg:px-6 py-4 sm:py-8">
            {isEmpty ? (
              <EmptyState onPick={(p) => setInput(p)} />
            ) : (
              messages.map((m) => (
                <MessageBubble
                  key={m.id}
                  message={m}
                  streaming={streamingId === m.id}
                  onOpenCanvas={handleOpenCanvas}
                />
              ))
            )}
          </div>
        </div>

        <div className="border-t border-border bg-background px-3 sm:px-4 pt-2 sm:pt-3 pb-2 sm:pb-3">
          <div className="mx-auto w-full max-w-3xl xl:max-w-4xl 2xl:max-w-5xl">
            {/* Attachment chips */}
            {attachments.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {attachments.map((a, i) => (
                  <div
                    key={`${a.name}-${i}`}
                    className="flex items-center gap-1.5 rounded-full border border-border bg-secondary/60 px-2.5 py-1 text-xs text-foreground"
                  >
                    <Paperclip className="h-3 w-3 text-muted-foreground" />
                    <span className="max-w-[160px] truncate">{a.name}</span>
                    <button
                      type="button"
                      onClick={() => removeAttachment(i)}
                      className="rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
                      aria-label={`Remove ${a.name}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-end gap-1.5 sm:gap-2 rounded-3xl border border-border bg-secondary/40 p-1.5 shadow-sm focus-within:border-foreground/30 focus-within:shadow transition-colors">
              {/* Tools menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 sm:h-10 sm:w-10 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
                    aria-label="Tools"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="start" className="w-60">
                  <DropdownMenuLabel>Generate</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => runFileGenerator("pdf", "Document")}>
                    <FileText className="mr-2 h-4 w-4" />
                    Document (PDF)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => runFileGenerator("pptx", "Slides")}>
                    <Presentation className="mr-2 h-4 w-4" />
                    Slides (PPTX)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => runFileGenerator("video", "Video")}>
                    <Film className="mr-2 h-4 w-4" />
                    Animated video
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Modes</DropdownMenuLabel>
                  <DropdownMenuItem
                    onClick={() => {
                      // Toggles personalized Learn Your Way mode (uses interests for explanations)
                      const next = !settings.studyMode;
                      if (next && (!settings.userProfile || !settings.userProfile.setupComplete)) {
                        setStudyProfileOpen(true);
                        return;
                      }
                      setSettings({ ...settings, studyMode: next });
                      toast.success(next ? "Learn Your Way: ON" : "Learn Your Way: OFF");
                    }}
                  >
                    <GraduationCap className="mr-2 h-4 w-4" />
                    <span className="flex-1">Learn Your Way</span>
                    {settings.studyMode && <Check className="h-4 w-4 text-primary" />}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setLearnOpen(true)}>
                    <Sparkles className="mr-2 h-4 w-4" />
                    New learning plan…
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>System</DropdownMenuLabel>
                  <div className="px-2 py-1.5">
                    <p className="mb-1 text-[11px] text-muted-foreground">Target OS</p>
                    <div className="flex gap-1">
                      {(["linux", "windows", "macos"] as OS[]).map((o) => (
                        <button
                          key={o}
                          type="button"
                          onClick={() => setSettings({ ...settings, os: o })}
                          className={`flex-1 rounded-md border px-2 py-1 text-[11px] capitalize transition-colors ${
                            settings.os === o
                              ? "border-primary bg-primary/15 text-primary"
                              : "border-border bg-background text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {o === "macos" ? "macOS" : o}
                        </button>
                      ))}
                    </div>
                  </div>
                  <DropdownMenuItem
                    onClick={() => {
                      const list = COMMAND_HELP.map((c) => `• \`${c.cmd}\` — ${c.desc}`).join("\n");
                      const help = `**SARVIS System Commands** _(${settings.os})_\n\nType any of these in the chat input — I'll generate the script for your OS and open it in the canvas. Copy & run it in your terminal.\n\n${list}\n\n**Examples:** \`/open lovable.dev\` · \`/ping 1.1.1.1\` · \`/volume 40\` · \`/chrome youtube.com\``;
                      if (activeChat) appendMessage(activeChat.id, newMessage("assistant", help));
                    }}
                  >
                    <Terminal className="mr-2 h-4 w-4" />
                    Show all commands
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleAttachClick}>
                    <Paperclip className="mr-2 h-4 w-4" />
                    Attach files
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setCallOpen(true)}
                className="h-9 w-9 sm:h-10 sm:w-10 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
                aria-label="Start voice call"
              >
                <Phone className="h-4 w-4" />
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleAttachClick}
                className="h-9 w-9 sm:h-10 sm:w-10 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
                aria-label="Attach files"
              >
                <Paperclip className="h-4 w-4" />
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileSelected}
                className="hidden"
                accept=".txt,.md,.json,.csv,.xml,.yaml,.yml,.js,.jsx,.ts,.tsx,.py,.go,.rs,.java,.c,.cpp,.h,.css,.html,.sh,.sql,.env,.toml,.ini,.log,text/*"
              />

              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Message SARVIS… (try /terminal, /chrome, /open lovable.dev)"
                rows={1}
                className="min-h-[40px] max-h-40 flex-1 resize-none border-0 bg-transparent px-1 py-2 text-[15px] focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none"
              />

              <Button
                type="button"
                onClick={busy ? handleStop : handleSend}
                disabled={!busy && !input.trim() && attachments.length === 0}
                size="icon"
                className="h-9 w-9 sm:h-10 sm:w-10 shrink-0 rounded-full bg-foreground text-background hover:bg-foreground/90 disabled:opacity-30 transition-all duration-200"
                aria-label={busy ? "Stop generation" : "Send message"}
              >
                {busy ? (
                  <Square className="h-4 w-4 fill-current animate-in zoom-in duration-200" />
                ) : (
                  <ArrowUp className="h-4 w-4 animate-in slide-in-from-bottom-2 duration-200" />
                )}
              </Button>
            </div>
            <p className="mx-auto mt-2 px-1 text-center text-[10px] sm:text-[11px] text-muted-foreground">
              SARVIS may produce inaccurate information. Press Enter to send · Shift+Enter for new line.
            </p>
          </div>
        </div>
      </main>

      <CodeCanvas
        open={canvasOpen}
        content={canvasContent}
        onClose={() => setCanvasOpen(false)}
      />

      <CallOverlay
        open={callOpen}
        onHangup={() => setCallOpen(false)}
        history={messages}
        settings={settings}
        onTurnComplete={handleVoiceTurn}
      />

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
        onChange={setSettings}
        onClearAll={handleClearAll}
      />

      <StudyProfileDialog
        open={studyProfileOpen}
        onOpenChange={setStudyProfileOpen}
        onSave={handleSaveProfile}
        initialProfile={settings.userProfile}
      />
      <LearnDialog
        open={learnOpen}
        onOpenChange={setLearnOpen}
        onResult={(result) => {
          // append first part of the generated lesson to the active chat
          const chat = chats.find((c) => c.id === activeId) ?? chats[0];
          if (!chat) return;
          const overview = result?.overview ? result.overview : JSON.stringify(result);
          const msg = newMessage('assistant', `Generated learning plan for your topic:\n\n${overview}`);
          appendMessage(chat.id, msg);
        }}
      />
      <SlideStyleDialog
        open={slideStyleOpen}
        onOpenChange={(o) => {
          setSlideStyleOpen(o);
          if (!o) setPendingSlideTopic("");
        }}
        onPick={handlePickSlideStyle}
        topic={pendingSlideTopic}
      />
      {cmdPlan && (
        <ConfirmCommandDialog
          open={cmdDialogOpen}
          onOpenChange={(o) => {
            setCmdDialogOpen(o);
            if (!o) setCmdPlan(null);
          }}
          explanation={cmdPlan.explanation}
          commands={cmdPlan.commands}
          os={cmdPlan.os}
          onApprove={runApprovedCommands}
        />
      )}
      {editPlan && (
        <SelfEditDialog
          open={editDialogOpen}
          onOpenChange={(o) => {
            setEditDialogOpen(o);
            if (!o) setEditPlan(null);
          }}
          filePath={editPlan.path}
          oldContent={editPlan.oldContent}
          newContent={editPlan.newContent}
          explanation={editPlan.explanation}
          onApprove={applyApprovedEdit}
        />
      )}
    </div>
  );
};

const EmptyState = ({ onPick }: { onPick: (prompt: string) => void }) => {
  const suggestions = [
    { icon: Sparkles, label: "Explain quantum entanglement simply" },
    { icon: ImageIcon, label: "Draw a futuristic flying car at sunset" },
    { icon: Sparkles, label: "Write a Python function that reverses a string" },
    { icon: ImageIcon, label: "Generate an image of a glowing cyber owl" },
  ];

  return (
    <div className="flex flex-col items-center gap-6 sm:gap-8 py-10 sm:py-20 text-center">
      <div className="relative flex h-20 w-20 sm:h-24 sm:w-24 items-center justify-center rounded-full border border-primary/40 bg-background overflow-hidden glow-ring">
        <img src={sarvisLogo} alt="SARVIS" className="h-full w-full object-cover" />
      </div>
      <div className="space-y-2">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-semibold tracking-tight text-foreground text-glow">
          How can I help today?
        </h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          Chat, generate images, attach files, or tap the phone for a voice call.
        </p>
      </div>

      <div className="grid w-full max-w-2xl grid-cols-1 gap-2 sm:grid-cols-2">
        {suggestions.map((s) => (
          <button
            key={s.label}
            onClick={() => onPick(s.label)}
            className="group flex items-center gap-3 rounded-xl border border-border bg-card p-3 text-left text-sm transition-colors hover:bg-secondary"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground/70 group-hover:bg-background">
              <s.icon className="h-4 w-4" />
            </div>
            <span className="text-foreground/80 group-hover:text-foreground">{s.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default Index;
