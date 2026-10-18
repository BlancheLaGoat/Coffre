// Coffre — processus principal Electron
// Gère la fenêtre, le stockage local, la recherche de vinyles (Discogs),
// les pochettes, la synchronisation avec l'appli Android (Wi-Fi local)
// et les mises à jour automatiques via GitHub Releases.

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const { pathToFileURL } = require('url');
const crypto = require('crypto');
const Core = require('./shared/coffre-core');

let autoUpdater = null;
try { autoUpdater = require('electron-updater').autoUpdater; } catch (e) { autoUpdater = null; }
let QRCode = null;
try { QRCode = require('qrcode'); } catch (e) { QRCode = null; }

const USER_AGENT = `Coffre/${app.getVersion()} ( https://github.com/BlancheLaGoat/Coffre )`;

// ---------- Chemins ----------
const DATA_DIR = app.getPath('userData');            // %AppData%\Coffre
const DATA_FILE = path.join(DATA_DIR, 'coffre.json');
const PREV_FILE = path.join(DATA_DIR, 'coffre.precedent.json');
const COVERS_DIR = path.join(DATA_DIR, 'pochettes');
const SYNC_FILE = path.join(DATA_DIR, 'synchro.json');
const YGO_FILE = path.join(DATA_DIR, 'yugioh-cartes.json');     // base de cartes (YGOPRODeck), retéléchargeable
const YGO_IMG_DIR = path.join(DATA_DIR, 'yugioh-images');       // images des cartes, téléchargées à la demande
const OP_FILE = path.join(DATA_DIR, 'onepiece-cartes.json');     // base de cartes One Piece (optcgapi.com), retéléchargeable
const OP_IMG_DIR = path.join(DATA_DIR, 'onepiece-images');

function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(COVERS_DIR, { recursive: true });
}

function defaultData() {
  return { version: 1, fm: {}, vinyls: {}, ygo: {}, decks: {}, op: {}, opdecks: {}, settings: { source: 'discogs', discogsToken: '', discogsKey: '', discogsSecret: '', layout: 'gal' } };
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

function writeData(data) {
  ensureDirs();
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  if (fs.existsSync(DATA_FILE)) fs.copyFileSync(DATA_FILE, PREV_FILE);
  fs.renameSync(tmp, DATA_FILE);
}

// L'interface envoie sa version des données : on la fusionne avec le fichier
// (qui a pu recevoir des ajouts du téléphone entre-temps) au lieu de l'écraser.
function saveFromRenderer(data) {
  const cur = loadData();
  const merged = Core.mergeCollections(cur, data);
  const out = { ...cur, ...merged, settings: { ...cur.settings, ...(data.settings || {}) } };
  writeData(out);
  if (!Core.sameCollections(merged, data)) notifyDataChanged(merged);
  return true;
}

function notifyDataChanged(collections) {
  if (win && !win.isDestroyed()) win.webContents.send('data:changed', collections);
}

// ---------- Réseau ----------
async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...headers } });
  if (res.status === 401 || res.status === 403) throw new Error('Discogs a refusé tes identifiants. Vérifie ta clé et ton secret (ou ton token) dans les réglages.');
  if (res.status === 429 || res.status === 503) throw new Error('Le site limite les recherches. Attends quelques secondes et réessaie.');
  if (!res.ok) throw new Error(`Le serveur a répondu ${res.status}.`);
  return res.json();
}
const vinylApi = Core.createVinylApi(getJson);

// ---------- Pochettes ----------
const COVER_RE = /^[\w.-]+\.(jpg|jpeg|png|webp)$/i;

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
  return base && COVER_RE.test(base) ? path.join(COVERS_DIR, base) : '';
}

function listCovers() {
  ensureDirs();
  return fs.readdirSync(COVERS_DIR).filter(f => COVER_RE.test(f));
}

// ============================================================
//  SYNCHRONISATION AVEC LE TÉLÉPHONE (Wi-Fi local)
// ============================================================
const SYNC_PORT = 47800;
let syncServer = null;
let syncError = '';

