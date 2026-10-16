// Coffre — processus principal Electron
// Gère la fenêtre, le stockage local, la recherche de vinyles (MusicBrainz / Discogs),
// les pochettes et les mises à jour automatiques via GitHub Releases.

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const crypto = require('crypto');

let autoUpdater = null;
try { autoUpdater = require('electron-updater').autoUpdater; } catch (e) { autoUpdater = null; }

const USER_AGENT = `Coffre/${app.getVersion()} ( https://github.com/BlancheLaGoat/Coffre )`;

// ---------- Chemins ----------
const DATA_DIR = app.getPath('userData');            // %AppData%\Coffre
const DATA_FILE = path.join(DATA_DIR, 'coffre.json');
const PREV_FILE = path.join(DATA_DIR, 'coffre.precedent.json');
const COVERS_DIR = path.join(DATA_DIR, 'pochettes');

function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(COVERS_DIR, { recursive: true });
}

function defaultData() {
  return { version: 1, fm: {}, vinyls: {}, settings: { source: 'musicbrainz', discogsToken: '', discogsKey: '', discogsSecret: '', layout: 'gal' } };
}

function loadData() {
  ensureDirs();
  for (const f of [DATA_FILE, PREV_FILE]) {
    try {
      if (fs.existsSync(f)) {
        const d = JSON.parse(fs.readFileSync(f, 'utf8'));
        const base = defaultData();
        return { ...base, ...d, settings: { ...base.settings, ...(d.settings || {}) } };
      }
    } catch (e) { /* fichier abîmé : on essaie le précédent */ }
  }
  return defaultData();
}

function saveData(data) {
  ensureDirs();
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  if (fs.existsSync(DATA_FILE)) fs.copyFileSync(DATA_FILE, PREV_FILE);
  fs.renameSync(tmp, DATA_FILE);
  return true;
}

// ---------- Réseau ----------
async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...headers } });
  if (res.status === 401 || res.status === 403) throw new Error('Discogs a refusé tes identifiants. Vérifie ta clé et ton secret (ou ton token) dans les réglages.');
  if (res.status === 429 || res.status === 503) throw new Error('Le site limite les recherches. Attends quelques secondes et réessaie.');
  if (!res.ok) throw new Error(`Le serveur a répondu ${res.status}.`);
  return res.json();
}

// MusicBrainz : gratuit, sans clé. Pochettes via Cover Art Archive.
function mbArtist(credit) {
  return (credit || []).map(c => (c.name || c.artist?.name || '') + (c.joinphrase || '')).join('').trim();
}

