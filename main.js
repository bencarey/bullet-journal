const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

let mdFilePath = null;

function configPath() {
  return path.join(app.getPath('userData'), 'config.json');
}
function loadConfig() {
  try { return JSON.parse(fs.readFileSync(configPath(), 'utf-8')); } catch { return {}; }
}
function saveConfig(obj) {
  fs.writeFileSync(configPath(), JSON.stringify(obj, null, 2), 'utf-8');
}

function buildMenu(win) {
  const template = [
    { role: 'appMenu' },
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Different Journal…',
          accelerator: 'CmdOrCtrl+O',
          click: () => pickFile(win)
        },
        { type: 'separator' },
        { role: 'close' }
      ]
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function pickFile(win) {
  const result = await dialog.showOpenDialog(win, {
    title: 'Open journal.md',
    buttonLabel: 'Open',
    filters: [{ name: 'Markdown', extensions: ['md'] }],
    properties: ['openFile']
  });
  if (!result.canceled && result.filePaths[0]) {
    mdFilePath = result.filePaths[0];
    saveConfig({ journalPath: mdFilePath });
    win.webContents.reload();
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const config = loadConfig();
  if (config.journalPath && fs.existsSync(config.journalPath)) {
    mdFilePath = config.journalPath;
  }

  buildMenu(win);
  win.loadFile(path.join(__dirname, 'journal.html'));
}

ipcMain.handle('read-journal', async (event) => {
  if (!mdFilePath) {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win, {
      title: 'Open your journal.md',
      buttonLabel: 'Open',
      filters: [{ name: 'Markdown', extensions: ['md'] }],
      properties: ['openFile']
    });
    if (!result.canceled && result.filePaths[0]) {
      mdFilePath = result.filePaths[0];
      saveConfig({ journalPath: mdFilePath });
    } else {
      throw new Error('No file selected');
    }
  }
  if (!fs.existsSync(mdFilePath)) return '';
  return fs.readFileSync(mdFilePath, 'utf-8');
});

ipcMain.handle('write-journal', (_, content) => {
  if (!mdFilePath) throw new Error('No journal file configured');
  fs.writeFileSync(mdFilePath, content, 'utf-8');
});

ipcMain.handle('get-journal-mtime', () => {
  try { return mdFilePath ? fs.statSync(mdFilePath).mtimeMs : 0; } catch { return 0; }
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