function loadSync() {
  try { if (fs.existsSync(SYNC_FILE)) return JSON.parse(fs.readFileSync(SYNC_FILE, 'utf8')); } catch (e) { /* recréé plus bas */ }
  const s = { token: crypto.randomBytes(18).toString('hex'), lastSync: null };
  fs.writeFileSync(SYNC_FILE, JSON.stringify(s, null, 2));
  return s;
}
function saveSync(s) { fs.writeFileSync(SYNC_FILE, JSON.stringify(s, null, 2)); }

function localIps() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) {
      if (i.family === 'IPv4' && !i.internal && !i.address.startsWith('169.254.')) out.push(i.address);
    }
  }
  const score = ip => ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 2 : 3;
  return out.sort((a, b) => score(a) - score(b));
}

function tokenOk(req) {
  const given = Buffer.from(String(req.headers['x-coffre-token'] || ''));
  const want = Buffer.from(loadSync().token);
  return given.length === want.length && crypto.timingSafeEqual(given, want);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', c => { size += c.length; if (size > limit) { reject(new Error('trop gros')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

async function handleSync(req, res) {
  const url = new URL(req.url, 'http://x');
  if (!tokenOk(req)) return sendJson(res, 401, { error: 'Code d’appairage invalide. Associe à nouveau le téléphone.' });
  try {
    if (url.pathname === '/api/ping' && req.method === 'GET') {
      return sendJson(res, 200, { ok: true, app: 'coffre', name: os.hostname(), version: app.getVersion() });
    }
    if (url.pathname === '/api/sync' && req.method === 'POST') {
      const inc = JSON.parse((await readBody(req, 20 * 1024 * 1024)).toString('utf8'));
      const cur = loadData();
      const merged = Core.mergeCollections(cur, Core.pickCollections(inc));
      if (!Core.sameCollections(merged, cur)) {
        writeData({ ...cur, ...merged });
        notifyDataChanged(merged);
      }
      const s = loadSync(); s.lastSync = { device: String(inc.device || 'Téléphone').slice(0, 60), at: Date.now() }; saveSync(s);
      if (win && !win.isDestroyed()) win.webContents.send('sync:status', s.lastSync);
      return sendJson(res, 200, { ...merged, covers: listCovers(), name: os.hostname() });
    }
    if (url.pathname === '/api/opdb' && req.method === 'GET') {
      const txt = opRead();
      if (!txt) return sendJson(res, 404, { error: 'base de cartes One Piece absente sur le PC' });
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(txt);
    }
    if (url.pathname === '/api/ygodb' && req.method === 'GET') {
      const txt = ygoRead();
      if (!txt) return sendJson(res, 404, { error: 'base de cartes absente sur le PC' });
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(txt);
    }
    if (url.pathname === '/api/cover') {
      const p = safeCoverPath(url.searchParams.get('name'));
      if (!p) return sendJson(res, 400, { error: 'nom de fichier invalide' });
      // b64=1 / corps JSON : l'appli Android échange les images en base64 dans du JSON.
      const asJson = url.searchParams.get('b64') === '1' || /json/i.test(req.headers['content-type'] || '');
      if (req.method === 'GET') {
        if (!fs.existsSync(p)) return sendJson(res, 404, { error: 'absente' });
        if (asJson) return sendJson(res, 200, { data: fs.readFileSync(p).toString('base64') });
        res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
        return fs.createReadStream(p).pipe(res);
      }
      if (req.method === 'PUT') {
        let buf = await readBody(req, 20 * 1024 * 1024);
        if (asJson) buf = Buffer.from(String(JSON.parse(buf.toString('utf8')).data || ''), 'base64');
        if (!buf.length) return sendJson(res, 400, { error: 'image vide' });
        return sendJson(res, 200, { ok: true });   // pochettes plus enregistrées (affichées depuis Discogs)
      }
    }
    sendJson(res, 404, { error: 'inconnu' });
  } catch (e) {
    sendJson(res, 500, { error: String(e.message || e) });
  }
}

function startSyncServer() {
  loadSync();
  syncServer = http.createServer((req, res) => { handleSync(req, res); });
  syncServer.on('error', e => { syncError = e.code === 'EADDRINUSE' ? `Le port ${SYNC_PORT} est déjà utilisé par un autre programme.` : String(e.message || e); });
  syncServer.listen(SYNC_PORT, '0.0.0.0', () => { syncError = ''; });
}

async function syncInfo() {
  const s = loadSync();
  const ips = localIps();
  const payload = JSON.stringify({ t: 'coffre', v: 1, k: s.token, p: SYNC_PORT, h: ips });
  let qr = '';
  if (QRCode) { try { qr = await QRCode.toDataURL(payload, { margin: 1, width: 320, errorCorrectionLevel: 'M' }); } catch (e) { qr = ''; } }
  return { ips, port: SYNC_PORT, code: s.token.slice(0, 8).toUpperCase(), token: s.token, qr, lastSync: s.lastSync, running: !!(syncServer && syncServer.listening), error: syncError };
}

// ---------- Cache des images de cartes (plafonné) ----------
// Les images Yu-Gi-Oh et One Piece sont gardées dans un petit cache : 200 Mo au total sur le PC.
// Au-delà, les images vues le moins récemment (tous jeux confondus) sont effacées.
// (YGOPRODeck interdit de recharger ses images sans arrêt, d'où ce cache.)
const IMG_CACHE_MAX = 200 * 1024 * 1024;
let trimTimer = null;
function touchFile(file) { try { const t = new Date(); fs.utimesSync(file, t, t); } catch (e) { /* ignoré */ } }
function trimCache(max = IMG_CACHE_MAX) {
  try {
    const files = [];
    for (const dir of [YGO_IMG_DIR, OP_IMG_DIR]) {
      if (!fs.existsSync(dir)) continue;
      for (const n of fs.readdirSync(dir)) { const p = path.join(dir, n); const st = fs.statSync(p); files.push({ p, size: st.size, t: st.mtimeMs }); }
    }
    let total = files.reduce((a, f) => a + f.size, 0);
    if (total <= max) return;
    files.sort((a, b) => a.t - b.t);
    for (const f of files) { if (total <= max * 0.9) break; try { fs.unlinkSync(f.p); total -= f.size; } catch (e) { /* ignoré */ } }
  } catch (e) { /* ignoré */ }
}
function trimSoon() {
  clearTimeout(trimTimer);
  trimTimer = setTimeout(() => trimCache(), 2000);
}
function dirSize(dir) {
  try { return fs.readdirSync(dir).reduce((a, n) => a + fs.statSync(path.join(dir, n)).size, 0); } catch (e) { return 0; }
}
function clearDir(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* ignoré */ } }

