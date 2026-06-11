const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("sarvisDesktop", {
  isElectron: true,
  setAutostart: (enabled) => ipcRenderer.invoke("sarvis:set-autostart", !!enabled),
  getAutostart: () => ipcRenderer.invoke("sarvis:get-autostart"),
});
