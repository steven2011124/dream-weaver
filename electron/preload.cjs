const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("sarvisDesktop", {
  isElectron: true,
  setAutostart: (enabled) => ipcRenderer.invoke("sarvis:set-autostart", !!enabled),
  getAutostart: () => ipcRenderer.invoke("sarvis:get-autostart"),

  // OS control (each destructive call shows a native confirm dialog in main.cjs)
  runShell: (command, opts) => ipcRenderer.invoke("sarvis:run-shell", { command, opts: opts || {} }),
  launchApp: (appOrPath) => ipcRenderer.invoke("sarvis:launch-app", { target: appOrPath }),
  openPath: (target) => ipcRenderer.invoke("sarvis:open-path", { target }),
  fsRead: (path) => ipcRenderer.invoke("sarvis:fs-read", { path }),
  fsWrite: (path, content, opts) => ipcRenderer.invoke("sarvis:fs-write", { path, content, opts: opts || {} }),
  fsList: (path) => ipcRenderer.invoke("sarvis:fs-list", { path }),
  scaffoldApp: (spec) => ipcRenderer.invoke("sarvis:scaffold-app", spec),
  selfEdit: (relPath, content) => ipcRenderer.invoke("sarvis:self-edit", { relPath, content }),
});
