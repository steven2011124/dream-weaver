// SARVIS Electron shell — runs the app as a native desktop window AND
// gives SARVIS controlled access to the host OS (shell, filesystem, app
// launching, self-editing the project source). Every destructive action
// pops a native confirm dialog before it runs.

const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { exec, spawn } = require("child_process");

const isDev = process.env.SARVIS_DEV === "1";

// ---------- autostart ----------
function autostartFile() { return path.join(app.getPath("userData"), "sarvis-autostart.json"); }
function readAutostartPref() {
  try {
    if (!fs.existsSync(autostartFile())) return false;
    return !!JSON.parse(fs.readFileSync(autostartFile(), "utf8")).enabled;
  } catch { return false; }
}
function writeAutostartPref(enabled) {
  try { fs.writeFileSync(autostartFile(), JSON.stringify({ enabled: !!enabled })); } catch {}
}
function applyAutostart() {
  app.setLoginItemSettings({ openAtLogin: readAutostartPref(), path: process.execPath });
}

// ---------- safety: confirmation dialog ----------
let mainWindow = null;
async function confirm(title, message, detail) {
  if (!mainWindow) return true;
  const r = await dialog.showMessageBox(mainWindow, {
    type: "warning",
    buttons: ["Allow", "Cancel"],
    defaultId: 1,
    cancelId: 1,
    title,
    message,
    detail: detail || "",
  });
  return r.response === 0;
}

// ---------- helpers ----------
function expandHome(p) {
  if (!p) return p;
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

function isDestructiveCommand(cmd) {
  return /\b(rm|del|rmdir|mkfs|dd|shutdown|reboot|halt|poweroff|kill|format|chmod\s+777|>\s*\/dev\/sd)\b/i.test(cmd);
}

// ---------- window ----------
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 820, minWidth: 900, minHeight: 600,
    backgroundColor: "#0a1224", autoHideMenuBar: true, title: "SARVIS",
    icon: path.join(__dirname, "..", "public", "favicon.ico"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });
  if (isDev) mainWindow.loadURL("http://localhost:8080");
  else mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  Menu.setApplicationMenu(null);
  mainWindow.on("closed", () => { mainWindow = null; });
}

app.whenReady().then(() => {
  applyAutostart();
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });

// ---------- IPC: autostart ----------
ipcMain.handle("sarvis:set-autostart", (_e, enabled) => {
  writeAutostartPref(enabled);
  app.setLoginItemSettings({ openAtLogin: !!enabled, path: process.execPath });
  return { ok: true };
});
ipcMain.handle("sarvis:get-autostart", () => readAutostartPref());

// ---------- IPC: run shell ----------
ipcMain.handle("sarvis:run-shell", async (_e, { command, opts }) => {
  if (!command || typeof command !== "string") return { ok: false, error: "no command" };
  const needConfirm = opts?.confirm !== false || isDestructiveCommand(command);
  if (needConfirm) {
    const ok = await confirm("SARVIS wants to run a shell command",
      "Allow this command to execute on your system?", command);
    if (!ok) return { ok: false, cancelled: true };
  }
  return new Promise((resolve) => {
    const cwd = opts?.cwd ? expandHome(opts.cwd) : os.homedir();
    exec(command, { cwd, timeout: 60_000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return resolve({ ok: false, error: err.message, stdout: String(stdout), stderr: String(stderr), code: err.code });
      resolve({ ok: true, stdout: String(stdout), stderr: String(stderr), code: 0 });
    });
  });
});

