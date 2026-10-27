// Coffre — synchro en ligne (PC et téléphone), sans compte : un « code de synchro » partagé entre tes appareils.
// La collection est compressée puis chiffrée ici (AES-GCM) avec une clé tirée du code, avant d'être envoyée
// au petit serveur Coffre (Cloudflare). Le serveur ne voit qu'un bloc illisible et un identifiant.
// La fusion est la même que pour la synchro Wi-Fi : pour chaque carte, deck ou vinyle, la modif la plus récente gagne.
(() => {
  'use strict';
  const Core = window.CoffreCore;
  const App = () => window.CoffreApp;
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const serverUrl = () => String((App() && App().data && App().data.settings.cloudServer) || Core.CLOUD_URL || '').replace(/\/+$/, '');

  // ---------- Code de synchro : 20 octets aléatoires → 32 caractères (base 32 de Crockford : sans I, L, O, U) ----------
  const ALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  function newCode() {
    const b = crypto.getRandomValues(new Uint8Array(20));
    let bits = 0, val = 0, out = '';
    for (const x of b) { val = (val << 8) | x; bits += 8; while (bits >= 5) { out += ALPHA[(val >>> (bits - 5)) & 31]; bits -= 5; } }
    return out;
  }
  function normCode(text) {
    const t = String(text || '').toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1').replace(/[^A-Z0-9]/g, '');
    // O se lit 0, I et L se lisent 1 : une faute de frappe courante ne casse pas le code
    return t.length === 32 && [...t].every(c => ALPHA.includes(c)) ? t : '';
  }
  const prettyCode = c => c.match(/.{1,4}/g).join('-');

  // ---------- Chiffrement ----------
  const enc = new TextEncoder(), dec = new TextDecoder();
  const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  const sha = text => crypto.subtle.digest('SHA-256', enc.encode(text));
  const keys = new Map();
  async function keysFor(code) {
    if (keys.has(code)) return keys.get(code);
    const k = {
      id: hex(await sha('coffre-id:' + code)),
      aes: await crypto.subtle.importKey('raw', await sha('coffre-key:' + code), 'AES-GCM', false, ['encrypt', 'decrypt'])
    };
    keys.set(code, k);
    return k;
  }
  const b64 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  async function pipe(bytes, stream) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()); }
  const canZip = typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';
  async function seal(code, obj) {
    const { aes } = await keysFor(code);
    let bytes = enc.encode(JSON.stringify(obj)), tag = '0';
    if (canZip) { bytes = await pipe(bytes, new CompressionStream('gzip')); tag = '1'; }
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aes, bytes));
    const all = new Uint8Array(12 + ct.length); all.set(iv); all.set(ct, 12);
    return tag + '.' + b64(all);
  }
  async function open(code, text) {
    const { aes } = await keysFor(code);
    const [tag, body] = String(text).split('.');
    const all = unb64(body || '');
    let bytes = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: all.subarray(0, 12) }, aes, all.subarray(12)));
    if (tag === '1') bytes = await pipe(bytes, new DecompressionStream('gzip'));
    return JSON.parse(dec.decode(bytes));
  }

  // ---------- Échanges avec le serveur ----------
  async function call(code, method, body) {
    const base = serverUrl();
    if (!base) throw new Error("La synchro en ligne n'est pas encore configurée dans cette version de Coffre.");
    const { id } = await keysFor(code);
    let res;
    try {
      res = await fetch(`${base}/v1/s/${id}`, { method, headers: { 'X-Coffre': '1', ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
    } catch (e) { const err = new Error('Pas de connexion internet (ou serveur injoignable).'); err.offline = true; throw err; }
    if (res.status === 404 && method === 'GET') return null;
    if (res.status === 409) { const err = new Error('conflit'); err.conflict = true; throw err; }
    if (res.status === 413) throw new Error('Ta collection est trop grosse pour la synchro en ligne.');
    if (!res.ok) throw new Error(`Le serveur de synchro a répondu ${res.status}.`);
    return res.json();
  }

  // ---------- État (gardé dans les réglages de cet appareil, jamais exporté) ----------
  const st = () => { const s = App().data.settings; return s.cloud || null; };
  function setState(o) { const s = App().data.settings; if (o) s.cloud = o; else delete s.cloud; App().scheduleSave(); }
  let busy = false, again = false, timer = null, lastJson = '', status = '';

  // Une synchro : on lit la sauvegarde en ligne, on fusionne avec ce qu'on a, et on renvoie le résultat si besoin.
  async function run(opts = {}) {
    const c = st(); if (!c || !c.code) return false;
    if (busy) { again = true; return false; }
    busy = true; status = 'Synchronisation…'; refreshBox();
    try {
      for (let attempt = 0; attempt < 4; attempt++) {
        const remote = await call(c.code, 'GET');
        if (!remote && opts.mustExist) { const e = new Error("Aucune collection trouvée pour ce code. Vérifie-le, ou active d'abord la synchro sur l'autre appareil."); e.unknown = true; throw e; }
        let rc = {};
        if (remote) {
          try { rc = (await open(c.code, remote.data)).c || {}; }
          catch (e) { throw new Error('Les données en ligne sont illisibles avec ce code.'); }
        }
        const A = App();
        const merged = Core.mergeCollections(A.data, rc);
        if (!Core.sameCollections(merged, A.data)) { A.applyRemote(merged); A.scheduleSave(); }
        if (remote && Core.sameCollections(merged, rc)) break; // rien de neuf à envoyer
        try { await call(c.code, 'PUT', { ver: remote ? remote.ver : 0, data: await seal(c.code, { v: 1, c: Core.pickCollections(merged) }) }); break; }
        catch (e) { if (!e.conflict || attempt === 3) throw e; } // un autre appareil a écrit entre-temps : on recommence
      }
      lastJson = JSON.stringify(Core.pickCollections(App().data));
      const cur = st(); if (cur) { cur.lastSync = Date.now(); cur.lastError = ''; setState(cur); }
      status = '';
      if (opts.manual) App().toast('Synchronisé en ligne');
      return true;
    } catch (e) {
      status = '';
      const cur = st();
      if (cur && !e.unknown) { cur.lastError = e.message || String(e); setState(cur); }
      if (opts.manual || opts.mustExist) App().toast(e.message || String(e));
      if (e.unknown) throw e;
      return false;
    } finally {
      busy = false; refreshBox();
      if (again) { again = false; soon(); }
    }
  }
  // Après une modif : on attend quelques secondes (plusieurs clics d'affilée = un seul envoi)
  function soon(ms = 6000) { clearTimeout(timer); timer = setTimeout(() => run(), ms); }

  async function activate() {
    setState({ code: newCode(), since: Date.now() });
    lastJson = '';
    const ok = await run({ manual: true });
    if (ok) App().toast('Synchro en ligne activée');
  }
  async function join(text) {
    const code = normCode(text);
    if (!code) { App().toast('Code invalide : il fait 32 caractères (lettres et chiffres).'); return false; }
    const prev = st();
    setState({ code, since: Date.now() });
    try { await run({ mustExist: true }); App().toast('Cet appareil est relié à ta synchro en ligne'); return true; }
    catch (e) { setState(prev); return false; }
  }
  function leave() { setState(null); lastJson = ''; App().toast('Synchro en ligne désactivée sur cet appareil'); refreshBox(); }
  async function wipe() {
    const c = st(); if (!c) return;
    try { await call(c.code, 'DELETE'); } catch (e) { App().toast(e.message || String(e)); return; }
    setState(null); lastJson = ''; App().toast('Données en ligne supprimées'); refreshBox();
  }

  // ---------- Section des réglages ----------
  let showCode = false;
  const fmt = ms => new Date(ms).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  function sectionHtml() { return `<h3>Synchro en ligne</h3><div id="cloudBox" class="cloud">${boxInner()}</div>`; }
  function boxInner() {
    if (!serverUrl()) return `<p class="hint">Bientôt : la synchro en ligne n'est pas encore configurée dans cette version.</p>`;
    const c = st();
    if (!c) return `
      <p>Synchronise ta collection entre tes appareils <b>par internet</b>, même quand le PC est éteint. Pas de compte : un code secret relie tes appareils, et tout est chiffré avant l'envoi.</p>
      <div class="actions" style="justify-content:flex-start"><button class="primary" data-cloud="activate">Activer sur cet appareil</button></div>
      <p class="hint">Déjà activée sur un autre appareil ? Entre son code (Réglages → Synchro en ligne → Afficher le code) :</p>
      <div class="cloudjoin"><input id="cloudCode" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX" spellcheck="false" autocomplete="off" autocapitalize="characters"><button data-cloud="join">Relier</button>${window.CoffreScan ? '<button data-cloud="scan">Scanner le QR code</button>' : ''}</div>`;
    return `
      <p>${status ? `<b>${esc(status)}</b>` : `<b class="ok">Activée</b> · dernière synchro : ${c.lastSync ? fmt(c.lastSync) : 'jamais'}`}</p>
      ${c.lastError ? `<p class="error">${esc(c.lastError)}</p>` : ''}
      <div class="actions" style="justify-content:flex-start"><button class="primary" data-cloud="now">Synchroniser maintenant</button><button data-cloud="show">${showCode ? 'Cacher le code' : 'Afficher le code'}</button></div>
      ${showCode ? `<div class="cloudcode">${qrHtml}<div><p>Sur ton autre appareil : <b>Réglages → Synchro en ligne</b>, puis entre ce code${window.coffre.makeQr ? ' ou scanne-le' : ''}.</p><code>${esc(prettyCode(c.code))}</code>
        <p class="hint">Garde-le pour toi : il donne accès à ta collection.</p><div class="actions" style="justify-content:flex-start"><button data-cloud="copy">Copier le code</button></div></div></div>` : ''}
      <div class="actions" style="justify-content:flex-start"><button data-cloud="leave">Désactiver sur cet appareil</button><button class="danger" data-cloud="wipe">Supprimer mes données en ligne</button></div>`;
  }
  let qrHtml = '';
  async function loadQr() {
    qrHtml = '';
    const c = st();
    if (c && showCode && window.coffre.makeQr) {
      try { const src = await window.coffre.makeQr(JSON.stringify({ t: 'coffre-cloud', c: c.code })); if (src) qrHtml = `<img class="qr" src="${src}" alt="QR code de synchro">`; } catch (e) { /* rien */ }
    }
    refreshBox();
  }
  function refreshBox() { const b = $('cloudBox'); if (b) b.innerHTML = boxInner(); }

  document.addEventListener('click', async e => {
    const b = e.target.closest && e.target.closest('[data-cloud]'); if (!b) return;
    const act = b.dataset.cloud;
    if (act === 'activate') return activate();
    if (act === 'join') { b.disabled = true; await join(($('cloudCode') || {}).value); b.disabled = false; return refreshBox(); }
    if (act === 'scan') {
      App().closeModal();
      const text = await window.CoffreScan.scanQr(); if (!text) return;
      let code = text; try { const q = JSON.parse(text); if (q && q.t === 'coffre-cloud') code = q.c; else if (q && q.t === 'coffre') return App().toast("Ce QR code sert à l'association Wi-Fi. Scanne celui de « Synchro en ligne → Afficher le code ».") } catch (err) { /* texte brut */ }
      return join(code);
    }
    if (act === 'now') return run({ manual: true });
    if (act === 'show') { showCode = !showCode; refreshBox(); return loadQr(); }
    if (act === 'copy') { const c = st(); if (!c) return; try { await navigator.clipboard.writeText(prettyCode(c.code)); App().toast('Code copié'); } catch (err) { App().toast('Copie impossible : recopie le code à la main'); } return; }
    if (act === 'leave') { if (window.confirm('Désactiver la synchro en ligne sur cet appareil ? Ta collection reste ici et en ligne.')) leave(); return; }
    if (act === 'wipe') { if (window.confirm("Supprimer ta collection du serveur de synchro ? Elle reste sur tes appareils. Pense à désactiver aussi la synchro en ligne sur tes autres appareils, sinon ils la renverront à leur prochaine synchro.")) await wipe(); return; }
  });

  // ---------- Déclencheurs ----------
  // au démarrage, après chaque modif, toutes les 5 minutes, et quand on revient sur l'appli
  const onChange = () => {
    if (!st() || busy) return;
    const j = JSON.stringify(Core.pickCollections(App().data));
    if (j !== lastJson) soon();
  };
  document.addEventListener('coffre:saved', onChange);
  document.addEventListener('coffre:changed', onChange); // arrivé par la synchro Wi-Fi
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && st()) soon(500); });
  const start = () => { if (st()) soon(1500); setInterval(() => { if (st() && document.visibilityState !== 'hidden') run(); }, 5 * 60 * 1000); };
  if (window.coffreReady) start(); else document.addEventListener('coffre:ready', start, { once: true });

  window.CoffreCloud = { sectionHtml, run, normCode, newCode, prettyCode, seal, open, _keysFor: keysFor };
})();