// ---------- Base de cartes Yu-Gi-Oh ----------
// Téléchargée depuis YGOPRODeck (gratuit), compactée puis gardée dans %AppData%\Coffre.
let ygoBusy = null;
function ygoRead() {
  try { return fs.existsSync(YGO_FILE) ? fs.readFileSync(YGO_FILE, 'utf8') : ''; } catch (e) { return ''; }
}
function ygoDownload() {
  if (ygoBusy) return ygoBusy;
  ygoBusy = (async () => {
    const [en, fr, sets] = await Promise.all([
      getJson(Core.YGO_URLS.en),
      getJson(Core.YGO_URLS.fr).catch(() => null),
      getJson(Core.YGO_URLS.sets).catch(() => [])
    ]);
    const db = Core.ygoCompact(en, fr, sets);
    if (!db.cards.length) throw new Error('La base de cartes reçue est vide.');
    ensureDirs();
    fs.writeFileSync(YGO_FILE + '.tmp', JSON.stringify(db));
    fs.renameSync(YGO_FILE + '.tmp', YGO_FILE);
    return db;
  })().finally(() => { ygoBusy = null; });
  return ygoBusy;
}

// Image d'une carte : téléchargée une fois, puis lue depuis le disque
const ygoImgJobs = new Map();
function ygoImage(id, big) {
  id = parseInt(id, 10);
  if (!id) return Promise.resolve('');
  const file = path.join(YGO_IMG_DIR, `${id}${big ? '-grand' : ''}.jpg`);
  if (fs.existsSync(file)) { touchFile(file); return Promise.resolve(pathToFileURL(file).href); }
  if (ygoImgJobs.has(file)) return ygoImgJobs.get(file);
  const job = (async () => {
    const res = await fetch(Core.ygoImgUrl(id, big), { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) return '';
    fs.mkdirSync(YGO_IMG_DIR, { recursive: true });
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    trimSoon();
    return pathToFileURL(file).href;
  })().catch(() => '').finally(() => ygoImgJobs.delete(file));
  ygoImgJobs.set(file, job);
  return job;
}

// ---------- Base de cartes One Piece ----------
// Téléchargée depuis optcgapi.com (gratuit, sans clé), compactée puis gardée dans %AppData%\Coffre.
let opBusy = null;
function opRead() {
  try { return fs.existsSync(OP_FILE) ? fs.readFileSync(OP_FILE, 'utf8') : ''; } catch (e) { return ''; }
}
function opDownload() {
  if (opBusy) return opBusy;
  opBusy = (async () => {
    const U = Core.OP_URLS;
    const [sets, decks, setCards, stCards, promos] = await Promise.all([
      getJson(U.sets).catch(() => []), getJson(U.decks).catch(() => []),
      getJson(U.setCards), getJson(U.stCards).catch(() => []), getJson(U.promoCards).catch(() => [])
    ]);
    const db = Core.opCompact(sets, decks, setCards, stCards, promos);
    if (!db.cards.length) throw new Error('La base de cartes reçue est vide.');
    ensureDirs();
    fs.writeFileSync(OP_FILE + '.tmp', JSON.stringify(db));
    fs.renameSync(OP_FILE + '.tmp', OP_FILE);
    return db;
  })().finally(() => { opBusy = null; });
  return opBusy;
}
const opImgJobs = new Map();
function opImage(id) {
  id = String(id || '');
  if (!/^[A-Za-z0-9_-]{3,40}$/.test(id)) return Promise.resolve('');
  const file = path.join(OP_IMG_DIR, `${id}.jpg`);
  if (fs.existsSync(file)) { touchFile(file); return Promise.resolve(pathToFileURL(file).href); }
  if (opImgJobs.has(file)) return opImgJobs.get(file);
  const job = (async () => {
    const res = await fetch(Core.opImgUrl(id), { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) return '';
    fs.mkdirSync(OP_IMG_DIR, { recursive: true });
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    trimSoon();
    return pathToFileURL(file).href;
  })().catch(() => '').finally(() => opImgJobs.delete(file));
  opImgJobs.set(file, job);
  return job;
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
  platform: 'desktop',
  coversUrl: pathToFileURL(COVERS_DIR + path.sep).href,
  dataDir: DATA_DIR
}));

