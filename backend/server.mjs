import express from "express";
import cors from "cors";
import { execSync, spawn } from "child_process";
import os from "os";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
// Generous default body limit so chat history + base64 audio chunks fit
// without triggering PayloadTooLargeError. Per-route limits below override
// only when even bigger payloads are expected (e.g. GGUF uploads).
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Detect OS
const getOS = () => {
  const platform = os.platform();
  if (platform === "win32") return "windows";
  if (platform === "darwin") return "darwin";
  return "linux";
};

// Utility: check if a command exists
function commandExists(cmd) {
  try {
    execSync(`command -v ${cmd}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// Utility: normalize URL (add https:// if no scheme)
function normalizeUrl(urlStr) {
  if (!urlStr) return urlStr;
  if (/^https?:\/\//i.test(urlStr)) return urlStr;
  return `https://${urlStr}`;
}

// Execute SARVIS commands
app.post("/api/sarvis", (req, res) => {
  try {
    const { command, args } = req.body;
    const currentOS = getOS();

    if (!command || !command.startsWith("/")) {
      return res.status(400).json({ error: "Invalid command format" });
    }

    let output = "";
    let error = "";

    try {
      // Execute the command based on OS
      switch (currentOS) {
        case "linux":
          output = executeLinuxCommand(command, args);
          break;
        case "windows":
          output = executeWindowsCommand(command, args);
          break;
        case "darwin":
          output = executeMacCommand(command, args);
          break;
      }

      res.json({
        success: true,
        output,
        command,
        os: currentOS,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      res.status(500).json({
        success: false,
        error: errorMessage,
        command,
      });
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: errorMessage });
  }
});

// Linux command handler
function executeLinuxCommand(command, args) {
  switch (command) {
    case "/terminal": {
      const terminals = ["x-terminal-emulator", "gnome-terminal", "konsole", "xterm", "tilix", "alacritty", "kitty"];
      let found = null;
      for (const t of terminals) {
        try {
          execSync(`command -v ${t}`, { stdio: "ignore" });
          found = t;
          break;
        } catch {
          // not found, try next
        }
      }

      if (found) {
        try {
          spawn(found, { detached: true });
          return "Terminal opening...";
        } catch (e) {
          return `Failed to open terminal (${found}): ${e instanceof Error ? e.message : String(e)}`;
        }
      }

      return "No terminal emulator found on this system. Install a terminal (gnome-terminal/xterm/konsole) or run commands manually.";
    }
    case "/settings":
      spawn("gnome-control-center", { detached: true });
      return "Settings opening...";
    case "/files":
      spawn("nautilus", ["."], { detached: true });
      return "File manager opening...";
    case "/chrome": {
      const url = args ? normalizeUrl(args) : "";
      try {
        spawn("google-chrome", url ? [url] : [], { detached: true });
        return url ? `Opening Chrome with ${url}...` : `Opening Chrome...`;
      } catch (e) {
        return `Failed to open Chrome: ${e instanceof Error ? e.message : String(e)}`;
      }
    }
    case "/firefox": {
      const url = args ? normalizeUrl(args) : "";
      try {
        spawn("firefox", url ? [url] : [], { detached: true });
        return url ? `Opening Firefox with ${url}...` : `Opening Firefox...`;
      } catch (e) {
        return `Failed to open Firefox: ${e instanceof Error ? e.message : String(e)}`;
      }
    }
    case "/edge": {
      const url = args ? normalizeUrl(args) : "";
      try {
        spawn("microsoft-edge", url ? [url] : [], { detached: true });
        return url ? `Opening Edge with ${url}...` : `Opening Edge...`;
      } catch (e) {
        return `Failed to open Edge: ${e instanceof Error ? e.message : String(e)}`;
      }
    }
    case "/open": {
      const url = normalizeUrl(args);
      try {
        spawn("xdg-open", [url], { detached: true });
        return `Opening ${url}...`;
      } catch (e) {
        return `Failed to open: ${e instanceof Error ? e.message : String(e)}`;
      }
    }
    case "/search":
      spawn("xdg-open", [`https://www.google.com/search?q=${args}`], {
        detached: true,
      });
      return `Searching for ${args}...`;
    case "/youtube":
      spawn("xdg-open", [
        `https://www.youtube.com/results?search_query=${args}`,
      ]);
      return `Opening YouTube search for ${args}...`;
    case "/gmail":
      spawn("xdg-open", ["https://mail.google.com"], { detached: true });
      return "Opening Gmail...";
    case "/maps":
      spawn("xdg-open", ["https://maps.google.com"], { detached: true });
      return "Opening Maps...";
    case "/news":
      spawn("xdg-open", ["https://news.google.com"], { detached: true });
      return "Opening News...";
    case "/weather":
      spawn("xdg-open", ["https://weather.com"], { detached: true });
      return "Opening Weather...";
    case "/shutdown":
      execSync("shutdown now", { stdio: "inherit" });
      return "Shutting down...";
    case "/restart":
      execSync("reboot", { stdio: "inherit" });
      return "Restarting...";
    case "/sleep":
      execSync("systemctl suspend", { stdio: "inherit" });
      return "Suspending...";
    case "/lock":
      try {
        if (commandExists("gnome-screensaver-command")) {
          execSync("gnome-screensaver-command -l");
          return "Screen locked...";
        } else if (commandExists("loginctl")) {
          execSync("loginctl lock-session");
          return "Screen locked...";
        } else if (commandExists("xdg-screensaver")) {
          execSync("xdg-screensaver lock");
          return "Screen locked...";
        } else {
          return "⚠ No lock command available. Install gnome-screensaver or use: xdg-screensaver or loginctl";
        }
      } catch (e) {
        return `⚠ Lock failed: ${e instanceof Error ? e.message : String(e)}`;
      }
    case "/logout":
      execSync("gnome-session-quit --logout --no-prompt", {
        stdio: "inherit",
      });
      return "Logging out...";
    case "/screenshot":
      try {
        if (commandExists("gnome-screenshot")) {
          execSync("gnome-screenshot");
          return "Screenshot taken...";
        } else if (commandExists("scrot")) {
          execSync("scrot screenshot.png");
          return `Screenshot saved to ~/screenshot.png`;
        } else if (commandExists("flameshot")) {
          execSync("flameshot gui");
          return "Screenshot tool opened...";
        } else {
          return "⚠ No screenshot tool available. Install gnome-screenshot, scrot, or flameshot";
        }
      } catch (e) {
        return `⚠ Screenshot failed: ${e instanceof Error ? e.message : String(e)}`;
      }
    case "/notepad":
      spawn("gedit", { detached: true });
      return "Text editor opening...";
    case "/calc":
      spawn("gnome-calculator", { detached: true });
      return "Calculator opening...";
    case "/wifi":
      return execSync("nmcli dev wifi list").toString();
    case "/bluetooth":
      spawn("bluetoothctl", { detached: true });
      return "Bluetooth control opening...";
    case "/ip":
      return execSync("ip a").toString();
    case "/ping":
      return execSync(`ping -c 4 ${args}`).toString();
    case "/volume":
      try {
        if (commandExists("pactl")) {
          execSync(`pactl set-sink-volume @DEFAULT_SINK@ ${args}%`);
          return `Volume set to ${args}%`;
        } else if (commandExists("amixer")) {
          execSync(`amixer set Master ${args}%`);
          return `Volume set to ${args}%`;
        } else {
          return "⚠ No volume control available. Install pulseaudio-utils (pactl) or alsa-utils (amixer)";
        }
      } catch (e) {
        return `⚠ Volume control failed: ${e instanceof Error ? e.message : String(e)}`;
      }
    case "/mute":
      try {
        if (commandExists("pactl")) {
          execSync("pactl set-sink-mute @DEFAULT_SINK@ 1");
          return "Muted";
        } else if (commandExists("amixer")) {
          execSync("amixer set Master mute");
          return "Muted";
        } else {
          return "⚠ No mute control available. Install pulseaudio-utils or alsa-utils";
        }
      } catch (e) {
        return `⚠ Mute failed: ${e instanceof Error ? e.message : String(e)}`;
      }
    case "/unmute":
      try {
        if (commandExists("pactl")) {
          execSync("pactl set-sink-mute @DEFAULT_SINK@ 0");
          return "Unmuted";
        } else if (commandExists("amixer")) {
          execSync("amixer set Master unmute");
          return "Unmuted";
        } else {
          return "⚠ No unmute control available. Install pulseaudio-utils or alsa-utils";
        }
      } catch (e) {
        return `⚠ Unmute failed: ${e instanceof Error ? e.message : String(e)}`;
      }
    case "/brightness":
      execSync(`brightnessctl set ${args}%`);
      return `Brightness set to ${args}%`;
    case "/play":
      execSync("playerctl play");
      return "Playing...";
    case "/pause":
      execSync("playerctl pause");
      return "Paused...";
    case "/clipboard":
      return execSync("xclip -o").toString();
    case "/processes":
      return execSync("ps aux").toString();
    case "/kill":
      execSync(`pkill ${args}`);
      return `Killed process: ${args}`;
    case "/whoami":
      return execSync("whoami").toString();
    case "/date":
      return execSync("date").toString();
    case "/uptime":
      return execSync("uptime").toString();
    case "/disk":
      return execSync("df -h").toString();
    case "/battery":
      return execSync("upower -i $(upower -e | grep BAT)").toString();
    default:
      return `Unknown command: ${command}`;
  }
}

// Windows command handler
function executeWindowsCommand(command, args) {
  const commands = {
    "/terminal": "start cmd",
    "/settings": "start ms-settings:",
    "/files": "start explorer",
    "/chrome": `start chrome ${args}`,
    "/firefox": `start firefox ${args}`,
    "/edge": `start msedge ${args}`,
    "/open": `start ${args}`,
    "/search": `start https://www.google.com/search?q=${args}`,
    "/youtube": `start https://www.youtube.com/results?search_query=${args}`,
    "/gmail": "start https://mail.google.com",
    "/maps": "start https://maps.google.com",
    "/news": "start https://news.google.com",
    "/weather": "start https://weather.com",
    "/shutdown": "shutdown /s /t 0",
    "/restart": "shutdown /r /t 0",
    "/sleep": "rundll32.exe powrprof.dll,SetSuspendState 0,1,0",
    "/lock": "rundll32.exe user32.dll,LockWorkStation",
    "/logout": "shutdown /l",
    "/screenshot": "snippingtool",
    "/notepad": "start notepad",
    "/calc": "start calc",
    "/wifi": "netsh wlan show profiles",
    "/bluetooth": "start ms-settings:bluetooth",
    "/ip": "ipconfig",
    "/ping": `ping ${args}`,
    "/mute": "volume mute",
    "/unmute": "volume unmute",
    "/clipboard": "powershell Get-Clipboard",
    "/processes": "tasklist",
    "/whoami": "whoami",
    "/date": "date /T",
    "/uptime": "net stats workstation",
    "/disk": "wmic logicaldisk get size,freespace,caption",
    "/battery": "powercfg /batteryreport",
  };

  if (command in commands) {
    try {
      const output = execSync(commands[command]).toString();
      return output;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return `Command executed: ${commands[command]} - ${errorMessage}`;
    }
  }

  return `Unknown command: ${command}`;
}

// macOS command handler
function executeMacCommand(command, args) {
  switch (command) {
    case "/terminal":
      spawn("open", ["-a", "Terminal"], { detached: true });
      return "Terminal opening...";
    case "/settings":
      spawn("open", ["-a", "System Settings"], { detached: true });
      return "Settings opening...";
    case "/files":
      spawn("open", ["."], { detached: true });
      return "Finder opening...";
    case "/chrome":
      spawn("open", ["-a", "Google Chrome", args], { detached: true });
      return `Opening Chrome with ${args}...`;
    case "/firefox":
      spawn("open", ["-a", "Firefox", args], { detached: true });
      return `Opening Firefox with ${args}...`;
    case "/edge":
      spawn("open", ["-a", "Microsoft Edge", args], { detached: true });
      return `Opening Edge with ${args}...`;
    case "/open":
      spawn("open", [args], { detached: true });
      return `Opening ${args}...`;
    case "/search":
      spawn("open", [`https://www.google.com/search?q=${args}`], {
        detached: true,
      });
      return `Searching for ${args}...`;
    case "/youtube":
      spawn("open", [
        `https://www.youtube.com/results?search_query=${args}`,
      ]);
      return `Opening YouTube search for ${args}...`;
    case "/gmail":
      spawn("open", ["https://mail.google.com"], { detached: true });
      return "Opening Gmail...";
    case "/maps":
      spawn("open", ["https://maps.google.com"], { detached: true });
      return "Opening Maps...";
    case "/news":
      spawn("open", ["https://news.google.com"], { detached: true });
      return "Opening News...";
    case "/weather":
      spawn("open", ["https://weather.com"], { detached: true });
      return "Opening Weather...";
    case "/screenshot":
      execSync(`screencapture ~/Desktop/screenshot-${Date.now()}.png`);
      return "Screenshot taken...";
    case "/notepad":
      spawn("open", ["-a", "TextEdit"], { detached: true });
      return "Text editor opening...";
    case "/calc":
      spawn("open", ["-a", "Calculator"], { detached: true });
      return "Calculator opening...";
    case "/wifi":
      return execSync(
        "/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport -s"
      ).toString();
    case "/bluetooth":
      spawn("open", ["x-apple.systempreferences:com.apple.Bluetooth"], {
        detached: true,
      });
      return "Bluetooth settings opening...";
    case "/ip":
      return execSync("ifconfig").toString();
    case "/ping":
      return execSync(`ping -c 4 ${args}`).toString();
    case "/volume":
      execSync(`osascript -e "set volume output volume ${args}"`);
      return `Volume set to ${args}%`;
    case "/mute":
      execSync(`osascript -e "set volume with output muted"`);
      return "Muted";
    case "/unmute":
      execSync(`osascript -e "set volume without output muted"`);
      return "Unmuted";
    case "/play":
      execSync(
        `osascript -e 'tell application "Music" to play'`
      );
      return "Playing...";
    case "/pause":
      execSync(
        `osascript -e 'tell application "Music" to pause'`
      );
      return "Paused...";
    case "/clipboard":
      return execSync("pbpaste").toString();
    case "/processes":
      return execSync("ps aux").toString();
    case "/kill":
      execSync(`pkill ${args}`);
      return `Killed process: ${args}`;
    case "/whoami":
      return execSync("whoami").toString();
    case "/date":
      return execSync("date").toString();
    case "/uptime":
      return execSync("uptime").toString();
    case "/disk":
      return execSync("df -h").toString();
    case "/battery":
      return execSync("pmset -g batt").toString();
    default:
      return `Unknown command: ${command}`;
  }
}

// System info endpoint
app.get("/api/system-info", (req, res) => {
  try {
    const currentOS = getOS();
    const systemInfo = getSystemInfo(currentOS);
    res.json(systemInfo);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: errorMessage });
  }
});

// Get system information
const getSystemInfo = (os) => {
  const info = {
    os,
    username: execSync("whoami").toString().trim(),
    time: new Date().toISOString(),
    uptime: execSync("uptime").toString().trim(),
  };

  try {
    switch (os) {
      case "linux":
        info.cpu = execSync("top -bn1 | grep 'Cpu(s)' | sed 's/.*, *\\([0-9.]*\\)%* id.*/\\1/' | awk '{print 100 - $1}'").toString().trim();
        info.ram = execSync("free -h | grep Mem | awk '{print $3 \"/\" $2}'").toString().trim();
        info.storage = execSync("df -h / | tail -1 | awk '{print $3 \"/\" $2 \" (\" $5 \" used)\"}'").toString().trim();
        info.battery = execSync("upower -i $(upower -e | grep BAT) | grep percentage | awk '{print $2}'").toString().trim();
        info.wifi = execSync("nmcli dev wifi | grep '*' | awk '{print $3}'").toString().trim();
        info.netStat = execSync("ip route get 8.8.8.8 | awk '{print $5}'").toString().trim();
        info.bluetooth = execSync("bluetoothctl show | grep Powered | awk '{print $2}'").toString().trim();
        break;
      case "windows":
        info.cpu = execSync("wmic cpu get loadpercentage /value").toString().split("=")[1].trim();
        info.ram = execSync("wmic OS get FreePhysicalMemory,TotalVisibleMemorySize /value").toString().trim();
        info.storage = execSync("wmic logicaldisk get size,freespace,caption /value").toString().trim();
        info.battery = execSync("powercfg /batteryreport /output battery.html && findstr /C:\"Remaining Capacity\" battery.html").toString().trim();
        info.wifi = execSync("netsh wlan show interfaces | findstr SSID").toString().trim();
        info.netStat = execSync("ipconfig | findstr IPv4").toString().trim();
        info.bluetooth = "Check Bluetooth settings";
        break;
      case "darwin":
        info.cpu = execSync("ps -A -o %cpu | awk '{s+=$1} END {print s}'").toString().trim();
        info.ram = execSync("vm_stat | grep 'Pages active' | awk '{print $3}'").toString().trim();
        info.storage = execSync("df -h / | tail -1 | awk '{print $3 \"/\" $2}'").toString().trim();
        info.battery = execSync("pmset -g batt | grep -o '[0-9]*%'").toString().trim();
        info.wifi = execSync("/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport -I | awk '/ SSID/ {print substr($0, index($0, $2))}'").toString().trim();
        info.netStat = execSync("ifconfig | grep inet | grep -v inet6 | head -1 | awk '{print $2}'").toString().trim();
        info.bluetooth = execSync("system_profiler SPBluetoothDataType | grep -A 5 'Bluetooth:' | grep 'State:' | awk '{print $2}'").toString().trim();
        break;
    }
  } catch (e) {
    // Some commands might fail, continue with available info
  }

  return info;
};

// Signal handlers for debugging
process.on('SIGTERM', () => {
  console.log('Received SIGTERM');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT');
  process.exit(0);
});

process.on('SIGHUP', () => {
  console.log('Received SIGHUP');
});

process.on('exit', (code) => {
  console.log(`Process exiting with code ${code}`);
});

app.listen(PORT, () => {
  console.log(`SARVIS Backend Server running on http://localhost:${PORT}`);
  console.log("Listening for SARVIS commands...");
});

// Simple AI mode state and helpers (online/offline + model uploads)
let aiMode = { mode: 'online', model: null };

app.get('/api/ai-mode', (req, res) => {
  res.json(aiMode);
});

app.post('/api/ai-mode', (req, res) => {
  try {
    const { mode, model } = req.body || {};
    if (mode && (mode === 'online' || mode === 'offline')) {
      aiMode.mode = mode;
    }
    if (model && typeof model === 'string') {
      aiMode.model = model;
    }
    return res.json({ ok: true, mode: aiMode });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

// Upload a GGUF model as base64 JSON payload: { filename, dataBase64 }.
// Saves it under backend/models/ and points the local Python bridge to it
// via SARVIS_GGUF_PATH so the next /api/local-chat call uses it.
const MODELS_DIR = path.join(__dirname, "models");
app.post('/api/upload-model', express.json({ limit: '4gb' }), (req, res) => {
  try {
    const { filename, dataBase64 } = req.body || {};
    if (!filename || !dataBase64) return res.status(400).json({ error: 'missing filename/dataBase64' });
    const safeName = path.basename(String(filename));
    if (!/\.gguf$/i.test(safeName)) return res.status(400).json({ error: 'must be .gguf' });
    const buf = Buffer.from(dataBase64, 'base64');
    if (buf.length < 4 || buf.slice(0, 4).toString('ascii') !== 'GGUF') {
      return res.status(400).json({ error: 'not a GGUF file' });
    }
    fs.mkdirSync(MODELS_DIR, { recursive: true });
    const outPath = path.join(MODELS_DIR, safeName);
    fs.writeFileSync(outPath, buf);
    // Point the python bridge at this file and restart it so the new path takes effect.
    process.env.SARVIS_GGUF_PATH = outPath;
    if (typeof _localPy !== 'undefined' && _localPy && !_localPy.killed) {
      try { _localPy.kill('SIGTERM'); } catch (_) { /* ignore */ }
      _localPy = null;
      _localPyReady = false;
    }
    return res.json({ ok: true, filename: safeName, path: outPath, bytes: buf.length });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

// ---- Safety classifier for arbitrary shell commands ----
// Returns "safe" | "risky" | "blocked"
function classifyCommand(cmd) {
  const c = cmd.trim();
  if (!c) return "blocked";

  // Hard blocks — never run, even with confirmation, from this endpoint
  const blocked = [
    /\brm\s+-rf?\s+\/(?!\w)/i,        // rm -rf /
    /\bmkfs(\.|\s)/i,                  // mkfs
    /\bdd\s+if=.*of=\/dev\//i,        // dd to raw device
    /:\(\)\s*\{\s*:\|:&\s*\}\s*;:/,   // fork bomb
    /\bchmod\s+-R\s+777\s+\//i,
    /\b>\s*\/dev\/sd[a-z]/i,
  ];
  if (blocked.some((r) => r.test(c))) return "blocked";

  // Risky — needs explicit user confirmation
  const risky = [
    /\bsudo\b/i,
    /\bsu\s+/i,
    /\b(apt|apt-get|dnf|yum|pacman|snap|brew|winget|choco|scoop)\s+(install|remove|update|upgrade|purge)/i,
    /\bpip\s+install/i,
    /\bnpm\s+(install|i|uninstall|remove|publish)/i,
    /\bcurl\s+[^|]*\|\s*(sh|bash|zsh)/i,         // curl | sh
    /\bwget\s+[^|]*\|\s*(sh|bash|zsh)/i,
    /\brm\s+-rf?\b/i,
    /\bmv\s+.*\s+\/(etc|usr|var|boot|sys|root)/i,
    /\b(systemctl|service)\s+(start|stop|restart|disable|enable|poweroff|reboot|suspend|hibernate)/i,
    /\b(shutdown|reboot|halt|poweroff)\b/i,        // power commands now allowed with confirm
    /\brundll32\.exe\s+(user32\.dll,LockWorkStation|powrprof\.dll)/i,
    /\bloginctl\s+(lock-session|terminate-session)/i,
    /\bgnome-session-quit\b/i,
    /\bkill(all)?\s+-9?\s*/i,
    /\biptables\b/i,
    /\bufw\b/i,
    /\bcrontab\s+-/i,
    /\bgit\s+(push|reset\s+--hard|clean\s+-f)/i,
    /\bdocker\s+(run|rm|kill|stop)/i,
    />\s*\/etc\//i,
  ];
  if (risky.some((r) => r.test(c))) return "risky";

  return "safe";
}

function shellFor(currentOS) {
  if (currentOS === "windows") return { bin: "powershell.exe", flag: "-Command" };
  return { bin: "sh", flag: "-c" };
}

// ---- Run an arbitrary shell command (with classification) ----
// POST { cmd: string, confirmed?: boolean, cwd?: string }
// If risky and !confirmed → returns 409 with { needsConfirm: true, classification: "risky", cmd }
// Blocked commands return 403.
app.post("/api/exec", (req, res) => {
  try {
    const { cmd, confirmed = false, cwd } = req.body || {};
    if (!cmd || typeof cmd !== "string") {
      return res.status(400).json({ error: "Missing 'cmd' (string) in body" });
    }
    const currentOS = getOS();
    const classification = classifyCommand(cmd);

    if (classification === "blocked") {
      return res.status(403).json({
        error: "Command blocked for safety (matches a destructive pattern).",
        classification,
        cmd,
        os: currentOS,
      });
    }
    if (classification === "risky" && !confirmed) {
      return res.status(409).json({
        needsConfirm: true,
        classification,
        cmd,
        os: currentOS,
        message: "This command requires explicit user confirmation before running.",
      });
    }

    const { bin, flag } = shellFor(currentOS);
    const child = spawn(bin, [flag, cmd], {
      cwd: cwd && typeof cwd === "string" ? cwd : PROJECT_ROOT,
      detached: false,
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => { out += d.toString(); });
    child.stderr.on("data", (d) => { err += d.toString(); });

    const timeout = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch (e) { /* ignore */ }
    }, 60_000);

    child.on("close", (code) => {
      clearTimeout(timeout);
      // truncate massive outputs
      const trim = (s) => (s.length > 20_000 ? s.slice(0, 20_000) + "\n…[truncated]" : s);
      return res.json({
        ok: code === 0,
        code,
        classification,
        cmd,
        os: currentOS,
        output: trim(out),
        error: trim(err),
      });
    });

    child.on("error", (e) => {
      clearTimeout(timeout);
      return res.status(500).json({ error: String(e), classification, cmd, os: currentOS });
    });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

// Backward-compat: keep the old /api/run-command but route it through /api/exec logic
app.post("/api/run-command", (req, res) => {
  req.url = "/api/exec";
  req.body = { cmd: req.body?.cmd, confirmed: true };
  app._router.handle(req, res);
});

// ---- File read / write / list for "edit your own code" feature ----
// All paths are constrained to PROJECT_ROOT.
function safeResolve(rel) {
  if (typeof rel !== "string" || !rel) throw new Error("invalid path");
  // strip leading slashes so "/src/foo" → "src/foo"
  const cleaned = rel.replace(/^[/\\]+/, "");
  const abs = path.resolve(PROJECT_ROOT, cleaned);
  if (!abs.startsWith(PROJECT_ROOT + path.sep) && abs !== PROJECT_ROOT) {
    throw new Error("path escapes project root");
  }
  return abs;
}

app.post("/api/file/read", (req, res) => {
  try {
    const { path: rel } = req.body || {};
    const abs = safeResolve(rel);
    const stat = fs.statSync(abs);
    if (stat.size > 2 * 1024 * 1024) {
      return res.status(413).json({ error: "File too large to read (>2MB)" });
    }
    const content = fs.readFileSync(abs, "utf8");
    res.json({ ok: true, path: rel, content, size: stat.size });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

app.post("/api/file/write", (req, res) => {
  try {
    const { path: rel, content, confirmed = false } = req.body || {};
    if (typeof content !== "string") {
      return res.status(400).json({ error: "'content' must be a string" });
    }
    if (!confirmed) {
      return res.status(409).json({
        needsConfirm: true,
        message: "Self-edit must be explicitly confirmed by the user.",
        path: rel,
        bytes: content.length,
      });
    }
    const abs = safeResolve(rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    // backup
    if (fs.existsSync(abs)) {
      const backupDir = path.join(PROJECT_ROOT, ".sarvis-backups");
      fs.mkdirSync(backupDir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const backupName = rel.replace(/[/\\]/g, "_") + "." + stamp + ".bak";
      fs.copyFileSync(abs, path.join(backupDir, backupName));
    }
    fs.writeFileSync(abs, content, "utf8");
    res.json({ ok: true, path: rel, bytes: content.length });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

app.post("/api/file/list", (req, res) => {
  try {
    const { path: rel = "" } = req.body || {};
    const abs = safeResolve(rel || ".");
    const entries = fs.readdirSync(abs, { withFileTypes: true })
      .filter((d) => !d.name.startsWith(".") && d.name !== "node_modules" && d.name !== "dist")
      .map((d) => ({ name: d.name, isDir: d.isDirectory() }));
    res.json({ ok: true, path: rel, entries });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

// Adaptive learning endpoint: generate structured course material for a topic
app.post('/api/learn', express.json({ limit: '1mb' }), async (req, res) => {
  try {
    const { topic, interests = [], level = 'Beginner', saveProfile = false, profile = null } = req.body || {};
    if (!topic || typeof topic !== 'string') return res.status(400).json({ error: 'missing topic' });

    // Build a structured prompt asking the model to output JSON with a predictable schema
    const prompt = `You are an adaptive teaching engine. Given a topic, interests, and level, produce a JSON object with keys: title, overview, conceptTree (array of {id,title,summary}), lessons (array of {id,title,content}), quizzes (array of {id,question,choices,answer}), flashcards (array of {front,back}). Topic: ${topic}. Interests: ${(Array.isArray(interests)?interests.join(', '):interests)}. Level: ${level}. Output only valid JSON.`;

    // Ensure AI model loaded (prefer ai)
    try {
      ensure_model_loaded('ai');
    } catch (e) { /* ignore */ }

    if (typeof llm !== 'function') {
      return res.status(500).json({ error: 'no model loaded' });
    }

    let out = null;
    try {
      const raw = llm(prompt, { max_new_tokens: 800, temperature: 0.7 });
      // some llm return strings, some streams; ensure string
      const txt = typeof raw === 'string' ? raw : String(raw);
      try {
        out = JSON.parse(txt);
      } catch (e) {
        // attempt to extract JSON substring
        const m = txt.match(/\{[\s\S]*\}/);
        if (m) {
          try { out = JSON.parse(m[0]); } catch (e2) { out = { raw: txt }; }
        } else {
          out = { raw: txt };
        }
      }
    } catch (e) {
      return res.status(500).json({ error: String(e) });
    }

    // Optionally persist profile locally
    if (saveProfile && profile && typeof profile === 'object') {
      try {
        const fs = require('fs');
        const p = new URL('../user_profiles.json', import.meta.url).pathname;
        let cur = {};
        try { cur = JSON.parse(fs.readFileSync(p, 'utf8') || '{}'); } catch (e) { cur = {}; }
        cur[profile.username || 'default'] = profile;
        fs.writeFileSync(p, JSON.stringify(cur, null, 2));
      } catch (e) {
        // ignore save errors
      }
    }

    return res.json({ ok: true, result: out });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

// ----------------------------------------------------------------------
// Local Python model bridge — spawns backend/local_model.py once and pipes
// chat requests over stdin/stdout. Used when the user enables "offline /
// local model" in settings. The Python script handles Ollama / llama.cpp /
// transformers internally.
// ----------------------------------------------------------------------
let _localPy = null;
let _localPyReady = false;
let _localPyBuffer = "";
const _localPyPending = new Map(); // id → {resolve, reject, timer}
let _localPyNextId = 1;

function ensureLocalPython() {
  if (_localPy && !_localPy.killed) return _localPy;
  const pyBin = process.env.SARVIS_PYTHON || "python3";
  const script = path.join(__dirname, "local_model.py");
  if (!fs.existsSync(script)) {
    throw new Error(`local_model.py not found at ${script}`);
  }
  console.log(`[sarvis] spawning local model bridge: ${pyBin} ${script}`);
  const proc = spawn(pyBin, [script], {
    cwd: __dirname,
    env: { ...process.env },
    stdio: ["pipe", "pipe", "pipe"],
  });
  proc.stdout.setEncoding("utf8");
  proc.stderr.setEncoding("utf8");
  proc.stdout.on("data", (chunk) => {
    _localPyBuffer += chunk;
    let nl;
    while ((nl = _localPyBuffer.indexOf("\n")) !== -1) {
      const line = _localPyBuffer.slice(0, nl).trim();
      _localPyBuffer = _localPyBuffer.slice(nl + 1);
      if (!line) continue;
      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch {
        console.warn("[sarvis-local] non-JSON line:", line.slice(0, 200));
        continue;
      }
      if (parsed && parsed.ready === true) {
        _localPyReady = true;
        console.log(`[sarvis] local model bridge ready (ollama=${parsed.ollama_model} @ ${parsed.ollama_host})`);
        continue;
      }
      const id = parsed && parsed.id;
      if (id != null && _localPyPending.has(id)) {
        const { resolve, timer } = _localPyPending.get(id);
        clearTimeout(timer);
        _localPyPending.delete(id);
        resolve(parsed);
      }
    }
  });
  proc.stderr.on("data", (chunk) => {
    process.stderr.write(`[sarvis-local stderr] ${chunk}`);
  });
  proc.on("exit", (code) => {
    console.warn(`[sarvis] local model bridge exited (code=${code})`);
    _localPy = null;
    _localPyReady = false;
    for (const [id, { reject, timer }] of _localPyPending) {
      clearTimeout(timer);
      reject(new Error("local model process exited"));
      _localPyPending.delete(id);
    }
  });
  _localPy = proc;
  return proc;
}

function callLocalPython({ messages, system }, timeoutMs = 120_000) {
  return new Promise((resolve, reject) => {
    let proc;
    try {
      proc = ensureLocalPython();
    } catch (e) {
      return reject(e);
    }
    const id = _localPyNextId++;
    const timer = setTimeout(() => {
      if (_localPyPending.has(id)) {
        _localPyPending.delete(id);
        reject(new Error("local model timed out"));
      }
    }, timeoutMs);
    _localPyPending.set(id, { resolve, reject, timer });
    try {
      proc.stdin.write(JSON.stringify({ id, messages, system }) + "\n");
    } catch (e) {
      clearTimeout(timer);
      _localPyPending.delete(id);
      reject(e);
    }
  });
}

app.get("/api/local-chat/status", (req, res) => {
  res.json({
    running: !!(_localPy && !_localPy.killed),
    ready: _localPyReady,
    pending: _localPyPending.size,
    pythonBin: process.env.SARVIS_PYTHON || "python3",
    ollamaHost: process.env.OLLAMA_HOST || "http://127.0.0.1:11434",
    ollamaModel: process.env.OLLAMA_MODEL || "llama3.2",
  });
});

app.post("/api/local-chat", async (req, res) => {
  try {
    const { messages, system } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages[] required" });
    }
    const out = await callLocalPython({ messages, system });
    if (out && out.error) {
      return res.status(503).json({ error: out.error, tried: out.tried ?? [] });
    }
    return res.json({ reply: out.reply ?? "", adapter: out.adapter ?? "unknown" });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

app.post("/api/local-chat/stop", (req, res) => {
  if (_localPy && !_localPy.killed) {
    _localPy.kill("SIGTERM");
    _localPy = null;
    _localPyReady = false;
    return res.json({ ok: true, stopped: true });
  }
  res.json({ ok: true, stopped: false });
});