// ---------- IPC: launch app / open path / URL ----------
ipcMain.handle("sarvis:launch-app", async (_e, { target }) => {
  if (!target) return { ok: false, error: "no target" };
  // URLs go straight to the default browser, no confirm.
  if (/^https?:\/\//i.test(target)) { await shell.openExternal(target); return { ok: true }; }

  const platform = process.platform;
  let cmd;
  if (platform === "darwin") cmd = `open -a ${JSON.stringify(target)}`;
  else if (platform === "win32") cmd = `start "" "${target}"`;
  else cmd = target; // Linux: try as a direct executable

  const ok = await confirm("Launch application?", `SARVIS wants to launch: ${target}`, cmd);
  if (!ok) return { ok: false, cancelled: true };
  try {
    const child = spawn(cmd, { shell: true, detached: true, stdio: "ignore" });
    child.unref();
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle("sarvis:open-path", async (_e, { target }) => {
  if (!target) return { ok: false, error: "no target" };
  try {
    if (/^https?:\/\//i.test(target)) await shell.openExternal(target);
    else await shell.openPath(expandHome(target));
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
});

// ---------- IPC: filesystem ----------
ipcMain.handle("sarvis:fs-read", (_e, { path: p }) => {
  try { return { ok: true, content: fs.readFileSync(expandHome(p), "utf8") }; }
  catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle("sarvis:fs-write", async (_e, { path: p, content, opts }) => {
  const full = expandHome(p);
  if (opts?.confirm !== false) {
    const ok = await confirm("Write file?",
      `SARVIS wants to write to:\n${full}`, `${content.length} chars`);
    if (!ok) return { ok: false, cancelled: true };
  }
  try {
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, "utf8");
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle("sarvis:fs-list", (_e, { path: p }) => {
  try {
    const full = expandHome(p);
    const items = fs.readdirSync(full).map((name) => {
      const st = fs.statSync(path.join(full, name));
      return { name, isDir: st.isDirectory() };
    });
    return { ok: true, items };
  } catch (e) { return { ok: false, error: e.message }; }
});

// ---------- IPC: scaffold app ----------
ipcMain.handle("sarvis:scaffold-app", async (_e, spec) => {
  if (!spec?.name || !spec?.type) return { ok: false, error: "spec.name and spec.type required" };
  const safeName = spec.name.replace(/[^a-z0-9_-]/gi, "-");
  const target = path.join(os.homedir(), "SARVIS-Apps", safeName);
  const ok = await confirm("Create app?",
    `SARVIS wants to create a new ${spec.type} app:`, target);
  if (!ok) return { ok: false, cancelled: true };
  try {
    fs.mkdirSync(target, { recursive: true });
    const files = spec.files || defaultScaffold(spec.type, spec.name);
    for (const [rel, body] of Object.entries(files)) {
      const fp = path.join(target, rel);
      fs.mkdirSync(path.dirname(fp), { recursive: true });
      fs.writeFileSync(fp, body, "utf8");
    }
    await shell.openPath(target);
    return { ok: true, path: target };
  } catch (e) { return { ok: false, error: e.message }; }
});

function defaultScaffold(type, name) {
  if (type === "html") return {
    "index.html": `<!doctype html><html><head><meta charset="utf-8"><title>${name}</title>
<style>body{font-family:system-ui;padding:2rem;background:#0a1224;color:#e2e8f0}</style></head>
<body><h1>${name}</h1><p>Generated by SARVIS.</p></body></html>`,
  };
  if (type === "node") return {
    "package.json": JSON.stringify({ name, version: "0.1.0", main: "index.js" }, null, 2),
    "index.js": `console.log("Hello from ${name}, generated by SARVIS");\n`,
  };
  if (type === "python") return {
    "main.py": `# ${name} — generated by SARVIS\nprint("Hello from ${name}")\n`,
    "requirements.txt": "",
  };
  return { "README.md": `# ${name}\nGenerated by SARVIS.\n` };
}

// ---------- IPC: self-edit (write into SARVIS's own project source) ----------
ipcMain.handle("sarvis:self-edit", async (_e, { relPath, content }) => {
  if (!relPath || typeof relPath !== "string") return { ok: false, error: "no path" };
  if (relPath.includes("..") || path.isAbsolute(relPath))
    return { ok: false, error: "relative path within project only" };
  // Project root = parent of /electron
  const projectRoot = path.resolve(__dirname, "..");
  const full = path.join(projectRoot, relPath);
  if (!full.startsWith(projectRoot)) return { ok: false, error: "escapes project root" };

  const ok = await confirm("Self-modify code?",
    `SARVIS wants to overwrite its own source file:\n${relPath}`,
    `${content.length} chars — app will hot-reload`);
  if (!ok) return { ok: false, cancelled: true };
  try {
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, "utf8");
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
});
