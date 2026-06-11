// SARVIS Electron shell — runs the app as a native desktop window.
// Usage:
//   1. npm install (installs electron + @electron/packager from devDependencies)
//   2. npm run build
//   3. npm run electron        # dev: opens window pointing at dist/
//   4. npm run electron:pack   # builds installable bundle in electron-release/
//
// Autostart on boot:
//   - The window enables app.setLoginItemSettings({ openAtLogin: true }) when
//     the user toggles "Run on startup" in the in-app Settings dialog (the
//     setting is stored in localStorage and read by main on launch).

const { app, BrowserWindow, Menu } = require("electron");
const path = require("path");
const fs = require("fs");

const isDev = process.env.SARVIS_DEV === "1";

function readAutostartPref() {
  try {
    const f = path.join(app.getPath("userData"), "sarvis-autostart.json");
    if (!fs.existsSync(f)) return false;
    return !!JSON.parse(fs.readFileSync(f, "utf8")).enabled;
  } catch { return false; }
}

function writeAutostartPref(enabled) {
  try {
    const f = path.join(app.getPath("userData"), "sarvis-autostart.json");
    fs.writeFileSync(f, JSON.stringify({ enabled: !!enabled }));
  } catch {}
}

function applyAutostart() {
  const enabled = readAutostartPref();
  app.setLoginItemSettings({ openAtLogin: enabled, path: process.execPath });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0a1224",
    autoHideMenuBar: true,
    title: "SARVIS",
    icon: path.join(__dirname, "..", "public", "favicon.ico"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      // Expose only a tiny bridge for autostart toggle.
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  if (isDev) {
    win.loadURL("http://localhost:8080");
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  Menu.setApplicationMenu(null);
}

app.whenReady().then(() => {
  applyAutostart();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// IPC for in-app autostart toggle
const { ipcMain } = require("electron");
ipcMain.handle("sarvis:set-autostart", (_e, enabled) => {
  writeAutostartPref(enabled);
  app.setLoginItemSettings({ openAtLogin: !!enabled, path: process.execPath });
  return { ok: true };
});
ipcMain.handle("sarvis:get-autostart", () => readAutostartPref());