async function searchMusicBrainz(q, page) {
  const t = q.replace(/[\\+\-!(){}\[\]^"~*?:/]|&&|\|\|/g, ' ').trim();
  if (!t) return { results: [], hasMore: false };
  const query = `(release:(${t}) OR artist:(${t}) OR label:(${t}) OR catno:(${t})) AND format:vinyl`;
  const limit = 30;
  const url = `https://musicbrainz.org/ws/2/release/?query=${encodeURIComponent(query)}&fmt=json&limit=${limit}&offset=${(page - 1) * limit}`;
  const d = await getJson(url);
  const results = (d.releases || []).map(r => {
    const li = (r['label-info'] || [])[0] || {};
    const formats = (r.media || []).map(m => m.format).filter(Boolean);
    const discs = (r.media || []).length;
    return {
      source: 'musicbrainz',
      id: r.id,
      artist: mbArtist(r['artist-credit']),
      title: r.title,
      year: (r.date || '').slice(0, 4),
      country: r.country || '',
      label: li.label?.name || '',
      catno: li['catalog-number'] || '',
      format: discs > 1 ? `${discs}× ${formats[0] || 'Vinyl'}` : (formats[0] || 'Vinyl'),
      thumb: `https://coverartarchive.org/release/${r.id}/front-250`,
      cover: `https://coverartarchive.org/release/${r.id}/front-500`
    };
  });
  return { results, hasMore: (d.count || 0) > page * limit };
}

function msToTime(ms) {
  if (!ms) return '';
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

async function detailsMusicBrainz(id) {
  const r = await getJson(`https://musicbrainz.org/ws/2/release/${id}?inc=recordings+labels+artist-credits+release-groups&fmt=json`);
  const tracklist = [];
  (r.media || []).forEach((m, i) => {
    (m.tracks || []).forEach(t => tracklist.push({ pos: (r.media.length > 1 ? `${i + 1}-` : '') + (t.number || ''), title: t.title, duration: msToTime(t.length) }));
  });
  const li = (r['label-info'] || [])[0] || {};
  return {
    tracklist,
    genres: [],
    label: li.label?.name || '',
    catno: li['catalog-number'] || '',
    country: r.country || '',
    year: (r.date || '').slice(0, 4),
    cover: `https://coverartarchive.org/release/${id}/front-500`,
    url: `https://musicbrainz.org/release/${id}`
  };
}

// Discogs : identifiants d'application (Consumer Key + Secret) ou token personnel.
// Les deux se créent gratuitement sur discogs.com/settings/developers.
function discogsAuth(auth = {}) {
  if (auth.token) return { Authorization: `Discogs token=${auth.token}` };
  if (auth.key && auth.secret) return { Authorization: `Discogs key=${auth.key}, secret=${auth.secret}` };
  return null;
}

async function searchDiscogs(q, page, auth) {
  const headers = discogsAuth(auth);
  if (!headers) throw new Error('Ajoute ta Consumer Key et ton Consumer Secret Discogs dans les réglages pour chercher sur Discogs.');
  const url = `https://api.discogs.com/database/search?q=${encodeURIComponent(q)}&type=release&format=Vinyl&per_page=30&page=${page}`;
  const d = await getJson(url, headers);
  const results = (d.results || []).map(r => {
    const [artist, ...rest] = (r.title || '').split(' - ');
    return {
      source: 'discogs',
      id: String(r.id),
      artist: rest.length ? artist : '',
      title: rest.length ? rest.join(' - ') : r.title,
      year: r.year ? String(r.year) : '',
      country: r.country || '',
      label: (r.label || [])[0] || '',
      catno: r.catno || '',
      format: (r.format || []).slice(0, 3).join(', '),
      thumb: r.thumb || r.cover_image || '',
      cover: r.cover_image || r.thumb || ''
    };
  });
  return { results, hasMore: (d.pagination?.pages || 1) > page };
}

async function detailsDiscogs(id, auth) {
  const d = await getJson(`https://api.discogs.com/releases/${id}`, discogsAuth(auth) || {});
  const primary = (d.images || []).find(i => i.type === 'primary') || (d.images || [])[0];
  const fmt = (d.formats || [])[0];
  return {
    tracklist: (d.tracklist || []).filter(t => t.type_ !== 'heading').map(t => ({ pos: t.position, title: t.title, duration: t.duration })),
    genres: [...(d.genres || []), ...(d.styles || [])],
    label: d.labels?.[0]?.name || '',
    catno: d.labels?.[0]?.catno || '',
    country: d.country || '',
    year: d.year ? String(d.year) : '',
    format: fmt ? [fmt.qty && fmt.qty !== '1' ? `${fmt.qty}×` : '', fmt.name, ...(fmt.descriptions || [])].filter(Boolean).join(' ') : '',
    cover: primary?.uri || '',
    url: d.uri || `https://www.discogs.com/release/${id}`
  };
}

// ---------- Pochettes ----------
function coverName(ext) {
  return `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
}

async function downloadCover(url) {
  if (!url) return '';
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) return '';
  const type = res.headers.get('content-type') || '';
  const ext = type.includes('png') ? '.png' : type.includes('webp') ? '.webp' : '.jpg';
  const buf = Buffer.from(await res.arrayBuffer());
  ensureDirs();
  const name = coverName(ext);
  fs.writeFileSync(path.join(COVERS_DIR, name), buf);
  return name;
}

function safeCoverPath(name) {
  const base = path.basename(String(name || ''));
  return base ? path.join(COVERS_DIR, base) : '';
}

// ---------- Fenêtre ----------
let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#14121b',
    title: 'Coffre',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Les liens externes (Discogs, Cardmarket…) s'ouvrent dans le navigateur.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file:')) { e.preventDefault(); if (/^https?:\/\//.test(url)) shell.openExternal(url); }
  });
}

function sendStatus(status, extra = {}) {
  if (win && !win.isDestroyed()) win.webContents.send('update:status', { status, ...extra });
}

function setupUpdater() {
  if (!autoUpdater || !app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => sendStatus('checking'));
  autoUpdater.on('update-available', i => sendStatus('available', { version: i.version }));
  autoUpdater.on('update-not-available', () => sendStatus('none'));
  autoUpdater.on('download-progress', p => sendStatus('downloading', { percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', i => sendStatus('ready', { version: i.version }));
  autoUpdater.on('error', err => sendStatus('error', { message: String(err?.message || err) }));
  autoUpdater.checkForUpdates().catch(() => {});
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 6 * 60 * 60 * 1000);
}

// ---------- IPC ----------
ipcMain.handle('app:info', () => ({
  version: app.getVersion(),
  packaged: app.isPackaged,
  coversUrl: pathToFileURL(COVERS_DIR + path.sep).href,
  dataDir: DATA_DIR
}));

ipcMain.handle('data:load', () => loadData());
ipcMain.handle('data:save', (_e, data) => saveData(data));

ipcMain.handle('vinyl:search', async (_e, { q, source, page = 1, auth }) => {
  return source === 'discogs' ? searchDiscogs(q, page, auth) : searchMusicBrainz(q, page);
});

ipcMain.handle('vinyl:details', async (_e, { source, id, auth }) => {
  return source === 'discogs' ? detailsDiscogs(id, auth) : detailsMusicBrainz(id);
});

ipcMain.handle('cover:download', async (_e, url) => {
  try { return await downloadCover(url); } catch (e) { return ''; }
});

ipcMain.handle('cover:pick', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Choisir une pochette',
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }]
  });
  if (r.canceled || !r.filePaths[0]) return '';
  const src = r.filePaths[0];
  ensureDirs();
  const name = coverName(path.extname(src).toLowerCase() || '.jpg');
  fs.copyFileSync(src, path.join(COVERS_DIR, name));
  return name;
});

ipcMain.handle('cover:delete', (_e, name) => {
  const p = safeCoverPath(name);
  try { if (p && fs.existsSync(p)) fs.unlinkSync(p); } catch (e) { /* ignoré */ }
  return true;
});

// Sauvegarde complète : données + pochettes, dans un seul fichier .coffre (JSON).
ipcMain.handle('backup:export', async (_e, data) => {
  const stamp = new Date().toISOString().slice(0, 10);
  const r = await dialog.showSaveDialog(win, {
    title: 'Exporter une sauvegarde',
    defaultPath: `Coffre-sauvegarde-${stamp}.coffre`,
    filters: [{ name: 'Sauvegarde Coffre', extensions: ['coffre'] }]
  });
  if (r.canceled || !r.filePath) return { ok: false };
  const covers = {};
  for (const v of Object.values(data.vinyls || {})) {
    const p = safeCoverPath(v.cover);
    if (p && fs.existsSync(p)) covers[path.basename(p)] = fs.readFileSync(p).toString('base64');
  }
  fs.writeFileSync(r.filePath, JSON.stringify({ format: 'coffre-backup', version: 1, data, covers }));
  return { ok: true, path: r.filePath };
});

ipcMain.handle('backup:import', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Importer une sauvegarde',
    properties: ['openFile'],
    filters: [{ name: 'Sauvegarde Coffre', extensions: ['coffre', 'json'] }]
  });
  if (r.canceled || !r.filePaths[0]) return { ok: false };
  const b = JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8'));
  const data = b.format === 'coffre-backup' ? b.data : b;
  if (!data || typeof data !== 'object' || (!data.fm && !data.vinyls)) throw new Error("Ce fichier n'est pas une sauvegarde Coffre.");
  ensureDirs();
  for (const [name, b64] of Object.entries(b.covers || {})) {
    fs.writeFileSync(path.join(COVERS_DIR, path.basename(name)), Buffer.from(b64, 'base64'));
  }
  const merged = { ...defaultData(), ...data, settings: { ...defaultData().settings, ...(data.settings || {}) } };
  saveData(merged);
  return { ok: true, data: merged };
});

ipcMain.handle('open:external', (_e, url) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); });
ipcMain.handle('open:dataDir', () => shell.openPath(DATA_DIR));

ipcMain.handle('update:check', async () => {
  if (!autoUpdater || !app.isPackaged) return { status: 'dev' };
  try { await autoUpdater.checkForUpdates(); return { status: 'checking' }; }
  catch (e) { return { status: 'error', message: String(e?.message || e) }; }
});
ipcMain.handle('update:install', () => { if (autoUpdater) autoUpdater.quitAndInstall(); });

// ---------- Démarrage ----------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(() => {
    ensureDirs();
    createWindow();
    setupUpdater();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