ipcMain.handle('data:load', () => loadData());
ipcMain.handle('data:save', (_e, data) => saveFromRenderer(data));

ipcMain.handle('vinyl:search', (_e, args) => vinylApi.search(args));
ipcMain.handle('vinyl:details', (_e, args) => vinylApi.details(args));

// Les pochettes ne sont plus enregistrées : elles s'affichent depuis Discogs (adresse gardée dans le vinyle).
ipcMain.handle('cover:download', async () => '');

ipcMain.handle('cover:pick', async () => '');

// Efface les anciennes pochettes enregistrées, sauf celles encore utilisées (en attente de leur adresse Discogs)
ipcMain.handle('cover:purge', (_e, keep) => {
  const k = new Set(Array.isArray(keep) ? keep : []);
  for (const n of listCovers()) if (!k.has(n)) { try { fs.unlinkSync(path.join(COVERS_DIR, n)); } catch (e) { /* ignoré */ } }
  return true;
});
ipcMain.handle('imgcache:info', () => ({ bytes: dirSize(YGO_IMG_DIR) + dirSize(OP_IMG_DIR) + dirSize(COVERS_DIR), max: IMG_CACHE_MAX }));
ipcMain.handle('imgcache:clear', () => { clearDir(YGO_IMG_DIR); clearDir(OP_IMG_DIR); return true; });
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
  const covers = {};   // les pochettes ne sont plus dans la sauvegarde (affichées depuis Discogs)
  const clean = { ...data, settings: { ...data.settings, discogsSecret: '', discogsToken: '' } };
  fs.writeFileSync(r.filePath, JSON.stringify({ format: 'coffre-backup', version: 1, data: clean, covers }));
  return { ok: true, path: r.filePath };
});

