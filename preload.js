const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  readJournal:     ()        => ipcRenderer.invoke('read-journal'),
  writeJournal:    (content) => ipcRenderer.invoke('write-journal', content),
  getJournalMtime: ()        => ipcRenderer.invoke('get-journal-mtime'),
  openExternal:    (url)     => ipcRenderer.invoke('open-external', url)
});
