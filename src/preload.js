// Pont sécurisé entre l'interface et le processus principal.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('coffre', {
  info: () => ipcRenderer.invoke('app:info'),
  load: () => ipcRenderer.invoke('data:load'),
  save: data => ipcRenderer.invoke('data:save', data),
  search: args => ipcRenderer.invoke('vinyl:search', args),
  details: args => ipcRenderer.invoke('vinyl:details', args),
  downloadCover: url => ipcRenderer.invoke('cover:download', url),
  pickCover: () => ipcRenderer.invoke('cover:pick'),
  deleteCover: name => ipcRenderer.invoke('cover:delete', name),
  exportBackup: data => ipcRenderer.invoke('backup:export', data),
  importBackup: () => ipcRenderer.invoke('backup:import'),
  openExternal: url => ipcRenderer.invoke('open:external', url),
  openDataDir: () => ipcRenderer.invoke('open:dataDir'),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdate: cb => ipcRenderer.on('update:status', (_e, s) => cb(s)),
  // Synchronisation avec l'appli Android
  syncInfo: () => ipcRenderer.invoke('sync:info'),
  syncReset: () => ipcRenderer.invoke('sync:reset'),
  onDataChanged: cb => ipcRenderer.on('data:changed', (_e, d) => cb(d)),
  onSyncStatus: cb => ipcRenderer.on('sync:status', (_e, s) => cb(s))
});