// Fichiers texte simples (decks .ydk) : enregistrer / ouvrir
ipcMain.handle('file:saveText', async (_e, name, text, ext) => {
  const r = await dialog.showSaveDialog(win, { title: 'Exporter', defaultPath: String(name || 'deck').replace(/[\\/:*?"<>|]+/g, '_'), filters: [{ name: ext ? ext.toUpperCase() : 'Texte', extensions: [ext || 'txt'] }] });
  if (r.canceled || !r.filePath) return { ok: false };
  fs.writeFileSync(r.filePath, String(text), 'utf8');
  return { ok: true, path: r.filePath };
});
ipcMain.handle('file:openText', async (_e, ext) => {
  const r = await dialog.showOpenDialog(win, { title: 'Importer', properties: ['openFile'], filters: [{ name: ext ? ext.toUpperCase() : 'Texte', extensions: [ext || 'txt'] }, { name: 'Tous les fichiers', extensions: ['*'] }] });
  if (r.canceled || !r.filePaths[0]) return { ok: false };
  const st = fs.statSync(r.filePaths[0]);
  if (st.size > 1024 * 1024) throw new Error('Fichier trop gros.');
  return { ok: true, name: path.basename(r.filePaths[0]), text: fs.readFileSync(r.filePaths[0], 'utf8') };
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
  if (!data || typeof data !== 'object' || (!data.fm && !data.vinyls && !data.ygo && !data.decks && !data.op)) throw new Error("Ce fichier n'est pas une sauvegarde Coffre.");
  ensureDirs();
  // Une restauration remet les entrées de la sauvegarde au premier plan.
  const now = Date.now();
  const restamp = m => Object.fromEntries(Object.entries(m || {}).map(([k, v]) => [k, { ...v, mt: now }]));
  const cur = loadData();
  const merged = Core.mergeCollections(cur, { fm: restamp(data.fm), vinyls: restamp(data.vinyls), ygo: restamp(data.ygo), decks: restamp(data.decks), op: restamp(data.op), opdecks: restamp(data.opdecks) });
  const out = { ...cur, ...merged };
  writeData(out);
  return { ok: true, data: out };
});

ipcMain.handle('ygo:db', () => { const t = ygoRead(); return t ? JSON.parse(t) : null; });
ipcMain.handle('ygo:refresh', () => ygoDownload());
ipcMain.handle('ygo:img', (_e, id, big) => ygoImage(id, big));
ipcMain.handle('op:db', () => { const t = opRead(); return t ? JSON.parse(t) : null; });
ipcMain.handle('op:refresh', () => opDownload());
ipcMain.handle('op:img', (_e, id) => opImage(id));

ipcMain.handle('open:external', (_e, url) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); });
ipcMain.handle('open:dataDir', () => shell.openPath(DATA_DIR));

ipcMain.handle('sync:info', () => syncInfo());
ipcMain.handle('sync:reset', () => {
  const s = loadSync(); s.token = crypto.randomBytes(18).toString('hex'); s.lastSync = null; saveSync(s);
  return syncInfo();
});

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
    // Caches d'images ramenés sous la limite (anciens caches plus gros)
    setTimeout(() => trimCache(), 5000);
    ensureDirs();
    createWindow();
    startSyncServer();
    setupUpdater();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
