import express, { Express, Request, Response } from "express";
import { execSync, spawn } from "child_process";
import * as os from "os";
import cors from "cors";

const app: Express = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const safeExec = (cmd: string, fallback = "N/A", timeout = 600): string => {
  try {
    return execSync(cmd, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout,
    }).trim() || fallback;
  } catch {
    return fallback;
  }
};

// Detect OS
const getOS = (): "linux" | "windows" | "darwin" => {
  const platform = os.platform();
  if (platform === "win32") return "windows";
  if (platform === "darwin") return "darwin";
  return "linux";
};

// Get system information
const getSystemInfo = (os: "linux" | "windows" | "darwin") => {
  const info: any = {
    os,
    username: safeExec("whoami", "Unknown", 300),
    time: new Date().toISOString(),
    uptime: safeExec("uptime", "N/A", 500),
  };

  switch (os) {
    case "linux":
      info.cpu = safeExec("top -bn1 | grep 'Cpu(s)' | sed 's/.*, *\\([0-9.]*\\)%* id.*/\\1/' | awk '{print 100 - $1}'");
      info.ram = safeExec("free -h | grep Mem | awk '{print $3 \"/\" $2}'");
      info.storage = safeExec("df -h / | tail -1 | awk '{print $3 \"/\" $2 \" (\" $5 \" used)\"}'");
      info.battery = safeExec("upower -i $(upower -e | grep BAT | head -1) | grep percentage | awk '{print $2}'", "N/A", 700);
      info.wifi = safeExec("nmcli -t -f active,ssid dev wifi | awk -F: '$1==\"yes\"{print $2; exit}'", "N/A", 700);
      info.netStat = safeExec("ip route get 8.8.8.8 | awk '{print $5; exit}'", "N/A", 500);
      info.bluetooth = safeExec("bluetoothctl show | awk '/Powered/ {print $2; exit}'", "N/A", 500);
      break;
    case "windows":
      info.cpu = safeExec("wmic cpu get loadpercentage /value", "N/A", 700).split("=").pop()?.trim() || "N/A";
      info.ram = safeExec("wmic OS get FreePhysicalMemory,TotalVisibleMemorySize /value", "N/A", 700);
      info.storage = safeExec("wmic logicaldisk get size,freespace,caption /value", "N/A", 700);
      info.battery = safeExec("WMIC Path Win32_Battery Get EstimatedChargeRemaining /Value", "N/A", 700).replace("EstimatedChargeRemaining=", "");
      info.wifi = safeExec("netsh wlan show interfaces | findstr SSID", "N/A", 700);
      info.netStat = safeExec("ipconfig | findstr IPv4", "N/A", 700);
      info.bluetooth = "Check Bluetooth settings";
      break;
    case "darwin":
      info.cpu = safeExec("ps -A -o %cpu | awk '{s+=$1} END {print s}'", "N/A", 700);
      info.ram = safeExec("vm_stat | grep 'Pages active' | awk '{print $3}'", "N/A", 700);
      info.storage = safeExec("df -h / | tail -1 | awk '{print $3 \"/\" $2}'", "N/A", 500);
      info.battery = safeExec("pmset -g batt | grep -o '[0-9]*%' | head -1", "N/A", 700);
      info.wifi = safeExec("/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport -I | awk '/ SSID/ {print substr($0, index($0, $2)); exit}'", "N/A", 700);
      info.netStat = safeExec("ifconfig | grep inet | grep -v inet6 | head -1 | awk '{print $2}'", "N/A", 500);
      info.bluetooth = safeExec("system_profiler SPBluetoothDataType -detailLevel mini | awk '/State:/ {print $2; exit}'", "N/A", 900);
      break;
  }

  return info;
};

// System info endpoint
app.get("/api/system-info", (req: Request, res: Response) => {
  try {
    const currentOS = getOS();
    const systemInfo = getSystemInfo(currentOS);
    res.json(systemInfo);
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: errorMessage });
  }
});

// Execute SARVIS commands
app.post("/api/sarvis", (req: Request, res: Response) => {
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
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      res.status(500).json({
        success: false,
        error: errorMessage,
        command,
      });
    }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    res.status(400).json({ error: errorMessage });
  }
});

// Linux command handler
function executeLinuxCommand(command: string, args: string): string {
  switch (command) {
    case "/terminal":
      spawn("gnome-terminal", { detached: true });
      return "Terminal opening...";
    case "/settings":
      spawn("gnome-control-center", { detached: true });
      return "Settings opening...";
    case "/files":
      spawn("nautilus", ["."], { detached: true });
      return "File manager opening...";
    case "/chrome":
      spawn("google-chrome", [args], { detached: true });
      return `Opening Chrome with ${args}...`;
    case "/firefox":
      spawn("firefox", [args], { detached: true });
      return `Opening Firefox with ${args}...`;
    case "/edge":
      spawn("microsoft-edge", [args], { detached: true });
      return `Opening Edge with ${args}...`;
    case "/open":
      spawn("xdg-open", [args], { detached: true });
      return `Opening ${args}...`;
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
        execSync("gnome-screensaver-command -l");
      } catch {
        execSync("loginctl lock-session");
      }
      return "Screen locked...";
    case "/logout":
      execSync("gnome-session-quit --logout --no-prompt", {
        stdio: "inherit",
      });
      return "Logging out...";
    case "/screenshot":
      try {
        execSync("gnome-screenshot");
      } catch {
        execSync("scrot screenshot.png");
      }
      return "Screenshot taken...";
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
      execSync(`pactl set-sink-volume @DEFAULT_SINK@ ${args}%`);
      return `Volume set to ${args}%`;
    case "/mute":
      execSync("pactl set-sink-mute @DEFAULT_SINK@ 1");
      return "Muted";
    case "/unmute":
      execSync("pactl set-sink-mute @DEFAULT_SINK@ 0");
      return "Unmuted";
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
function executeWindowsCommand(command: string, args: string): string {
  const commands: { [key: string]: string } = {
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
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return `Command executed: ${commands[command]} - ${errorMessage}`;
    }
  }

  return `Unknown command: ${command}`;
}

// macOS command handler
function executeMacCommand(command: string, args: string): string {
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

app.listen(PORT, () => {
  console.log(`SARVIS Backend Server running on http://localhost:${PORT}`);
});
