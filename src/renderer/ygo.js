// Coffre — onglet Yu-Gi-Oh : toutes les cartes du jeu (base YGOPRODeck),
// ta collection (par impression : code + rareté, ou « peu importe l'extension »),
// tes decks, et la liste des cartes manquantes au format wishlist Cardmarket.
(function () {
  'use strict';
  const App = window.CoffreApp;
  const Core = window.CoffreCore;
  const $ = id => document.getElementById(id);
  const esc = App.esc;
  const now = () => Date.now();

  const EXTRA = /fusion|synchro|xyz|link/;          // cadres qui vont dans l'Extra Deck
  const st = { db: null, idx: null, loading: false, error: '', view: 'col', q: '', sort: 'name', addQ: '', addSet: null, setView: 'all', setRarity: null, deckId: '', deckView: 'all', deckQ: '' };

  // ---------- Base de cartes ----------
  function setDb(db) {
    if (!db || !db.cards) return;
    st.db = db; st.idx = Core.ygoIndex(db);
  }
  async function loadDb() {
    try { setDb(await window.coffre.ygoDb()); } catch (e) { /* pas encore téléchargée */ }
    render();
    // Mise à jour discrète toutes les deux semaines (nouvelles extensions)
    // Mise à jour discrète (nouvelles cartes, prix Cardmarket) chaque semaine, ou si la base est d'un ancien format
    if (st.db && (st.db.v !== 4 || now() - (st.db.at || 0) > 7 * 864e5)) refreshDb(true);
  }
  async function refreshDb(silent) {
    if (st.loading) return;
    st.loading = true; st.error = '';
    if (!silent) render();
    try { setDb(await window.coffre.ygoRefresh()); if (!silent) App.toast('Base de cartes à jour'); }
    catch (e) { st.error = "Impossible de télécharger la base de cartes : " + String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''); }
    st.loading = false;
    render();
  }

  const card = id => st.idx && st.idx.byId.has(id) ? st.db.cards[st.idx.byId.get(id)] : null;
  const setName = i => (st.db.sets[i] || [''])[0];
  const label = c => c.f || c.n;                       // nom français si connu
  const sub = c => c.f ? c.n : '';                     // nom anglais en dessous
  const isExtra = c => EXTRA.test(c.t || '');
  // Banlist TCG : nombre d'exemplaires autorisés dans un deck (3 si la carte n'est pas sur la liste)
  const BAN_TXT = ['Interdite', 'Limitée', 'Semi-limitée'];
  const banMax = c => c.b != null ? c.b : 3;
  const banIcon = c => c.b != null ? `<span class="ban b${c.b}" title="Banlist TCG : ${BAN_TXT[c.b]}">${c.b}</span>` : '';
  const banTag = c => c.b != null ? `<span class="bantag b${c.b}">${BAN_TXT[c.b]}${c.b ? ' (' + c.b + ')' : ''}</span>` : '';
  const gal = () => App.data.settings.ygoLayout !== 'list';
  const layoutSeg = id => `<div class="seg" id="${id}"><button data-v="gal" aria-pressed="${gal()}">Galerie</button><button data-v="list" aria-pressed="${!gal()}">Liste</button></div>`;
  function setLayout(v) { App.data.settings.ygoLayout = v; App.scheduleSave(); render(); }

  // ---------- Images (téléchargées une fois, puis gardées sur l'appareil) ----------
  const imgTag = (id, cls = '') => `<img class="yimg ${cls}" data-ygo="${id}" alt="" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7">`;
  let io = null;
  function loadImages(root) {
    const imgs = (root || document).querySelectorAll('img[data-ygo]:not([data-done])');
    const go = img => {
      img.dataset.done = '1';
      window.coffre.ygoImg(img.dataset.ygo, img.classList.contains('big')).then(u => { if (u) img.src = u; else img.classList.add('missing'); });
    };
    if (!('IntersectionObserver' in window)) { imgs.forEach(go); return; }
    if (!io) io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { io.unobserve(e.target); go(e.target); } }), { rootMargin: '300px' });
    imgs.forEach(img => io.observe(img));
  }

  // ---------- Collection ----------
  // data.ygo[clé] = { id, code, r, qty, mt }   clé = « CODE|RARETÉ » ou « id|* » (peu importe l'extension)
  const col = () => App.data.ygo || (App.data.ygo = {});
  function ownedOf(id) {
    let n = 0;
    for (const e of Object.values(col())) if (e && e.id === id) n += e.qty || 0;
    return n;
  }
  function changeEntry(key, base, delta) {
    const e = { ...(col()[key] || base) };
    e.qty = Math.max(0, (e.qty || 0) + delta);
    e.mt = now();
    col()[key] = e;
    App.scheduleSave();
    return e.qty;
  }
  // Langue de la carte physique : FR, EN, DE, IT, ES, PT. Le code affiché suit la langue (SGX1-ENA18 → SGX1-FRA18).
  const LANGS = ['FR', 'EN', 'DE', 'IT', 'ES', 'PT'];
  const curLang = () => LANGS.includes(App.data.settings.ygoLang) ? App.data.settings.ygoLang : 'FR';
  function locCode(code, lang) {
    if (!lang || lang === 'EN') return code;
    const m = String(code).match(/^([A-Z0-9]+)-EN([A-Z]?\d+)$/);
    return m ? `${m[1]}-${lang === 'ES' ? 'SP' : lang}${m[2]}` : code;
  }
  // Code imprimé lu par le scan : gardé seulement s'il a la bonne forme et correspond à l'impression
  // (ex. DUAD-FR053 pour DUAD-EN053). Sinon (« MP24-NT27 », « MP25-BIN229 »…) on prend le vrai code dans la langue.
  const LANG_RE = 'EN|FR|DE|IT|SP|ES|PT|E|F|G|I|S|P';
  function validPrinted(raw, code) {
    const r = String(raw || '').toUpperCase().match(new RegExp(`^([A-Z0-9]{2,5})-(?:${LANG_RE})?([A-Z]?\\d{2,3})$`));
    if (!r) return false;
    const [px, rest] = Core.ygoNormCode(code).split('-');
    if (PREFIX_ALIAS[r[1]] === px) return true;          // anciennes cartes européennes (LDD-F092 = LOB-092)
    return r[1] === px && r[2] === rest;
  }
  const printedCode = (raw, code, lang) => validPrinted(raw, code) ? String(raw).toUpperCase() : locCode(code, lang);
  const keyFor = (code, r, lang) => Core.ygoKey(code, r) + (lang && lang !== 'EN' ? '|' + lang : '');
  const langSelect = id => `<select id="${id}" class="ylang" aria-label="Langue de tes cartes" title="Langue de tes cartes">${LANGS.map(l => `<option${l === curLang() ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
  function addPrinting(ci, pi, delta = 1, lang, lcode) {
    const c = st.db.cards[ci], p = c.p[pi];
    lang = lang || curLang();
    const base = { id: c.i, code: p[1], r: p[2] };
    if (lang !== 'EN') { base.lang = lang; base.lcode = printedCode(lcode, p[1], lang); }
    return changeEntry(keyFor(p[1], p[2], lang), base, delta);
  }
  // Exemplaires d'une impression, toutes langues confondues
  function qtyAny(code, r) {
    let n = 0;
    for (const e of Object.values(col())) if (e && e.code === code && e.r === r) n += e.qty || 0;
    return n;
  }
  function addGeneric(id, delta = 1) { return changeEntry(`${id}|*`, { id, code: '', r: '' }, delta); }

  // ---------- Prix Cardmarket ----------
  const eur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
  const priceOf = id => { const c = card(id); return (c && c.cm) || 0; };
  const money = v => eur.format(v || 0);
  const priceTag = (id, qty = 1) => { const p = priceOf(id); return p ? `<span class="price">${money(p * qty)}</span>` : ''; };
  const pricesDate = () => st.db && st.db.v >= 2 ? new Date(st.db.at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) : '';

  function stats() {
    let cards = 0, copies = 0, value = 0; const ids = new Set();
    for (const e of Object.values(col())) if (e && e.qty > 0) { copies += e.qty; ids.add(e.id); value += priceOf(e.id) * e.qty; }
    cards = ids.size;
    $('ygoStats').innerHTML = `<b>${cards}</b> cartes · ${copies} exemplaires${st.db && st.db.v >= 2 ? ` · valeur ≈ <b class="price">${money(value)}</b> <span class="hint" title="Prix de référence Cardmarket de chaque carte (toutes éditions), mis à jour chaque semaine">(Cardmarket, ${pricesDate()})</span>` : ''} · ${liveDecks().length} decks${wishCount() ? ` · ${wishCount()} en wishlist` : ''}`;
    $('tabYgoCount').textContent = cards;
  }

  // ---------- Rendu de l'onglet ----------
  function toolsHtml() {
    if (st.view === 'wish') return '';
    if (st.view === 'decks') return `<button class="primary" data-y="newDeck">Nouveau deck</button><button data-y="importYdk" title="Fichier .ydk de YGOPRODeck, EDOPro, Dueling Book, Master Duel Meta…">Importer un deck (.ydk)</button>`;
    return `<button class="primary" data-y="add">Ajouter des cartes</button>
      <input type="search" id="ygoQ" placeholder="Filtrer ma collection (nom, code)…" value="${esc(st.q)}">
      ${layoutSeg('ygoLayout')}
      <select id="ygoSort" aria-label="Trier"><option value="name">Par nom</option><option value="added">Derniers ajouts</option><option value="code">Par code</option><option value="set">Par extension</option></select>`;
  }

  function render() {
    if (!$('ygoList') || !App.data) return;
    stats();
    $('ygoView').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === st.view)));
    const tools = $('ygoTools');
    if (tools.dataset.view !== st.view) {
      tools.innerHTML = toolsHtml(); tools.dataset.view = st.view;
      const s = $('ygoSort'); if (s) s.value = st.sort;
    }
    const ls = $('ygoLayout'); if (ls) ls.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.v === 'gal') === gal())));
    const list = $('ygoList');
    if (!st.db) {
      list.innerHTML = `<div class="empty">
        <p>Pour voir toutes les cartes Yu-Gi-Oh, Coffre doit d'abord télécharger la base de cartes (YGOPRODeck, gratuite : environ 13 000 cartes avec toutes leurs extensions). Ça se fait une seule fois, puis elle se met à jour toute seule.</p>
        ${st.loading ? `<p><b>Téléchargement en cours…</b> (une minute environ)</p>` : `<button class="primary" data-y="dl">Télécharger la base de cartes</button>`}
        ${st.error ? `<p class="error">${esc(st.error)}</p>` : ''}</div>`;
      return;
    }
    if (st.view === 'wish') { renderWish(); }
    else list.innerHTML = st.view === 'decks' ? decksHtml() : collectionHtml();
    loadImages(list);
    refreshOpenModal();
  }

  function collectionHtml() {
    const q = st.q.trim().toLowerCase();
    let rows = [];
    for (const [key, e] of Object.entries(col())) {
      if (!e || !(e.qty > 0)) continue;
      const c = card(e.id); if (!c) continue;
      if (q && !(c.s.includes(q) || (e.code || '').toLowerCase().includes(q) || (e.lcode || '').toLowerCase().includes(q))) continue;
      const p = e.code ? c.p.find(x => x[1] === e.code && x[2] === e.r) : null;
      rows.push({ key, e, c, p });
    }
    if (!rows.length) {
      return `<div class="empty">${Object.keys(col()).length && q ? 'Aucune carte ne correspond.' : "Ta collection est vide. Touche « Ajouter des cartes » pour chercher dans toutes les cartes du jeu" + (App.info.platform === 'mobile' ? ', ou scanne le code imprimé sous l\'illustration (ex. SGX1-FRA18).' : '.')}</div>`;
    }
    let head = '';
    if (st.sort === 'set') {
      // Par extension : d'abord la liste des extensions (la plus récente en haut), puis les cartes de celle choisie
      if (st.colSet == null) return colSetsHtml(rows);
      rows = rows.filter(r => st.colSet === -1 ? !r.p : r.p && r.p[0] === st.colSet);
      const x = st.colSet === -1 ? ['Sans extension précise', '', ''] : st.db.sets[st.colSet] || ['', '', ''];
      const pr = st.colSet === -1 ? null : setProgress(st.colSet);
      head = `<div class="ycolset-head"><button data-y="colSetBack">← Extensions</button>
        <div><b>${esc(x[0])}</b> ${x[1] ? `<span class="code">${esc(x[1])}</span>` : ''}
        <div class="hint">${x[2] ? esc(x[2].replace(/-/g, '/')) + ' · ' : ''}${pr ? `${pr.own} / ${pr.total} cartes de l'extension · ` : ''}${rows.reduce((a, r) => a + r.e.qty, 0)} exemplaires</div></div>
        ${st.colSet !== -1 ? `<button data-y="colSetOpen" title="Voir toute l'extension pour la compléter">Compléter l'extension</button>` : ''}</div>`;
      if (!rows.length) return head + `<div class="empty">Aucune carte de cette extension ne correspond.</div>`;
    }
    const num = s => { const m = String(s || '').match(/(\d+)$/); return m ? Number(m[1]) : 0; };
    const by = { name: (a, b) => label(a.c).localeCompare(label(b.c), 'fr'), added: (a, b) => (b.e.mt || 0) - (a.e.mt || 0), code: (a, b) => (a.e.code || '~').localeCompare(b.e.code || '~'),
      set: (a, b) => num(a.e.code) - num(b.e.code) || label(a.c).localeCompare(label(b.c), 'fr') };
    rows.sort(by[st.sort] || by.name);
    if (gal()) return head + `<div class="gal">` + rows.map(({ key, e, c, p }) => `<div class="gcard own" data-key="${esc(key)}" data-id="${c.i}">
        <button class="pic" data-y="card" aria-label="Détails de ${esc(label(c))}">${imgTag(c.i)}${banIcon(c)}<span class="badge">×${e.qty}</span></button>
        <div class="cap"><span class="num">${esc(e.code ? (e.lcode || e.code) : 'toute extension')}${p ? ' · ' + esc(p[2]) : ''}${e.lang ? ' · ' + esc(e.lang) : ''}</span>${priceTag(c.i)}${esc(label(c))}</div>${App.qtyHtml(e.qty)}</div>`).join('') + `</div>`;
    return head + rows.map(({ key, e, c, p }) => `<div class="yrow" data-key="${esc(key)}" data-id="${c.i}">
        <button class="ypic" data-y="card">${imgTag(c.i)}</button>
        <div class="yinfo"><button class="nm" data-y="card">${esc(label(c))}</button>${sub(c) ? `<span class="en">${esc(sub(c))}</span>` : ''}
          <span class="meta">${e.code ? `<span class="code">${esc(e.lcode || e.code)}</span>${e.lang ? `<span class="tag">${esc(e.lang)}</span>` : ''}<span>${esc(p ? p[3] : e.r)}</span><span>${esc(p ? setName(p[0]) : '')}</span>` : `<span class="tag">peu importe l'extension</span>`}${banTag(c)}${priceTag(c.i)}</span></div>
        ${App.qtyHtml(e.qty)}</div>`).join('');
  }

  // Liste des extensions dont tu as des cartes, de la plus récente à la plus ancienne
  function colSetsHtml(rows) {
    const m = new Map();
    for (const r of rows) {
      const i = r.p ? r.p[0] : -1;
      const g = m.get(i) || { ids: new Set(), copies: 0 };
      g.ids.add(r.p ? r.p[1] : r.c.i); g.copies += r.e.qty; m.set(i, g);
    }
    const date = i => i === -1 ? '' : (st.db.sets[i] || [])[2] || '';
    const list = [...m.keys()].sort((a, b) => (a === -1) - (b === -1) || date(b).localeCompare(date(a)) || String((st.db.sets[a] || [''])[0]).localeCompare(String((st.db.sets[b] || [''])[0])));
    return `<div class="ycolsets">` + list.map(i => {
      const g = m.get(i), x = i === -1 ? null : st.db.sets[i] || ['?', '', ''];
      const pr = i === -1 ? null : setProgress(i);
      return `<button class="ycolset" data-y="colSet" data-set="${i}">
        <span class="d">${x && x[2] ? esc(x[2].replace(/-/g, '/')) : '—'}${x && x[1] ? ` <span class="code">${esc(x[1])}</span>` : ''}</span>
        <span class="n">${x ? esc(x[0]) : 'Sans extension précise'}</span>
        <span class="m">${pr ? `<b>${pr.own}</b> / ${pr.total} cartes · ` : `${g.ids.size} carte${g.ids.size > 1 ? 's' : ''} · `}${g.copies} exemplaire${g.copies > 1 ? 's' : ''}${pr ? `<i class="bar"><i style="width:${pr.total ? pr.own / pr.total * 100 : 0}%"></i></i>` : ''}</span></button>`;
    }).join('') + `</div>`;
  }

  // ---------- Decks ----------
  const decks = () => App.data.decks || (App.data.decks = {});
  const WISH = 'wishlist';
  const liveDecks = () => Object.entries(decks()).filter(([id, d]) => d && !d.deleted && id !== WISH);
  // Wishlist : cartes que tu veux, en dehors de tout deck (même format, gardée dans les « decks » pour la synchro)
  function wishDeck() {
    const d = decks()[WISH];
    if (!d || d.deleted) decks()[WISH] = { name: 'Wishlist', cards: {}, wish: true, created: now(), mt: now() };
    return decks()[WISH];
  }
  function wishCount() { const d = decks()[WISH]; return d && !d.deleted ? Object.values(d.cards || {}).reduce((a, q) => a + q, 0) : 0; }
  // Cartes nécessaires pour un deck : Main/Extra + Side Deck (une carte peut être dans les deux)
  function deckNeed(d) {
    const m = new Map();
    for (const part of [d.cards || {}, d.side || {}]) for (const [id, q] of Object.entries(part)) m.set(id, (m.get(id) || 0) + q);
    return m;
  }
  function deckCounts(d) {
    let total = 0, missing = 0;
    for (const [id, q] of deckNeed(d)) { total += q; missing += Math.max(0, q - ownedOf(Number(id))); }
    return { total, missing };
  }
  function banIssues(d) {
    let n = 0;
    for (const [id, q] of deckNeed(d)) { const c = card(Number(id)); if (c && q > banMax(c)) n++; }
    return n;
  }
  function missingCost(d) {
    let v = 0;
    for (const [id, q] of deckNeed(d)) v += Math.max(0, q - ownedOf(Number(id))) * priceOf(Number(id));
    return v;
  }
  function decksHtml() {
    const ds = liveDecks().sort((a, b) => (b[1].mt || 0) - (a[1].mt || 0));
    if (!ds.length) return `<div class="empty">Aucun deck. Touche « Nouveau deck », puis ajoute des cartes, même celles que tu n'as pas encore : Coffre te dira lesquelles manquent.</div>`;
    return `<div class="ydecks">` + ds.map(([id, d]) => {
      const { total, missing } = deckCounts(d);
      const cover = Object.keys(d.cards || {})[0];
      return `<button class="ydeck" data-y="deck" data-deck="${id}">
        <span class="ycover">${cover ? imgTag(cover) : ''}</span>
        <span class="t">${esc(d.name || 'Deck sans nom')}</span>
        <span class="a">${banIssues(d) ? '<b class="miss">⚠ banlist</b> · ' : ''}${total} cartes · ${missing ? `<b class="miss">${missing} manquante${missing > 1 ? 's' : ''}</b>` : 'complet'}${missingCost(d) ? ` · ≈ ${money(missingCost(d))} à acheter` : ''}</span></button>`;
    }).join('') + `</div>`;
  }

  // ---------- Fichiers .ydk (simulateurs : EDOPro, Dueling Book, YGOPRODeck…) ----------
  // Une ligne = un exemplaire, identifié par le mot de passe de la carte ; sections #main, #extra, !side.
  function toYdk(d) {
    const main = [], extra = [];
    for (const [id, q] of Object.entries(d.cards || {})) {
      const c = card(Number(id)); if (!c) continue;
      for (let k = 0; k < q; k++) (isExtra(c) ? extra : main).push(c.i);
    }
    const side = [];
    for (const [id, q] of Object.entries(d.side || {})) { const c = card(Number(id)); if (c) for (let k = 0; k < q; k++) side.push(c.i); }
    return ['#created by Coffre', '#main', ...main, '#extra', ...extra, '!side', ...side, ''].join('\n');
  }
  let imgIdx = null;
  function cardByPassword(n) {
    if (st.idx.byId.has(n)) return st.db.cards[st.idx.byId.get(n)];
    if (!imgIdx || imgIdx.db !== st.db) { imgIdx = { db: st.db, m: new Map() }; st.db.cards.forEach(c => (c.im || []).forEach(x => imgIdx.m.set(x, c))); }
    return imgIdx.m.get(n) || null;   // illustration alternative : même carte
  }
  function parseYdk(text) {
    let part = 'main'; const cards = {}, side = {}; let unknown = 0;
    for (const raw of String(text).replace(/^\uFEFF/, '').split(/\r?\n/)) {
      const t = raw.trim(); if (!t) continue;
      if (/^#main/i.test(t)) { part = 'main'; continue; }
      if (/^#extra/i.test(t)) { part = 'extra'; continue; }
      if (/^!side/i.test(t)) { part = 'side'; continue; }
      if (t[0] === '#' || t[0] === '!') continue;
      const n = parseInt(t, 10); if (!n) continue;
      const c = cardByPassword(n);
      if (!c) { unknown++; continue; }
      const into = part === 'side' ? side : cards;
      into[c.i] = (into[c.i] || 0) + 1;
    }
    return { cards, side, unknown };
  }
  async function importYdk() {
    let r;
    try { r = await window.coffre.openText('ydk'); } catch (err) { return App.toast('Import impossible : ' + (err.message || err)); }
    if (!r || !r.ok) return;
    const { cards, side, unknown } = parseYdk(r.text);
    if (!Object.keys(cards).length) return App.toast("Ce fichier ne contient aucune carte reconnue (est-ce bien un fichier .ydk ?)");
    const id = 'd' + now().toString(36) + Math.random().toString(36).slice(2, 6);
    decks()[id] = { name: String(r.name || 'Deck importé').replace(/\.ydk$/i, '').slice(0, 60) || 'Deck importé', cards, side, created: now(), mt: now() };
    App.scheduleSave(); render(); openDeck(id);
    const notes = [unknown ? `${unknown} carte${unknown > 1 ? 's' : ''} inconnue${unknown > 1 ? 's' : ''} ignorée${unknown > 1 ? 's' : ''}` : ''].filter(Boolean);
    App.toast('Deck importé' + (notes.length ? ' (' + notes.join(', ') + ')' : ''));
  }

  function newDeck() {
    const id = 'd' + now().toString(36) + Math.random().toString(36).slice(2, 6);
    decks()[id] = { name: 'Nouveau deck', cards: {}, created: now(), mt: now() };
    App.scheduleSave();
    render();
    openDeck(id);
  }
  function touchDeck(d) { d.mt = now(); App.scheduleSave(); }

  // Recherche dans toutes les cartes du jeu (nom français ou anglais, code)
  function searchCards(q, max = 60) {
    q = q.trim().toLowerCase();
    if (!q || !st.db) return [];
    const nq = Core.ygoNormCode(q.toUpperCase());
    const out = [];
    if (st.idx.byNorm.has(nq)) for (const [ci] of st.idx.byNorm.get(nq)) out.push(st.db.cards[ci]);
    const words = q.split(/\s+/);
    const starts = [], contains = [];
    for (const c of st.db.cards) {
      if (out.includes(c)) continue;
      if (!words.every(w => c.s.includes(w))) continue;
      ((c.f || '').toLowerCase().startsWith(q) || c.n.toLowerCase().startsWith(q) ? starts : contains).push(c);
      if (starts.length >= max) break;
    }
    return out.concat(starts, contains).slice(0, max);
  }
  const resultHtml = (c, act) => `<div class="yres" data-id="${c.i}">
      <button class="ypic" data-y="card">${imgTag(c.i)}</button>
      <div class="yinfo"><button class="nm" data-y="card">${esc(label(c))}</button>${sub(c) ? `<span class="en">${esc(sub(c))}</span>` : ''}
        <span class="meta">${banTag(c)}<span>${esc(c.ty)}</span>${c.k !== '' ? `<span>${c.k}/${c.d === '' ? '—' : c.d}</span>` : ''}${ownedOf(c.i) ? `<span class="own">${ownedOf(c.i)} dans ta collection</span>` : ''}</span></div>
      ${act}</div>`;

  function openDeck(id, keep) {
    if (!keep) { st.deckQ = ''; st.deckView = 'all'; }
    st.deckId = id;
    App.openModal(`<div id="ydeckSheet"></div>`, 'tcg ygo wide', 'ygo-deck');
    renderDeck();
  }
  function renderDeck(keepFocus) {
    const box = $('ydeckSheet'); if (!box) return;
    const d = decks()[st.deckId]; if (!d || d.deleted) { App.closeModal(); return; }
    const need = deckNeed(d);
    const zone = (obj, z) => Object.entries(obj || {}).map(([id, q]) => ({ c: card(Number(id)), q, z, need: need.get(id), owned: ownedOf(Number(id)) })).filter(x => x.c);
    const entries = zone(d.cards, 'd'), sideE = zone(d.side, 's');
    // une ligne par carte (deck + side) pour les manquantes, la banlist et les prix
    const uniq = [...need].map(([id, q]) => ({ c: card(Number(id)), q, owned: ownedOf(Number(id)) })).filter(x => x.c);
    const missingList = uniq.filter(x => x.q > x.owned);
    const miss = new Set(missingList.map(x => x.c.i));
    const pick = arr => st.deckView === 'miss' ? arr.filter(x => miss.has(x.c.i)) : arr;
    const shown = pick(entries), shownSide = pick(sideE);
    const dq = (q, z) => `<div class="qty"><button data-y="dq" data-z="${z}" data-d="-1" aria-label="Retirer">−</button><output>${q}</output><button data-y="dq" data-z="${z}" data-d="1" aria-label="Ajouter">+</button></div>`;
    const ownTxt = x => x.owned >= x.need ? `<span class="own">${x.owned} possédée${x.owned > 1 ? 's' : ''}</span>` : `<span class="miss">il en manque ${x.need - x.owned}</span>`;
    const tile = x => `<div class="gcard${x.owned >= x.need ? ' own' : ' short'}" data-id="${x.c.i}">
        <button class="pic" data-y="card" aria-label="Détails de ${esc(label(x.c))}">${imgTag(x.c.i)}${banIcon(x.c)}<span class="badge">×${x.q}</span></button>
        <div class="cap"><span class="num">${ownTxt(x)}</span>${esc(label(x.c))}${priceTag(x.c.i)}</div>${dq(x.q, x.z)}</div>`;
    const row = x => `
      <div class="yrow${x.owned >= x.need ? ' ok' : ' short'}" data-id="${x.c.i}">
        <button class="ypic" data-y="card">${imgTag(x.c.i)}</button>
        <div class="yinfo"><button class="nm" data-y="card">${esc(label(x.c))}</button>${sub(x.c) ? `<span class="en">${esc(sub(x.c))}</span>` : ''}
          <span class="meta">${banTag(x.c)}${x.need > banMax(x.c) ? `<span class="miss">max ${banMax(x.c)} (deck + side)</span>` : ''}${ownTxt(x)}${x.owned < x.need ? `<span>(${x.owned} possédée${x.owned > 1 ? 's' : ''})</span>` : ''}${priceTag(x.c.i)}</span></div>
        ${dq(x.q, x.z)}</div>`;
    const group = (title, arr) => { if (!arr.length) return ''; arr.sort((a, b) => label(a.c).localeCompare(label(b.c), 'fr')); return `<h4>${title} <span class="num">${arr.reduce((a, x) => a + x.q, 0)}</span></h4>` + (gal() ? `<div class="gal">${arr.map(tile).join('')}</div>` : arr.map(row).join('')); };
    const main = shown.filter(x => !isExtra(x.c)), extra = shown.filter(x => isExtra(x.c));
    const mainCount = entries.filter(x => !isExtra(x.c)).reduce((a, x) => a + x.q, 0);
    const extraCount = entries.filter(x => isExtra(x.c)).reduce((a, x) => a + x.q, 0);
    const sideCount = sideE.reduce((a, x) => a + x.q, 0);
    const banBad = uniq.filter(x => x.q > banMax(x.c));
    const results = searchCards(st.deckQ, 30);
    const cm = missingList.map(x => Core.cmLine(x.q - x.owned, x.c.n)).join('\n');
    const deckValue = uniq.reduce((a, x) => a + x.q * (x.c.cm || 0), 0);
    const missValue = missingList.reduce((a, x) => a + (x.q - x.owned) * (x.c.cm || 0), 0);
    const q = $('ydQ'), hadFocus = q && document.activeElement === q, caret = q ? q.selectionStart : 0;
    box.innerHTML = `
      <div class="sheet-head"><input id="ydName" class="dname" value="${esc(d.name || '')}" aria-label="Nom du deck">
        <button class="close" data-y="close">Fermer</button></div>
      <p class="hint">${mainCount} cartes dans le Main Deck${extraCount ? ` · ${extraCount} dans l'Extra Deck` : ''}${sideCount ? ` · ${sideCount} dans le Side Deck` : ''} · ${missingList.length ? `<b class="miss">${missingList.reduce((a, x) => a + x.q - x.owned, 0)} carte(s) manquante(s)</b>` : 'tu as toutes les cartes'}
        ${deckValue ? `<br>Prix du deck ≈ <b class="price">${money(deckValue)}</b>${missValue ? ` · ce qu'il te manque ≈ <b class="price miss">${money(missValue)}</b>` : ''} <span class="hint">(Cardmarket, ${pricesDate()})</span>` : ''}</p>
      ${banBad.length ? `<p class="banwarn">⚠ Pas conforme à la banlist TCG : ${banBad.map(x => `${esc(label(x.c))} (${x.q}, max ${banMax(x.c)})`).join(' · ')}${sideCount ? ' <span class="hint">(deck + side)</span>' : ''}</p>` : ''}
      <div class="ydeckbar">
        <input type="search" id="ydQ" placeholder="Ajouter une carte : nom (français ou anglais) ou code…" value="${esc(st.deckQ)}">
        <div class="seg" id="ydView"><button data-v="all" aria-pressed="${st.deckView === 'all'}">Toutes</button><button data-v="miss" aria-pressed="${st.deckView === 'miss'}">Manquantes</button></div>
        ${layoutSeg('ydLayout')}
      </div>
      ${st.deckQ ? `<div class="yresults">${results.length ? results.map(c => resultHtml(c, `<div class="yadd2"><button class="primary" data-y="dadd">+ Deck</button><button data-y="sadd" title="Ajouter au Side Deck">+ Side</button></div>`)).join('') : '<p class="hint">Aucune carte trouvée.</p>'}</div>` : ''}
      <div class="ydecklist">${group('Main Deck', main)}${group('Extra Deck', extra)}${group('Side Deck', shownSide)}${!shown.length && !shownSide.length ? `<p class="hint">${st.deckView === 'miss' ? 'Aucune carte manquante.' : 'Deck vide : cherche une carte au-dessus pour l\'ajouter.'}</p>` : ''}</div>
      ${missingList.length ? `<div class="ycm"><h4>Manquantes pour ta wishlist Cardmarket</h4>
        <textarea id="ydCm" readonly rows="${Math.min(8, missingList.length)}">${esc(cm)}</textarea>
        <div class="actions"><span class="hint grow">Cardmarket → Wishlist → « Ajouter des cartes » : colle la liste (une carte par ligne).</span><button class="primary" data-y="copy">Copier la liste</button></div></div>` : ''}
      <div class="actions"><button data-y="exportYdk" title="Pour les simulateurs : EDOPro, Dueling Book, YGOPRODeck…">Exporter (.ydk)</button><span class="grow"></span><button class="danger" data-y="delDeck">Supprimer ce deck</button></div>`;
    if (hadFocus || keepFocus) { const n = $('ydQ'); n.focus(); try { n.setSelectionRange(caret, caret); } catch (e) { /* rien */ } }
    loadImages(box);
  }

  // ---------- Wishlist (dans l'onglet, pas dans une fenêtre) ----------
  function renderWish(keepFocus) {
    const box = $('ygoList'); if (!box) return;
    const d = decks()[WISH] && !decks()[WISH].deleted ? decks()[WISH] : { cards: {} };
    const entries = Object.entries(d.cards || {}).map(([id, q]) => ({ c: card(Number(id)), q, owned: ownedOf(Number(id)) })).filter(x => x.c)
      .sort((a, b) => label(a.c).localeCompare(label(b.c), 'fr'));
    const total = entries.reduce((a, x) => a + x.q, 0);
    const value = entries.reduce((a, x) => a + x.q * (x.c.cm || 0), 0);
    const cm = entries.map(x => Core.cmLine(x.q, x.c.n)).join('\n');
    const results = searchCards(st.wishQ || '', 30);
    const wq = q => `<div class="qty"><button data-y="wq" data-d="-1" aria-label="Retirer de la wishlist">−</button><output>${q}</output><button data-y="wq" data-d="1" aria-label="En vouloir une de plus">+</button></div>`;
    const ownTxt = o => o ? `<span class="own">déjà ${o} dans ta collection</span>` : '';
    const q0 = $('ywQ'), hadFocus = q0 && document.activeElement === q0, caret = q0 ? q0.selectionStart : 0;
    box.innerHTML = `<div class="ywish">
      <p class="hint">Les cartes que tu veux, en dehors de tes decks. ${total ? `<b>${total}</b> carte${total > 1 ? 's' : ''}${value ? ` · ≈ <b class="price">${money(value)}</b> <span class="hint">(Cardmarket, ${pricesDate()})</span>` : ''}` : ''}</p>
      <div class="ydeckbar">
        <input type="search" id="ywQ" placeholder="Ajouter une carte à la wishlist : nom (français ou anglais) ou code…" value="${esc(st.wishQ || '')}">
        ${layoutSeg('ywLayout')}
      </div>
      ${st.wishQ ? `<div class="yresults">${results.length ? results.map(c => resultHtml(c, `<button class="primary" data-y="wadd">+ Wishlist</button>`)).join('') : '<p class="hint">Aucune carte trouvée.</p>'}</div>` : ''}
      ${entries.length ? (gal() ? `<div class="gal">${entries.map(({ c, q, owned }) => `<div class="gcard own" data-id="${c.i}">
          <button class="pic" data-y="card" aria-label="Détails de ${esc(label(c))}">${imgTag(c.i)}${banIcon(c)}<span class="badge">×${q}</span></button>
          <div class="cap"><span class="num">${ownTxt(owned)}</span>${esc(label(c))}${priceTag(c.i, q)}</div>${wq(q)}</div>`).join('')}</div>`
        : entries.map(({ c, q, owned }) => `<div class="yrow" data-id="${c.i}">
          <button class="ypic" data-y="card">${imgTag(c.i)}</button>
          <div class="yinfo"><button class="nm" data-y="card">${esc(label(c))}</button>${sub(c) ? `<span class="en">${esc(sub(c))}</span>` : ''}
            <span class="meta">${ownTxt(owned)}${priceTag(c.i, q)}</span></div>${wq(q)}</div>`).join(''))
        : `<p class="empty">Ta wishlist est vide : cherche une carte au-dessus, ou ouvre la fiche d'une carte et touche « Ajouter à la wishlist ».</p>`}
      ${entries.length ? `<div class="ycm"><h4>Pour ta wishlist Cardmarket</h4>
        <textarea id="ywCm" readonly rows="${Math.min(8, entries.length)}">${esc(cm)}</textarea>
        <div class="actions"><span class="hint grow">Cardmarket → Wishlist → « Ajouter des cartes » : colle la liste (une carte par ligne).</span>
          <button data-y="wclear">Vider la wishlist</button><button class="primary" data-y="wcopy">Copier la liste</button></div></div>` : ''}
    </div>`;
    if (hadFocus || keepFocus) { const n = $('ywQ'); n.focus(); try { n.setSelectionRange(caret, caret); } catch (e) { /* rien */ } }
    loadImages(box);
  }
  function addToWish(id, delta = 1) {
    const d = wishDeck(); d.cards = d.cards || {};
    const n = (d.cards[id] || 0) + delta;
    if (n > 0) d.cards[id] = n; else delete d.cards[id];
    touchDeck(d);
    return n;
  }

  // ---------- Fiche d'une carte (toutes ses impressions) ----------
  let cardBack = null;
  function openCard(id, back) {
    const c = card(id); if (!c) return;
    cardBack = back || null;
    App.openModal(`<div id="ycardSheet" data-id="${id}"></div>`, 'tcg ygo wide', 'ygo-card');
    renderCard();
  }
  function renderCard() {
    const box = $('ycardSheet'); if (!box) return;
    const c = card(Number(box.dataset.id)); if (!c) return;
    const gen = col()[`${c.i}|*`];
    const prints = c.p.map((p, pi) => ({ p, pi, e: col()[keyFor(p[1], p[2], curLang())], all: qtyAny(p[1], p[2]) }))
      .sort((a, b) => ((b.e && b.e.qty) || 0) - ((a.e && a.e.qty) || 0) || a.p[1].localeCompare(b.p[1]));
    const ds = liveDecks();
    box.innerHTML = `
      <div class="sheet-head"><div><h3>${esc(label(c))}</h3>${sub(c) ? `<div class="meta">${esc(sub(c))}</div>` : ''}</div>
        <button data-y="${cardBack ? 'back' : 'close'}">${cardBack ? '← Retour' : 'Fermer'}</button></div>
      <div class="split">
        <div class="ycol">${imgTag(c.i, 'big')}${c.x ? `<div class="ytext">${esc(c.x)}</div>` : (st.db.v < 3 ? `<p class="hint">Le texte de la carte arrive à la prochaine mise à jour de la base.</p>` : '')}</div>
        <div style="display:flex;flex-direction:column;gap:12px;min-width:0">
          <dl class="kv"><dt>Type</dt><dd>${esc(c.ty)}${c.r ? ' · ' + esc(c.r) : ''}${c.a ? ' · ' + esc(c.a) : ''}</dd>
            ${c.l !== '' ? `<dt>${/link/.test(c.t) ? 'Lien' : /xyz/.test(c.t) ? 'Rang' : 'Niveau'}</dt><dd>${c.l}</dd>` : ''}
            ${c.k !== '' ? `<dt>ATK / DEF</dt><dd>${c.k} / ${c.d === '' ? '—' : c.d}</dd>` : ''}
            <dt>Dans ta collection</dt><dd><b>${ownedOf(c.i)}</b></dd>
            <dt>Banlist TCG</dt><dd>${c.b != null ? banTag(c) : 'Illimitée (3)'}</dd>
            ${c.cm ? `<dt>Prix Cardmarket</dt><dd><b class="price">${money(c.cm)}</b> <span class="hint">(prix de référence, toutes éditions)</span></dd>` : ''}</dl>
          <div class="actions" style="justify-content:flex-start">
            ${ds.length ? `<select id="ycDeck">${ds.map(([id, d]) => `<option value="${id}">${esc(d.name || 'Deck')}</option>`).join('')}</select><button data-y="toDeck">Ajouter au deck</button>` : ''}
            <button data-y="toWish">☆ Ajouter à la wishlist${decks()[WISH] && !decks()[WISH].deleted && (decks()[WISH].cards || {})[c.i] ? ` (${decks()[WISH].cards[c.i]})` : ''}</button>
            <a data-y="cm">Voir sur Cardmarket ↗</a></div>
          <h4 class="yaddh">Ajouter à ma collection ${langSelect('ycLang')}</h4>
          <div class="yprints">
            <div class="yprint" data-gen="1"><div><b>Peu importe l'extension</b></div>${App.qtyHtml((gen && gen.qty) || 0)}</div>
            ${prints.map(({ p, pi, e, all }) => `<div class="yprint${all ? ' own' : ''}" data-pi="${pi}">
              <div><span class="code">${esc(locCode(p[1], curLang()))}</span>${all > ((e && e.qty) || 0) ? ` <span class="own">+${all - ((e && e.qty) || 0)} autre langue</span>` : ''} <span class="tag">${esc(p[3] || p[2])}</span><div class="hint">${esc(setName(p[0]))}</div></div>
              ${App.qtyHtml((e && e.qty) || 0)}</div>`).join('')}
          </div>
        </div></div>`;
    loadImages(box);
  }

  // ---------- Ajout de cartes à la collection ----------
  function openAdd() {
    App.openModal(`
      <div class="sheet-head"><h3>Ajouter des cartes</h3><button class="close" data-y="close">Fermer</button></div>
 <div class="ydeckbar">${langSelect('yaLang')}<input type="search" id="yaQ" placeholder="Nom de carte (français ou anglais), code (SGX1-FRA18) ou extension…" value="${esc(st.addQ)}" autofocus></div>
      <div class="yresults" id="yaRes"></div>`, 'tcg ygo wide', 'ygo-add');
    renderAdd();
  }
  // ---------- Extensions : toutes les cartes d'une extension, pour la compléter ----------
  function searchSets(q, max = 8) {
    q = q.trim().toLowerCase(); if (q.length < 2) return [];
    const words = q.split(/\s+/), uq = q.toUpperCase();
    const out = [];
    st.db.sets.forEach((x, i) => {
      if (!st.idx.bySet.has(i)) return;
      const name = x[0].toLowerCase();
      if (words.every(w => name.includes(w)) || (x[1] && x[1].toUpperCase() === uq)) out.push(i);
    });
    return out.sort((a, b) => (st.db.sets[b][2] || '').localeCompare(st.db.sets[a][2] || '')).slice(0, max);
  }
  function setPrints(i) {
    return (st.idx.bySet.get(i) || []).map(([ci, pi]) => ({ ci, pi, c: st.db.cards[ci], p: st.db.cards[ci].p[pi] }))
      .sort((a, b) => a.p[1].localeCompare(b.p[1], 'en', { numeric: true }) || a.p[2].localeCompare(b.p[2]));
  }
  const qtyOf = (code, r) => qtyAny(code, r);
  const qtyLang = (code, r) => { const e = col()[keyFor(code, r, curLang())]; return (e && e.qty) || 0; };
  // Progression : un numéro de carte compte comme possédé si tu as au moins une de ses raretés
  function setProgress(i) {
    const codes = new Map();
    for (const x of setPrints(i)) codes.set(x.p[1], (codes.get(x.p[1]) || 0) + qtyOf(x.p[1], x.p[2]));
    let own = 0; for (const q of codes.values()) if (q > 0) own++;
    return { own, total: codes.size };
  }
  const rarName = p => p[3] || p[2];
  // Manquantes : sans filtre, un numéro manque si tu n'en as aucune rareté ;
  // avec une rareté choisie, chaque version de cette rareté compte à part.
  function setMissing(i) {
    const all = setPrints(i), r = st.setRarity;
    if (r) return all.filter(y => rarName(y.p) === r && !qtyOf(y.p[1], y.p[2]));
    return all.filter(y => !all.some(z => z.p[1] === y.p[1] && qtyOf(z.p[1], z.p[2]) > 0));
  }
  function setMissingText(i) {
    const seen = new Set(), lines = [];
    for (const x of setMissing(i)) {
      if (seen.has(x.p[1] + '|' + (st.setRarity ? x.p[2] : ''))) continue;
      seen.add(x.p[1] + '|' + (st.setRarity ? x.p[2] : ''));
      lines.push(`1 ${x.c.n} (${setName(i)})`);
    }
    return lines.join('\n');
  }
  // Progression par rareté : nombre de versions possédées / nombre de versions de cette rareté
  function rarityProgress(i) {
    const m = new Map();
    for (const x of setPrints(i)) {
      const k = rarName(x.p); const v = m.get(k) || { own: 0, total: 0 };
      v.total++; if (qtyOf(x.p[1], x.p[2]) > 0) v.own++; m.set(k, v);
    }
    return [...m.entries()].sort((a, b) => b[1].total - a[1].total || a[0].localeCompare(b[0]));
  }
  function renderSet(el) {
    const i = st.addSet, x = st.db.sets[i];
    const { own, total } = setProgress(i);
    const rars = rarityProgress(i);
    if (st.setRarity && !rars.some(([k]) => k === st.setRarity)) st.setRarity = null;
    const allV = rars.reduce((a, [, v]) => ({ own: a.own + v.own, total: a.total + v.total }), { own: 0, total: 0 });
    let rows = setPrints(i);
    if (st.setRarity) rows = rows.filter(y => rarName(y.p) === st.setRarity);
    if (st.setView === 'miss') { const m = new Set(setMissing(i)); rows = rows.filter(y => m.has(y) || [...m].some(z => z.ci === y.ci && z.pi === y.pi)); }
    const miss = setMissingText(i);
    const cur = st.setRarity ? rars.find(([k]) => k === st.setRarity)[1] : null;
    el.innerHTML = `<div class="yset-head">
        <button data-y="unset">← Retour</button>
        <div class="grow"><b>${esc(x[0])}</b> <span class="code">${esc(x[1] || '')}</span>${x[2] ? ` <span class="hint">${esc(x[2].slice(0, 4))}</span>` : ''}
          <div class="bar"><i style="width:${(cur ? (cur.total ? cur.own / cur.total : 0) : (total ? own / total : 0)) * 100}%"></i></div>
          <span class="hint">${cur ? `<b>${cur.own}</b> / ${cur.total} en ${esc(st.setRarity)}` : `<b>${own}</b> / ${total} cartes de l'extension · ${allV.own} / ${allV.total} versions (toutes raretés)`}${(() => { const seen = new Set(); let v = 0; for (const y of setMissing(i)) { if (seen.has(y.p[1])) continue; seen.add(y.p[1]); v += y.c.cm || 0; } return v ? ` · manquantes ≈ <b class="price">${money(v)}</b>` : ''; })()}</span></div>
        <div class="seg" id="ysView"><button data-sv="all" aria-pressed="${st.setView === 'all'}">Toutes</button><button data-sv="miss" aria-pressed="${st.setView === 'miss'}">Manquantes</button></div>
        ${miss ? `<button data-y="copySet" title="Format wishlist Cardmarket : 1 Nom (Extension)">Copier les manquantes</button>` : ''}
        ${rars.length > 1 ? `<div class="yrars"><button class="chip" data-rar="" aria-pressed="${!st.setRarity}">Toutes raretés</button>${rars.map(([k, v]) => `<button class="chip${v.own === v.total ? ' done' : ''}" data-rar="${esc(k)}" aria-pressed="${st.setRarity === k}">${esc(k)} <b>${v.own}/${v.total}</b></button>`).join('')}</div>` : ''}</div>
      <textarea id="ysCm" hidden readonly>${esc(miss)}</textarea>
      ${rows.length ? rows.map(({ ci, pi, c, p }) => { const q = qtyLang(p[1], p[2]), all = qtyOf(p[1], p[2]); return `<div class="yres${all ? ' owned' : ''}" data-id="${c.i}">
        <button class="ypic" data-y="card">${imgTag(c.i)}</button>
        <div class="yinfo"><button class="nm" data-y="card">${esc(label(c))}</button>${sub(c) ? `<span class="en">${esc(sub(c))}</span>` : ''}
          <span class="meta"><span class="code">${esc(locCode(p[1], curLang()))}</span><span class="rar">${esc(rarName(p))}</span>${all > q ? `<span class="own">${all - q} dans une autre langue</span>` : ''}</span></div>
        <div class="yquick" data-ci="${ci}" data-pi="${pi}">${App.qtyHtml(q)}</div></div>`; }).join('') : `<p class="hint">${st.setView === 'miss' ? 'Rien ne manque ici.' : 'Aucune carte.'}</p>`}`;
    loadImages(el);
  }

  function renderAdd() {
    const el = $('yaRes'); if (!el) return;
    if (st.addSet != null) return renderSet(el);
    const q = st.addQ.trim();
    if (!q) { el.innerHTML = `<p class="hint">Tape quelques lettres : la recherche porte sur les ${st.db.cards.length.toLocaleString('fr-FR')} cartes du jeu.</p>`; return; }
    const nq = Core.ygoNormCode(q.toUpperCase());
    const exact = st.idx.byNorm.get(nq) || [];
    const res = searchCards(q);
    const sets = searchSets(q);
    el.innerHTML = (sets.length ? `<h4>Extensions</h4><div class="ysets">${sets.map(i => { const { own, total } = setProgress(i); const x = st.db.sets[i];
      return `<button class="yset" data-y="set" data-set="${i}"><b>${esc(x[0])}</b><span class="hint">${esc(x[1] || '')}${x[2] ? ' · ' + esc(x[2].slice(0, 4)) : ''} · ${own}/${total}</span></button>`; }).join('')}</div>${res.length || exact.length ? '<h4>Cartes</h4>' : ''}` : '') + (exact.length ? exact.map(([ci, pi]) => {
      const c = st.db.cards[ci], p = c.p[pi], e = col()[keyFor(p[1], p[2], curLang())];
      return resultHtml(c, `<div class="yquick" data-ci="${ci}" data-pi="${pi}"><span class="code">${esc(locCode(p[1], curLang()))}</span> <span class="tag">${esc(p[3] || p[2])}</span>${App.qtyHtml((e && e.qty) || 0)}</div>`);
    }).join('') : '') + (res.length ? res.map(c => resultHtml(c, `<button data-y="card">Choisir l'extension</button>`)).join('') : (exact.length || sets.length ? '' : '<p class="hint">Aucune carte ni extension trouvée.</p>'));
    loadImages(el);
  }

  function refreshOpenModal() {
    const k = App.modalKind;
    if (k === 'ygo-deck') renderDeck();
    else if (k === 'ygo-card') renderCard();
    else if (k === 'ygo-add') renderAdd();
  }

  // ---------- Événements ----------
  $('ygoView').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    st.view = b.dataset.v; App.data.settings.ygoView = st.view; App.scheduleSave(); render();
  });
  $('ygoTools').addEventListener('click', e => {
    const b = e.target.closest('[data-y]'); if (!b) return;
    if (b.dataset.y === 'add') return st.db ? openAdd() : refreshDb();
    if (b.dataset.y === 'newDeck') return st.db ? newDeck() : refreshDb();
    if (b.dataset.y === 'importYdk') return st.db ? importYdk() : refreshDb();
  });
  $('ygoTools').addEventListener('click', e => { const b = e.target.closest('#ygoLayout button'); if (b) setLayout(b.dataset.v); });
  let wishTimer = null;
  $('ygoList').addEventListener('input', e => {
    if (e.target.id === 'ywQ') { st.wishQ = e.target.value; clearTimeout(wishTimer); wishTimer = setTimeout(() => renderWish(true), 200); }
  });
  $('ygoTools').addEventListener('input', e => { if (e.target.id === 'ygoQ') { st.q = e.target.value; render(); } });
  $('ygoTools').addEventListener('change', e => { if (e.target.id === 'ygoSort') { st.sort = e.target.value; st.colSet = null; App.data.settings.ygoSort = st.sort; App.scheduleSave(); render(); } });
  $('ygoList').addEventListener('click', async e => {
    const b = e.target.closest('[data-y],[data-act],[data-v]'); if (!b) return;
    if (b.dataset.y === 'dl') return refreshDb();
    if (st.view === 'wish') {
      const y = b.dataset.y, row = b.closest('[data-id]');
      if (b.dataset.v && b.closest('#ywLayout')) return setLayout(b.dataset.v);
      if (y === 'wadd' && row) { const n = addToWish(Number(row.dataset.id), 1); App.toast(`Ajoutée à la wishlist (×${n})`); return render(); }
      if (y === 'wq' && row) { addToWish(Number(row.dataset.id), Number(b.dataset.d)); return render(); }
      if (y === 'wcopy') {
        const t = $('ywCm'); let ok = false;
        try { await navigator.clipboard.writeText(t.value); ok = true; } catch (err) { t.removeAttribute('readonly'); t.select(); try { ok = document.execCommand('copy'); } catch (e2) { ok = false; } t.setAttribute('readonly', ''); }
        return App.toast(ok ? 'Liste copiée : colle-la dans ta wishlist Cardmarket' : 'Sélectionne le texte et copie-le à la main');
      }
      if (y === 'wclear') {
        if (b.dataset.sure) { const d = wishDeck(); d.cards = {}; touchDeck(d); return render(); }
        b.dataset.sure = '1'; b.textContent = 'Confirmer : tout vider'; return;
      }
      if (y === 'card' && row) return openCard(Number(row.dataset.id));
      return;
    }
    if (b.dataset.y === 'colSet') { st.colSet = Number(b.dataset.set); render(); $('ygoList').scrollTop = 0; const sh = $('ygoList').closest('.shelf'); if (sh) sh.scrollTop = 0; return; }
    if (b.dataset.y === 'colSetBack') { st.colSet = null; return render(); }
    if (b.dataset.y === 'colSetOpen') { st.addQ = ''; st.addSet = st.colSet; st.setView = 'all'; st.setRarity = null; return openAdd(); }
    if (b.dataset.y === 'deck') return openDeck(b.dataset.deck);
    const row = b.closest('[data-id]');
    if (b.dataset.y === 'card' && row) return openCard(Number(row.dataset.id));
    if (b.dataset.act && row && row.dataset.key) {
      const key = row.dataset.key;
      changeEntry(key, col()[key], b.dataset.act === 'inc' ? 1 : -1);
      render();
    }
  });

  let addTimer = null, deckTimer = null;
  $('sheet').addEventListener('input', e => {
    if (e.target.id === 'yaQ') { st.addQ = e.target.value; st.addSet = null; clearTimeout(addTimer); addTimer = setTimeout(renderAdd, 150); }
    if (e.target.id === 'ydQ') { st.deckQ = e.target.value; clearTimeout(deckTimer); deckTimer = setTimeout(() => renderDeck(true), 200); }
  });
  $('sheet').addEventListener('change', e => {
    if (e.target.id === 'yaLang' || e.target.id === 'ycLang') { App.data.settings.ygoLang = e.target.value; App.scheduleSave(); refreshOpenModal(); return; }
    if (e.target.id === 'ydName') { const d = decks()[st.deckId]; if (d) { d.name = e.target.value.trim() || 'Deck sans nom'; touchDeck(d); render(); } }
  });
  $('sheet').addEventListener('click', async e => {
    const k = App.modalKind; if (!k || !k.startsWith('ygo')) return;
    const b = e.target.closest('[data-y],[data-act],[data-v],[data-sv],[data-rar]'); if (!b) return;
    const y = b.dataset.y;
    if (y === 'close') return App.closeModal();
    if (y === 'back') { const back = cardBack; cardBack = null; return back && back(); }
    const row = b.closest('[data-id]');
    if (y === 'card' && row) {
      const back = k === 'ygo-add' ? openAdd : k === 'ygo-deck' ? (() => openDeck(st.deckId, true)) : null;
      return openCard(Number(row.dataset.id), back);
    }
    // fiche carte : quantités par impression
    if (k === 'ygo-card' && b.dataset.act) {
      const id = Number($('ycardSheet').dataset.id), pr = b.closest('.yprint');
      const delta = b.dataset.act === 'inc' ? 1 : -1;
      if (pr.dataset.gen) addGeneric(id, delta); else addPrinting(st.idx.byId.get(id), Number(pr.dataset.pi), delta);
      renderCard(); render(); return;
    }
    if (k === 'ygo-card' && y === 'toWish') {
      const id = Number($('ycardSheet').dataset.id); const n = addToWish(id, 1);
      App.toast(`Ajoutée à la wishlist (×${n})`); renderCard(); render(); return;
    }
    if (k === 'ygo-card' && y === 'toDeck') {
      const d = decks()[$('ycDeck').value]; const id = Number($('ycardSheet').dataset.id);
      if (d) { d.cards = d.cards || {}; d.cards[id] = (d.cards[id] || 0) + 1; touchDeck(d); App.toast(`Ajoutée à ${d.name}`); render(); }
      return;
    }
    if (k === 'ygo-card' && y === 'cm') {
      const c = card(Number($('ycardSheet').dataset.id));
      return window.coffre.openExternal(`https://www.cardmarket.com/fr/YuGiOh/Products/Search?searchString=${encodeURIComponent(c.n)}`);
    }
    // ajout rapide par code exact
    if (k === 'ygo-add' && b.dataset.rar != null) { st.setRarity = b.dataset.rar || null; return renderAdd(); }
    if (k === 'ygo-add' && y === 'set') { st.addSet = Number(b.dataset.set); st.setView = 'all'; st.setRarity = null; $('yaRes').scrollTop = 0; return renderAdd(); }
    if (k === 'ygo-add' && y === 'unset') { st.addSet = null; return renderAdd(); }
    if (k === 'ygo-add' && b.dataset.sv) { st.setView = b.dataset.sv; return renderAdd(); }
    if (k === 'ygo-add' && y === 'copySet') {
      const text = $('ysCm').value; let ok = false;
      try { await navigator.clipboard.writeText(text); ok = true; } catch (err) { ok = false; }
      App.toast(ok ? 'Manquantes copiées : colle-les dans ta wishlist Cardmarket' : 'Copie impossible sur cet appareil');
      return;
    }
    if (k === 'ygo-add' && b.dataset.act) {
      const q = b.closest('.yquick');
      addPrinting(Number(q.dataset.ci), Number(q.dataset.pi), b.dataset.act === 'inc' ? 1 : -1);
      renderAdd(); render(); return;
    }
    // deck
    if (k === 'ygo-deck') {
      const d = decks()[st.deckId]; if (!d) return;
      d.cards = d.cards || {};
      if (b.dataset.v && b.closest('#ydLayout')) { setLayout(b.dataset.v); return renderDeck(); }
      if (b.dataset.v) { st.deckView = b.dataset.v; return renderDeck(); }
      if (y === 'dadd' && row) { const id = Number(row.dataset.id); d.cards[id] = (d.cards[id] || 0) + 1; touchDeck(d); renderDeck(); render(); return; }
      if (y === 'sadd' && row) { const id = Number(row.dataset.id); d.side = d.side || {}; d.side[id] = (d.side[id] || 0) + 1; touchDeck(d); renderDeck(); render(); return; }
      if (y === 'dq' && row) {
        const part = b.dataset.z === 's' ? (d.side = d.side || {}) : d.cards;
        const id = Number(row.dataset.id); const n = (part[id] || 0) + Number(b.dataset.d);
        if (n > 0) part[id] = n; else delete part[id];
        touchDeck(d); renderDeck(); render(); return;
      }
      if (y === 'copy') {
        const text = $('ydCm').value;
        let ok = false;
        try { await navigator.clipboard.writeText(text); ok = true; } catch (err) { /* repli ci-dessous */ }
        if (!ok) { const t = $('ydCm'); t.removeAttribute('readonly'); t.select(); try { ok = document.execCommand('copy'); } catch (err) { ok = false; } t.setAttribute('readonly', ''); }
        App.toast(ok ? 'Liste copiée : colle-la dans ta wishlist Cardmarket' : 'Sélectionne le texte et copie-le à la main');
        return;
      }
      if (y === 'exportYdk') {
        try {
          const r = await window.coffre.saveText((d.name || 'deck') + '.ydk', toYdk(d), 'ydk');
          if (r && r.ok) App.toast('Deck exporté : ' + r.path);
        } catch (err) { App.toast("Export impossible : " + (err.message || err)); }
        return;
      }
      if (y === 'delDeck') {
        if (b.dataset.sure) { decks()[st.deckId] = { deleted: true, mt: now() }; App.scheduleSave(); App.closeModal(); render(); App.toast('Deck supprimé'); }
        else { b.dataset.sure = '1'; b.textContent = 'Confirmer la suppression'; }
      }
    }
  });

  // ---------- Pour le scan (appli Android) ----------
  // Cherche les impressions correspondant aux codes lus sur une carte (ex. SGX1-FRA18 → SGX1-ENA18).
  function lookupCodes(codes) {
    if (!st.idx) return [];
    const out = [];
    for (const code of codes) {
      const hit = st.idx.byNorm.get(Core.ygoNormCode(code));
      if (hit) { out.push({ code, prints: hit.map(([ci, pi]) => ({ ci, pi, card: st.db.cards[ci], p: st.db.cards[ci].p[pi] })) }); }
    }
    return out;
  }

  // Anciennes cartes européennes : extension sous un autre préfixe, et numéros différents
  // (ex. LDD-F092 = Légende du Dragon Blanc aux Yeux Bleus = LOB en anglais). On les retrouve par le nom.
  const PREFIX_ALIAS = { LDD: 'LOB', DDY: 'SDY', MIY: 'SDY', BIY: 'SDY', DIY: 'SDY', DDK: 'SDK', MIK: 'SDK', BIK: 'SDK', DIK: 'SDK', DDP: 'SDP', MIP: 'SDP', BIP: 'SDP', DIP: 'SDP' };
  const normName = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  let nameIdx = null;
  function nameIndex() {
    if (nameIdx && nameIdx.db === st.db) return nameIdx;
    const map = new Map(), list = [], byPrefix = new Map();
    st.db.cards.forEach((c, ci) => {
      for (const p of c.p) { const px = p[1].split('-')[0]; if (!byPrefix.has(px)) byPrefix.set(px, new Set()); byPrefix.get(px).add(ci); }
      for (const n of [c.n, c.f]) {
        const k = normName(n); if (!k) continue;
        if (!map.has(k)) { map.set(k, ci); list.push([k, ci]); }
      }
    });
    nameIdx = { db: st.db, map, list, byPrefix };
    return nameIdx;
  }
  function editDistance(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i]; let best = i;
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (cur[j] < best) best = cur[j];
      }
      if (best > max) return max + 1;
      prev = cur;
    }
    return prev[b.length];
  }
  // Lignes lues dans le haut de la carte (là où est le nom). Sans position connue, les premières lignes.
  function topLines(lines, h) {
    const all = (lines || []).slice().sort((a, b) => (a.y || 0) - (b.y || 0));
    const top = h ? all.filter(l => (l.y || 0) < h * 0.3) : all.slice(0, 5);
    return top.map(l => normName(l.text)).filter(t => t.replace(/[^a-z]/g, '').length >= 5).slice(0, 5);
  }
  // Nom de la carte lu en haut (français ou anglais), avec une petite tolérance aux erreurs de lecture.
  // Les noms très courts (moins de 5 lettres) ne suffisent pas : un mot lu ailleurs (« PAGE » d'un clavier) donnait « Péage ».
  function findByName(cand, onlyIn) {
    const ni = nameIndex();
    let best = null;
    for (const t of cand) {
      if (ni.map.has(t) && (!onlyIn || onlyIn.has(ni.map.get(t)))) return ni.map.get(t);
      const max = Math.max(1, Math.floor(t.length * 0.12));
      for (const [k, ci] of ni.list) {
        if (k.length < 5 || (onlyIn && !onlyIn.has(ci))) continue;
        const d = editDistance(t, k, max);
        if (d <= max && (!best || d / k.length < best.score)) best = { ci, score: d / k.length };
      }
    }
    return best ? best.ci : null;
  }
  // Le nom lu ressemble-t-il à celui de cette carte ? (tolérance plus large : on vérifie, on ne cherche pas)
  function nameMatches(cand, c) {
    const names = [c.n, c.f].map(normName).filter(Boolean);
    return cand.some(t => names.some(k => {
      if (k.includes(t) || t.includes(k)) return true;
      const max = Math.max(2, Math.floor(k.length * 0.3));
      return editDistance(t, k, max) <= max;
    }));
  }
  // Ce que le scan a lu → impressions possibles. D'abord le code exact, sinon le nom de la carte.
  // Langue d'après le code imprimé : DUAD-FR053 → FR, LDD-F092 → FR
  const LANG_OF = { EN: 'EN', E: 'EN', FR: 'FR', F: 'FR', DE: 'DE', G: 'DE', IT: 'IT', I: 'IT', SP: 'ES', ES: 'ES', S: 'ES', PT: 'PT', P: 'PT' };
  function langOfCode(code) {
    const m = String(code || '').match(/^[A-Z0-9]+-(EN|FR|DE|IT|SP|ES|PT|E|F|G|I|S|P)(?=[A-Z]?\d)/);
    return m ? LANG_OF[m[1]] : '';
  }
  // Résultat : { card, prints, code, lang, lcode, byName?, fixed?, unsure?, sure? }
  //  sure   : assez fiable pour l'ajout automatique
  //  unsure : le code est lu mais le nom lu en haut ne correspond pas → à confirmer d'un toucher
  function lookupScan(res) {
    if (!st.idx) return null;
    const codes = Core.ygoCodesInText(res && res.text);
    const cand = topLines(res && res.lines, res && res.h);
    const prefixes = codes.map(x => x.split('-')[0]).map(x => PREFIX_ALIAS[x] || x);
    const lang = codes.map(langOfCode).find(Boolean) || '';
    const hits = lookupCodes(codes);
    if (hits.length) {
      for (const h of hits) { h.lang = langOfCode(h.code) || lang; h.lcode = locCode(h.prints[0].p[1], h.lang || curLang()); }   // code de la base, dans la langue lue
      // 1. Un des codes lus est celui de la carte dont on lit le nom (ou pas de nom lisible) : sûr
      if (!cand.length) { hits[0].sure = true; return hits[0]; }
      for (const h of hits) if (nameMatches(cand, h.prints[0].card)) { h.sure = true; return h; }
      // Le nom lu n'est pas celui du code : un chiffre a sans doute été mal lu (RA05 lu RA03…).
      const hit = hits[0];
      const px = hit.prints[0].p[1].split('-')[0];
      // 2. La carte de la même extension qui porte ce nom
      const ci = findByName(cand, nameIndex().byPrefix.get(px));
      if (ci != null && ci !== hit.prints[0].ci) {
        const c = st.db.cards[ci];
        const prints = c.p.map((p, pi) => ({ ci, pi, card: c, p })).filter(x => x.p[1].split('-')[0] === px);
        if (prints.length) return { code: '', byName: true, fixed: true, card: c, prints, lang: hit.lang, lcode: '' };
      }
      // 3. La carte qui porte ce nom, dans toute la base : on garde ses impressions dont le code ressemble au code lu
      const cg = findByName(cand);
      if (cg != null) {
        const c = st.db.cards[cg];
        const all = c.p.map((p, pi) => ({ ci: cg, pi, card: c, p }));
        const read = codes.map(Core.ygoNormCode);
        const dist = x => Math.min(...read.map(r => editDistance(r, Core.ygoNormCode(x.p[1]), 2)));
        const near = all.filter(x => dist(x) <= 2);
        if (near.length) {
          const best = Math.min(...near.map(dist));
          const top = near.filter(x => dist(x) === best);
          // un seul caractère d'écart et une seule impression possible : assez sûr pour l'ajout automatique
          return { code: '', byName: true, fixed: true, sure: best <= 1 && top.length === 1, card: c, prints: top, lang: hit.lang, lcode: '' };
        }
        return { code: '', byName: true, fixed: true, card: c, prints: all, lang: hit.lang, lcode: '' };
      }
      hit.unsure = true;
      return hit;
    }
    const ci = findByName(cand);
    if (ci == null) return null;
    const c = st.db.cards[ci];
    let prints = c.p.map((p, pi) => ({ ci, pi, card: c, p }));
    // Le préfixe lu (ex. LDD → LOB) indique l'extension, même si le numéro diffère
    const inSet = prints.filter(x => prefixes.includes(x.p[1].split('-')[0]));
    if (inSet.length) prints = inSet;
    // Reconnue par son nom : le code viendra de la base (impression choisie), jamais de la lecture
    return { code: '', byName: true, sure: !!inSet.length, card: c, prints, lang, lcode: '' };
  }

  window.CoffreYgo = {
    // Carte Forbidden Memories → carte du jeu réel (par mot de passe, sinon par nom), pour la wishlist Cardmarket
    matchCard(name, passcode) {
      if (!st.db) return null;
      const id = parseInt(passcode, 10);
      if (id && st.idx.byId.has(id)) return st.db.cards[st.idx.byId.get(id)];
      const ci = nameIndex().map.get(normName(name));
      return ci != null ? st.db.cards[ci] : null;
    },
    get dbReady() { return !!st.db; },
    money: v => eur.format(v || 0),
    render, refreshDb, lookupCodes, lookupScan, locCode, curLang, addGeneric: id => addGeneric(id, 1), removeGeneric: id => addGeneric(id, -1), addPrinting, openCard, label,
    get ready() { return !!st.db; },
    imgTag, loadImages, validPrinted, repairCodes, toYdk, parseYdk,
    ownedOf
  };
  // Répare les codes mal lus enregistrés par d'anciennes versions du scan (« MP24-NT27 » → MP24-FR127)
  function repairCodes() {
    let n = 0;
    for (const [k, e] of Object.entries(col())) {
      if (!e || !e.code || !e.lcode || validPrinted(e.lcode, e.code)) continue;
      col()[k] = { ...e, lcode: locCode(e.code, e.lang || 'EN'), mt: now() }; n++;
    }
    if (n) App.scheduleSave();
    return n;
  }
  const start = () => { if (['name', 'added', 'code', 'set'].includes(App.data.settings.ygoSort)) st.sort = App.data.settings.ygoSort; st.view = ['decks', 'wish'].includes(App.data.settings.ygoView) ? App.data.settings.ygoView : 'col'; repairCodes(); render(); loadDb(); };
  if (window.coffreReady) start(); else document.addEventListener('coffre:ready', start, { once: true });
})();
