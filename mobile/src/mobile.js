// Coffre Android — remplace le pont Electron (window.coffre) par les modules Capacitor
// et ajoute la synchronisation avec le PC. Chargé avant app.js.
(function () {
  'use strict';
  const Cap = window.Capacitor || {};
  const P = Cap.Plugins || {};
  const FS = P.Filesystem;
  const DATA = 'DATA';
  const REPO = 'BlancheLaGoat/Coffre';
  const UA = `Coffre/${window.COFFRE_VERSION || '1'} ( https://github.com/${REPO} )`;
  const COVER_RE = /^[\w.-]+\.(jpg|jpeg|png|webp)$/i;
  const Core = window.CoffreCore;

  window.CARD_IMG_BASE = 'cards/';

  // ---------- Fichiers ----------
  async function readText(path) {
    try { return (await FS.readFile({ path, directory: DATA, encoding: 'utf8' })).data; } catch (e) { return null; }
  }
  async function writeText(path, text) {
    await FS.writeFile({ path, directory: DATA, encoding: 'utf8', data: text, recursive: true });
  }
  async function readJson(path, fallback) {
    const t = await readText(path);
    if (t == null) return fallback;
    try { return JSON.parse(t); } catch (e) { return fallback; }
  }
  async function writeB64(path, b64) {
    await FS.writeFile({ path, directory: DATA, data: b64, recursive: true });
  }
  async function readB64(path) {
    return (await FS.readFile({ path, directory: DATA })).data;
  }
  async function listCovers() {
    try {
      const r = await FS.readdir({ path: 'pochettes', directory: DATA });
      return (r.files || []).map(f => typeof f === 'string' ? f : f.name).filter(n => COVER_RE.test(n));
    } catch (e) { return []; }
  }
  const newCoverName = ext => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + '.' + (ext || 'jpg');

  // ---------- Réseau (en natif : pas de blocage CORS, User-Agent autorisé) ----------
  async function http(opts) {
    const o = { method: 'GET', headers: {}, connectTimeout: 15000, readTimeout: 30000, ...opts };
    if (P.CapacitorHttp && Cap.isNativePlatform && Cap.isNativePlatform()) {
      return P.CapacitorHttp.request(o);
    }
    // Hors téléphone (tests dans un navigateur)
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), o.readTimeout);
    try {
      const res = await fetch(o.url, { method: o.method, headers: o.headers, body: o.data == null ? undefined : (typeof o.data === 'string' ? o.data : JSON.stringify(o.data)), signal: ctl.signal });
      const ct = res.headers.get('content-type') || '';
      let data;
      if (o.responseType === 'blob') { const buf = new Uint8Array(await res.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 32768) s += String.fromCharCode.apply(null, buf.subarray(i, i + 32768)); data = btoa(s); }
      else if (ct.includes('json')) data = await res.json();
      else data = await res.text();
      return { status: res.status, data, headers: { 'content-type': ct } };
    } finally { clearTimeout(t); }
  }
  const asJson = d => typeof d === 'string' ? JSON.parse(d) : d;

  async function getJson(url, headers) {
    const res = await http({ url, headers: { 'User-Agent': UA, Accept: 'application/json', ...(headers || {}) } });
    if (res.status === 401 || res.status === 403) throw new Error('Discogs a refusé tes identifiants. Vérifie ta clé et ton secret (ou ton token) dans les réglages.');
    if (res.status === 429 || res.status === 503) throw new Error('Le site limite les recherches. Attends quelques secondes et réessaie.');
    if (res.status < 200 || res.status >= 300) throw new Error(`Le serveur a répondu ${res.status}.`);
    return asJson(res.data);
  }
  const vinylApi = Core.createVinylApi(getJson);

  // ---------- Fichier choisi par l'utilisateur ----------
  function pickFile(accept) {
    return new Promise(resolve => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = accept; inp.style.display = 'none';
      inp.addEventListener('change', () => { resolve(inp.files[0] || null); inp.remove(); });
      document.body.appendChild(inp); inp.click();
      // Si l'utilisateur annule, aucun événement : la promesse reste en attente, sans conséquence.
    });
  }
  function fileToImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file); const img = new Image();
      img.onload = () => { resolve(img); setTimeout(() => URL.revokeObjectURL(url), 1000); };
      img.onerror = reject; img.src = url;
    });
  }
  function imageToJpegB64(img, max) {
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.88).split(',')[1];
  }

  // ---------- Données ----------
  const defaultData = () => ({ version: 1, fm: {}, vinyls: {}, ygo: {}, decks: {}, op: {}, opdecks: {}, settings: { source: 'discogs', discogsToken: '', layout: 'gal' } });
  let coversUrl = '';
  let lastSyncedJson = '';

  // ---------- Mises à jour (APK publiée sur GitHub) ----------
  let updateCb = () => {};
  let apkUrl = '';
  const newer = (a, b) => {
    const pa = String(a).replace(/^v/, '').split('.').map(Number), pb = String(b).replace(/^v/, '').split('.').map(Number);
    for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0); }
    return false;
  };
  async function checkUpdate() {
    try {
      const res = await http({ url: `https://api.github.com/repos/${REPO}/releases/latest`, headers: { 'User-Agent': UA, Accept: 'application/vnd.github+json' } });
      if (res.status === 404) return { status: 'none' };
      if (res.status < 200 || res.status >= 300) throw new Error(`GitHub a répondu ${res.status}.`);
      const r = asJson(res.data);
      const apk = (r.assets || []).find(a => /\.apk$/i.test(a.name));
      if (apk && newer(r.tag_name, window.COFFRE_VERSION)) {
        apkUrl = apk.browser_download_url;
        const s = { status: 'ready', version: String(r.tag_name).replace(/^v/, '') };
        updateCb(s); return s;
      }
      return { status: 'none' };
    } catch (e) {
      return { status: 'error', message: e.message || String(e) };
    }
  }

  window.coffre = {
    async info() {
      try {
        const u = await FS.getUri({ path: 'pochettes', directory: DATA });
        coversUrl = Cap.convertFileSrc(u.uri) + '/';
      } catch (e) { coversUrl = ''; }
      return { version: window.COFFRE_VERSION || '', coversUrl, platform: 'mobile' };
    },
    async load() {
      try { await FS.mkdir({ path: 'pochettes', directory: DATA, recursive: true }); } catch (e) { /* existe déjà */ }
      const d = await readJson('coffre.json', null) || await readJson('coffre.precedent.json', null) || defaultData();
      d.fm = d.fm || {}; d.vinyls = d.vinyls || {}; d.ygo = d.ygo || {}; d.decks = d.decks || {}; d.op = d.op || {}; d.opdecks = d.opdecks || {}; d.settings = { ...defaultData().settings, ...(d.settings || {}) };
      return d;
    },
    async save(d) {
      const text = JSON.stringify(d);
      const prev = await readText('coffre.json');
      if (prev) await writeText('coffre.precedent.json', prev);
      await writeText('coffre.json', text);
      if (JSON.stringify(Core.pickCollections(d)) !== lastSyncedJson) Sync.soon();
      return true;
    },
    search: args => vinylApi.search(args),
    details: args => vinylApi.details(args),
    async downloadCover(url) {
      if (!url) return '';
      try {
        const res = await http({ url, responseType: 'blob', headers: { 'User-Agent': UA } });
        if (res.status < 200 || res.status >= 300 || !res.data) return '';
        const ct = (res.headers && (res.headers['content-type'] || res.headers['Content-Type'])) || '';
        const ext = /png/.test(ct) ? 'png' : /webp/.test(ct) ? 'webp' : 'jpg';
        const name = newCoverName(ext);
        await writeB64('pochettes/' + name, res.data);
        return name;
      } catch (e) { return ''; }
    },
    async pickCover() {
      const f = await pickFile('image/*'); if (!f) return '';
      try {
        const b64 = imageToJpegB64(await fileToImage(f), 800);
        const name = newCoverName('jpg');
        await writeB64('pochettes/' + name, b64);
        return name;
      } catch (e) { return ''; }
    },
    async deleteCover(name) {
      if (!COVER_RE.test(name || '')) return false;
      try { await FS.deleteFile({ path: 'pochettes/' + name, directory: DATA }); } catch (e) { /* déjà absente */ }
      return true;
    },
    async exportBackup(d) {
      const covers = {};
      for (const v of Object.values(d.vinyls || {})) {
        if (v && !v.deleted && v.cover && COVER_RE.test(v.cover)) { try { covers[v.cover] = await readB64('pochettes/' + v.cover); } catch (e) { /* manquante */ } }
      }
      const clean = { ...d, settings: { ...d.settings, discogsSecret: '', discogsToken: '' } };
      const name = `Coffre-${new Date().toISOString().slice(0, 10)}.coffre`;
      await FS.writeFile({ path: name, directory: 'DOCUMENTS', encoding: 'utf8', data: JSON.stringify({ format: 'coffre-backup', version: 1, data: clean, covers }), recursive: true });
      return { ok: true, path: 'Documents/' + name };
    },
    async importBackup() {
      const f = await pickFile('.coffre,.json,application/json,application/octet-stream,*/*'); if (!f) return { ok: false };
      const b = JSON.parse(await f.text());
      const data = b.format === 'coffre-backup' ? b.data : b;
      if (!data || typeof data !== 'object' || (!data.fm && !data.vinyls && !data.ygo && !data.decks && !data.op)) throw new Error("Ce fichier n'est pas une sauvegarde Coffre.");
      for (const [name, b64] of Object.entries(b.covers || {})) if (COVER_RE.test(name)) await writeB64('pochettes/' + name, b64);
      const now = Date.now();
      const restamp = m => Object.fromEntries(Object.entries(m || {}).map(([k, v]) => [k, { ...v, mt: now }]));
      const cur = window.CoffreApp.data;
      const merged = Core.mergeCollections(cur, { fm: restamp(data.fm), vinyls: restamp(data.vinyls), ygo: restamp(data.ygo), decks: restamp(data.decks), op: restamp(data.op), opdecks: restamp(data.opdecks) });
      const out = { ...cur, ...merged };
      await window.coffre.save(out);
      return { ok: true, data: out };
    },
    openExternal(url) {
      if (!/^https?:\/\//.test(url)) return;
      if (P.Browser) return P.Browser.open({ url });
      window.open(url, '_blank');
    },
    openDataDir() {},
    // ---------- Yu-Gi-Oh : base de cartes et images ----------
    async ygoDb() { return readJson('yugioh-cartes.json', null); },
    async ygoRefresh() {
      let db = null;
      // 1. depuis le PC associé (rapide, déjà compactée)
      if (Sync.pair) {
        try { db = await Sync.reach(h => Sync.call(h, '/api/ygodb', { method: 'GET', readTimeout: 120000 })); } catch (e) { db = null; }
        if (db && !(db.cards && db.cards.length)) db = null;
      }
      // 2. sinon directement depuis YGOPRODeck
      if (!db) {
        const get = async url => {
          const res = await http({ url, headers: { 'User-Agent': UA, Accept: 'application/json' }, readTimeout: 180000 });
          if (res.status < 200 || res.status >= 300) throw new Error(`YGOPRODeck a répondu ${res.status}.`);
          return asJson(res.data);
        };
        const en = await get(Core.YGO_URLS.en);
        const fr = await get(Core.YGO_URLS.fr).catch(() => null);
        const sets = await get(Core.YGO_URLS.sets).catch(() => []);
        db = Core.ygoCompact(en, fr, sets);
      }
      await writeText('yugioh-cartes.json', JSON.stringify(db));
      return db;
    },
    ygoImg(id, big) { return ygoImage(id, big); },
    // ---------- One Piece : base de cartes et images ----------
    async opDb() { return readJson('onepiece-cartes.json', null); },
    async opRefresh() {
      let db = null;
      if (Sync.pair) {
        try { db = await Sync.reach(h => Sync.call(h, '/api/opdb', { method: 'GET', readTimeout: 120000 })); } catch (e) { db = null; }
        if (db && !(db.cards && db.cards.length)) db = null;
      }
      if (!db) {
        const get = async url => {
          const res = await http({ url, headers: { 'User-Agent': UA, Accept: 'application/json' }, readTimeout: 180000 });
          if (res.status < 200 || res.status >= 300) throw new Error(`optcgapi.com a répondu ${res.status}.`);
          return asJson(res.data);
        };
        const U = Core.OP_URLS;
        const sets = await get(U.sets).catch(() => []), decks = await get(U.decks).catch(() => []);
        const setCards = await get(U.setCards);
        const stCards = await get(U.stCards).catch(() => []), promos = await get(U.promoCards).catch(() => []);
        db = Core.opCompact(sets, decks, setCards, stCards, promos);
        if (!db.cards.length) throw new Error('La base de cartes reçue est vide.');
      }
      await writeText('onepiece-cartes.json', JSON.stringify(db));
      return db;
    },
    opImg(id) { return cardImage('onepiece-images', String(id || ''), Core.opImgUrl(id)); },
    checkUpdate,
    // L'APK s'ouvre dans le navigateur du téléphone (Chrome…), qui la télécharge vraiment.
    // (L'onglet intégré se refermait avant la fin du téléchargement.)
    async installUpdate() {
      if (!apkUrl) return;
      try { if (P.AppLauncher) { await P.AppLauncher.openUrl({ url: apkUrl }); return; } } catch (e) { /* repli ci-dessous */ }
      window.location.href = apkUrl;
    },
    onUpdate(cb) { updateCb = cb; }
  };

  // Images des cartes Yu-Gi-Oh : téléchargées une fois puis gardées sur le téléphone
  let ygoImgBase = null, ygoImgHave = null;
  const ygoImgJobs = new Map(); let ygoImgRunning = 0; const ygoImgQueue = [];
  async function ygoImgInit() {
    if (ygoImgHave) return;
    try { await FS.mkdir({ path: 'yugioh-images', directory: DATA, recursive: true }); } catch (e) { /* existe déjà */ }
    const u = await FS.getUri({ path: 'yugioh-images', directory: DATA });
    ygoImgBase = Cap.convertFileSrc(u.uri) + '/';
    ygoImgHave = new Set();
    try { const r = await FS.readdir({ path: 'yugioh-images', directory: DATA }); (r.files || []).forEach(f => ygoImgHave.add(typeof f === 'string' ? f : f.name)); } catch (e) { /* vide */ }
  }
  function ygoImage(id, big) {
    id = parseInt(id, 10); if (!id) return Promise.resolve('');
    const name = `${id}${big ? '-grand' : ''}.jpg`;
    if (ygoImgJobs.has(name)) return ygoImgJobs.get(name);
    const job = (async () => {
      await ygoImgInit();
      if (ygoImgHave.has(name)) return ygoImgBase + name;
      // au plus 6 téléchargements en même temps
      if (ygoImgRunning >= 6) await new Promise(r => ygoImgQueue.push(r));
      ygoImgRunning++;
      try {
        const res = await http({ url: Core.ygoImgUrl(id, big), responseType: 'blob', headers: { 'User-Agent': UA } });
        if (res.status < 200 || res.status >= 300 || !res.data) return '';
        await writeB64('yugioh-images/' + name, res.data);
        ygoImgHave.add(name);
        return ygoImgBase + name;
      } finally { ygoImgRunning--; const next = ygoImgQueue.shift(); if (next) next(); }
    })().catch(() => '');
    ygoImgJobs.set(name, job);
    job.then(u => { if (!u) ygoImgJobs.delete(name); });
    return job;
  }

  // Images des cartes One Piece : même principe, dans leur propre dossier
  const imgDirs = new Map(); const imgJobs = new Map();
  async function imgDir(dir) {
    if (imgDirs.has(dir)) return imgDirs.get(dir);
    const p = (async () => {
      try { await FS.mkdir({ path: dir, directory: DATA, recursive: true }); } catch (e) { /* existe déjà */ }
      const u = await FS.getUri({ path: dir, directory: DATA });
      const have = new Set();
      try { const r = await FS.readdir({ path: dir, directory: DATA }); (r.files || []).forEach(f => have.add(typeof f === 'string' ? f : f.name)); } catch (e) { /* vide */ }
      return { base: Cap.convertFileSrc(u.uri) + '/', have };
    })();
    imgDirs.set(dir, p);
    return p;
  }
  function cardImage(dir, id, url) {
    if (!/^[A-Za-z0-9_-]{3,40}$/.test(id)) return Promise.resolve('');
    const name = id + '.jpg', jk = dir + '/' + name;
    if (imgJobs.has(jk)) return imgJobs.get(jk);
    const job = (async () => {
      const d = await imgDir(dir);
      if (d.have.has(name)) return d.base + name;
      if (ygoImgRunning >= 6) await new Promise(r => ygoImgQueue.push(r));
      ygoImgRunning++;
      try {
        const res = await http({ url, responseType: 'blob', headers: { 'User-Agent': UA } });
        if (res.status < 200 || res.status >= 300 || !res.data) return '';
        await writeB64(dir + '/' + name, res.data);
        d.have.add(name);
        return d.base + name;
      } finally { ygoImgRunning--; const next = ygoImgQueue.shift(); if (next) next(); }
    })().catch(() => '');
    imgJobs.set(jk, job);
    job.then(u => { if (!u) imgJobs.delete(jk); });
    return job;
  }

  // ============================================================
  //  SYNCHRONISATION AVEC LE PC
  // ============================================================
  const Sync = {
    pair: null,        // { token, port, hosts: [], host, pcName, lastSync, lastError }
    busy: false,
    timer: null,
    status: '',

    async init() {
      this.pair = await readJson('appairage.json', null);
      const app = window.CoffreApp.data;
      lastSyncedJson = this.pair ? '' : JSON.stringify(Core.pickCollections(app));
      if (P.App) P.App.addListener('resume', () => this.run());
      document.addEventListener('visibilitychange', () => { if (!document.hidden) this.run(); });
      setInterval(() => { if (!document.hidden) this.run(); }, 45000);
      this.run();
    },
    async savePair() { await writeText('appairage.json', JSON.stringify(this.pair)); },
    soon() { clearTimeout(this.timer); if (this.pair) this.timer = setTimeout(() => this.run(), 2500); },

    async call(host, path, opts) {
      const res = await http({
        url: `http://${host}:${this.pair.port}${path}`,
        connectTimeout: 4000, readTimeout: 20000,
        ...opts,
        headers: { 'X-Coffre-Token': this.pair.token, 'Content-Type': 'application/json', ...(opts && opts.headers || {}) }
      });
      if (res.status === 401) { const e = new Error('Le PC a refusé le code. Associe à nouveau le téléphone (Réglages → Associer au PC).'); e.auth = true; throw e; }
      if (res.status < 200 || res.status >= 300) throw new Error(`Le PC a répondu ${res.status}.`);
      return asJson(res.data);
    },

    // Essaie la dernière adresse qui a marché, puis les autres.
    async reach(fn) {
      const hosts = [...new Set([this.pair.host, ...(this.pair.hosts || [])].filter(Boolean))];
      let last = null;
      for (const h of hosts) {
        try { const r = await fn(h); this.pair.host = h; return r; }
        catch (e) { if (e.auth) throw e; last = e; }
      }
      const e = new Error("PC injoignable. Vérifie que Coffre est ouvert sur le PC et que le téléphone est sur le même Wi-Fi.");
      e.cause = last; throw e;
    },

    async run(manual) {
      if (!this.pair || this.busy) return false;
      this.busy = true; this.setStatus('Synchronisation…');
      const App = window.CoffreApp;
      try {
        const d = App.data;
        const sent = Core.pickCollections(d);
        const res = await this.reach(h => this.call(h, '/api/sync', { method: 'POST', data: { device: 'Téléphone', ...sent } }));
        // Fusion avec ce qui a pu changer sur le téléphone pendant l'échange
        const merged = Core.mergeCollections(App.data, res);
        if (!Core.sameCollections(merged, App.data)) {
          lastSyncedJson = JSON.stringify(merged);
          App.applyRemote(merged);
          App.scheduleSave();
        }
        lastSyncedJson = JSON.stringify(Core.pickCollections(merged));
        await this.syncCovers(merged, res.covers || []);
        this.pair.pcName = res.name || this.pair.pcName;
        this.pair.lastSync = Date.now(); this.pair.lastError = '';
        await this.savePair();
        this.setStatus('');
        if (manual) App.toast('Synchronisé avec le PC');
        // Un changement fait pendant l'échange doit repartir vers le PC
        if (JSON.stringify(Core.pickCollections(App.data)) !== lastSyncedJson) this.soon();
        return true;
      } catch (e) {
        this.pair.lastError = e.message || String(e);
        await this.savePair();
        this.setStatus('');
        if (manual) App.toast(this.pair.lastError);
        return false;
      } finally {
        this.busy = false;
        this.refreshSettings();
      }
    },

    async syncCovers(col, pcCovers) {
      const used = new Set(Object.values(col.vinyls || {}).filter(v => v && !v.deleted && v.cover && COVER_RE.test(v.cover)).map(v => v.cover));
      const mine = new Set(await listCovers());
      const theirs = new Set(pcCovers);
      let got = 0;
      for (const name of used) {
        try {
          if (!mine.has(name) && theirs.has(name)) {
            const r = await this.call(this.pair.host, `/api/cover?b64=1&name=${encodeURIComponent(name)}`, { method: 'GET' });
            if (r.data) { await writeB64('pochettes/' + name, r.data); got++; }
          } else if (mine.has(name) && !theirs.has(name)) {
            await this.call(this.pair.host, `/api/cover?name=${encodeURIComponent(name)}`, { method: 'PUT', data: { data: await readB64('pochettes/' + name) } });
          }
        } catch (e) { if (e.auth) throw e; /* on réessaiera à la prochaine synchro */ }
      }
      if (got) window.CoffreApp.renderVinyls();
    },

    // Contenu du QR code affiché par le PC : {t:'coffre', v:1, k:token, p:port, h:[ips]}
    async pairWith(text) {
      let q;
      try { q = JSON.parse(text); } catch (e) { q = null; }
      if (!q || q.t !== 'coffre' || !q.k || !Array.isArray(q.h)) throw new Error("Ce QR code ne vient pas de Coffre. Ouvre Réglages sur le PC et scanne le code de la section Téléphone.");
      const prev = this.pair;
      this.pair = { token: q.k, port: q.p || 47800, hosts: q.h, host: '', pcName: '', lastSync: 0, lastError: '' };
      try {
        const ping = await this.reach(h => this.call(h, '/api/ping', { method: 'GET' }));
        this.pair.pcName = ping.name || 'PC';
        await this.savePair();
        lastSyncedJson = '';
        await this.run();
        return this.pair.pcName;
      } catch (e) {
        this.pair = prev;
        throw e;
      }
    },

    async unpair() {
      this.pair = null;
      try { await FS.deleteFile({ path: 'appairage.json', directory: DATA }); } catch (e) { /* rien */ }
      this.refreshSettings();
    },

    setStatus(t) {
      this.status = t;
      const el = document.getElementById('savedState');
      if (el && t) el.textContent = t;
      else if (el && el.textContent === 'Synchronisation…') el.textContent = '';
      this.refreshSettings();
    },

    refreshSettings() {
      const box = document.getElementById('pcBox');
      if (box) box.innerHTML = pcSectionInner();
    }
  };

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtDate = ms => new Date(ms).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });

  function pcSectionInner() {
    const p = Sync.pair;
    if (!p) {
      return `<p>Associe ton téléphone au PC pour que tout ce que tu ajoutes ici arrive aussi sur l'ordinateur, et inversement.</p>
        <p class="hint">Sur le PC : ouvre Coffre → ⚙ Réglages → section Téléphone. Puis touche le bouton ci-dessous et scanne le QR code.</p>
        <div class="actions" style="justify-content:flex-start"><button class="primary" data-act="pcPair">Associer au PC</button></div>`;
    }
    return `<dl class="kv"><dt>Ordinateur</dt><dd>${esc(p.pcName || 'PC')} (${esc(p.host || (p.hosts || [])[0] || '')})</dd>
        <dt>Dernière synchro</dt><dd>${Sync.busy ? 'en cours…' : p.lastSync ? fmtDate(p.lastSync) : 'jamais'}</dd></dl>
      ${p.lastError ? `<p class="error">${esc(p.lastError)}</p>` : ''}
      <div class="actions" style="justify-content:flex-start">
        <button class="primary" data-act="pcSync" ${Sync.busy ? 'disabled' : ''}>Synchroniser maintenant</button>
        <button data-act="pcPair">Associer à nouveau</button>
        <button class="danger" data-act="pcUnpair">Dissocier</button>
      </div>
      <p class="hint">La synchro se fait toute seule à l'ouverture de l'appli, après chaque ajout et toutes les 45 secondes, quand le PC est allumé avec Coffre ouvert sur le même Wi-Fi.</p>`;
  }

  window.CoffreExt = {
    settingsHtml() { return `<h3>Ordinateur</h3><div id="pcBox">${pcSectionInner()}</div>`; },
    async settingsClick(act) {
      if (act === 'pcSync') return Sync.run(true);
      if (act === 'pcUnpair') {
        if (!window.confirm('Dissocier ce téléphone du PC ? Ta collection reste sur les deux appareils.')) return;
        return Sync.unpair();
      }
      if (act === 'pcPair') {
        if (!window.CoffreScan) return;
        window.CoffreApp.closeModal();
        const text = await window.CoffreScan.scanQr();
        if (!text) return;
        window.CoffreApp.toast('Connexion au PC…');
        try {
          const name = await Sync.pairWith(text);
          window.CoffreApp.toast(`Associé à ${name}`);
        } catch (e) {
          window.CoffreApp.toast(e.message || String(e));
        }
      }
    },
    ready() {
      Sync.init();
      setTimeout(() => checkUpdate(), 4000);
      // Bouton retour d'Android : ferme la fenêtre ouverte, sinon quitte
      if (P.App) P.App.addListener('backButton', () => {
        if (window.CoffreScan && window.CoffreScan.isOpen()) return window.CoffreScan.close();
        const m = document.getElementById('modal');
        if (m && !m.hidden) return window.CoffreApp.closeModal();
        P.App.exitApp();
      });
    }
  };

  window.CoffreSync = Sync;
  // Téléchargement d'une image en base64 (pour comparer les pochettes à une photo)
  window.CoffreNet = {
    async getImageB64(url) {
      const res = await http({ url, responseType: 'blob', headers: { 'User-Agent': UA }, readTimeout: 15000 });
      return res.status >= 200 && res.status < 300 ? res.data : '';
    }
  };

  // ---------- En-tête qui se replie quand on fait défiler la liste ----------
  // L'en-tête se replie dès qu'on descend, et ne revient qu'une fois remonté tout en haut de la liste
  function watchScroll(list) {
    list.addEventListener('scroll', () => {
      const y = list.scrollTop;
      if (y < 20) document.body.classList.remove('compact');
      // (seulement si la liste est assez longue, sinon l'en-tête clignoterait)
      else if (y > 80 && list.scrollHeight - list.clientHeight > 400) document.body.classList.add('compact');
    }, { passive: true });
  }
  document.addEventListener('DOMContentLoaded', () => {
    ['fmList', 'vinList', 'ygoList', 'opList'].forEach(id => { const el = document.getElementById(id); if (el) watchScroll(el); });
    const tabs = document.getElementById('tabs');
    if (tabs) tabs.addEventListener('click', () => document.body.classList.remove('compact'));
  });
})();
