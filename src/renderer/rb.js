// Coffre — onglet Riftbound (jeu de cartes League of Legends) : toutes les cartes du jeu (base Riftcodex,
// prix TCGplayer, assemblées chaque jour par la tâche GitHub scripts/riftbound.js), ta collection
// (par version : normale, art alternatif, signature… ou « peu importe la version »), les extensions à compléter,
// tes decks (Légende, deck principal, runes, champs de bataille), ta wishlist et les listes pour Cardmarket.
(function () {
  'use strict';
  const App = window.CoffreApp;
  const Core = window.CoffreCore;
  const $ = id => document.getElementById(id);
  const esc = App.esc;
  const now = () => Date.now();

  const st = { db: null, idx: null, loading: false, error: '', view: 'col', q: '', sort: 'name', addQ: '', addSet: null, setView: 'all', setRarity: null, deckId: '', deckView: 'all', deckQ: '', wishQ: '' };

  // ---------- Base de cartes ----------
  function setDb(db) {
    if (!db || !db.cards) return;
    st.db = db; st.idx = Core.opIndex(db);
  }
  async function loadDb() {
    try { setDb(await window.coffre.rbDb()); } catch (e) { /* pas encore téléchargée */ }
    render();
    // Mise à jour discrète (nouvelles cartes, prix) tous les 2 jours : le fichier est refait chaque jour sur GitHub
    if (st.db && (st.db.v !== 1 || now() - (st.db.got || st.db.at || 0) > 2 * 864e5)) refreshDb(true);
  }
  async function refreshDb(silent) {
    if (st.loading) return;
    st.loading = true; st.error = '';
    if (!silent) render();
    try { const db = await window.coffre.rbRefresh(); if (db) db.got = now(); setDb(db); if (!silent) App.toast('Base de cartes Riftbound à jour'); }
    catch (e) { st.error = "Impossible de télécharger la base de cartes : " + String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''); }
    st.loading = false;
    render();
  }

  // Extension pas encore sortie : étiquette « à venir · 30/10 »
  const setDate = i => (st.db.sets[i] || [])[4] || '';
  const isUpcoming = i => { const d = Date.parse(setDate(i)); return !!d && d > now() - 864e5; };
  const upTag = i => isUpcoming(i) ? `<span class="soon" title="Pas encore sortie : cartes révélées, infos provisoires">à venir · ${esc(new Date(Date.parse(setDate(i))).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }))}</span>` : '';
  const card = id => st.idx && st.idx.byId.has(id) ? st.db.cards[st.idx.byId.get(id)] : null;
  const setName = i => (st.db.sets[i] || [''])[0];
  const setCode = i => (st.db.sets[i] || ['', ''])[1];
  const label = c => c.n;
  // Zones d'un deck Riftbound : Légende (1), deck principal (40), runes (12), champs de bataille (3)
  const zoneOf = c => { const t = String(c.t || '').toLowerCase(); return t === 'legend' ? 'legend' : t === 'battlefield' ? 'bf' : t === 'rune' ? 'rune' : 'main'; };
  const isLeader = c => zoneOf(c) === 'legend';
  const ZONES = [['legend', 'Légende', 1], ['main', 'Deck principal', 40], ['rune', 'Runes', 12], ['bf', 'Champs de bataille', 3]];
  const zoneName = z => (ZONES.find(x => x[0] === z) || ['', 'Deck'])[1];
  const gal = () => App.data.settings.rbLayout !== 'list';
  const layoutSeg = id => `<div class="seg" id="${id}"><button data-v="gal" aria-pressed="${gal()}">Galerie</button><button data-v="list" aria-pressed="${!gal()}">Liste</button></div>`;
  function setLayout(v) { App.data.settings.rbLayout = v; App.scheduleSave(); render(); }
  // Version d'une impression : « Rare », « Showcase · Art alternatif »…
  const RAR = { common: 'Commune', uncommon: 'Peu commune', rare: 'Rare', epic: 'Épique', showcase: 'Showcase', promo: 'Promo' };
  const rarName = p => [RAR[String(p[2] || '').toLowerCase()] || p[2], p[3]].filter(Boolean).join(' · ') || '?';
  const printImg = (c, p) => (p && p[5]) || c.im;

  const CAT = { unit: 'Unité', spell: 'Sort', gear: 'Équipement', rune: 'Rune', legend: 'Légende', battlefield: 'Champ de bataille', token: 'Jeton' };
  const COLORS = { fury: 'Fureur', calm: 'Calme', mind: 'Esprit', body: 'Corps', chaos: 'Chaos', order: 'Ordre', colorless: 'Incolore' };
  const catFr = c => [CAT[String(c.t || '').toLowerCase()] || c.t || '', c.st && !/^(none|null)$/i.test(c.st) ? c.st : ''].filter(Boolean).join(' · ');
  const colorFr = c => String(c.co || '').split(/[\s/]+/).filter(Boolean).map(x => COLORS[x.toLowerCase()] || x).join(' / ');

  // ---------- Images (téléchargées une fois, puis gardées sur l'appareil) ----------
  const imgTag = (img, cls = '') => `<img class="yimg ${cls}" data-rb="${esc(img || '')}" alt="" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7">`;
  // Carte sans image (cartes à venir : TCGplayer ne les a pas encore mises en ligne)
  const noImg = img => { const d = document.createElement('div'); d.className = img.className.replace('yimg', 'yimg noimgbox'); d.innerHTML = '<span>Image pas encore disponible</span>'; img.replaceWith(d); };
  let io = null;
  function loadImages(root) {
    const imgs = (root || document).querySelectorAll('img[data-rb]:not([data-done])');
    const go = img => {
      img.dataset.done = '1';
      if (!img.dataset.rb) { noImg(img); return; }
      window.coffre.rbImg(img.dataset.rb).then(u => { if (u) img.src = u; else noImg(img); });
    };
    if (!('IntersectionObserver' in window)) { imgs.forEach(go); return; }
    if (!io) io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { io.unobserve(e.target); go(e.target); } }), { rootMargin: '300px' });
    imgs.forEach(img => io.observe(img));
  }

  // ---------- Collection ----------
  // data.op[clé] = { id: code de la carte, k: clé de la version, lang, qty, mt }
  // clé = « version » (anglais), « version|FR », « version|JP », ou « code|* » (peu importe la version)
  const col = () => App.data.rb || (App.data.rb = {});
  // Index des quantités (par carte et par version), recalculé seulement après un changement
  let qix = null;
  function qIndex() {
    if (qix && qix.src === col()) return qix;
    const byId = new Map(), byKey = new Map();
    for (const e of Object.values(col())) {
      if (!e || !e.qty) continue;
      byId.set(e.id, (byId.get(e.id) || 0) + e.qty);
      if (e.k) byKey.set(e.k, (byKey.get(e.k) || 0) + e.qty);
    }
    qix = { src: col(), byId, byKey, prog: new Map() };
    return qix;
  }
  const dirty = () => { qix = null; };
  function ownedOf(id) { return qIndex().byId.get(id) || 0; }
  function changeEntry(key, base, delta) {
    const e = { ...(col()[key] || base) };
    e.qty = Math.max(0, (e.qty || 0) + delta);
    e.mt = now();
    col()[key] = e;
    dirty();
    App.scheduleSave();
    return e.qty;
  }
  // Langue de la carte physique (le code est le même dans toutes les langues)
  const LANGS = ['FR', 'EN', 'ZH'];
  const curLang = () => LANGS.includes(App.data.settings.rbLang) ? App.data.settings.rbLang : 'FR';
  const keyFor = (pkey, lang) => pkey + (lang && lang !== 'EN' ? '|' + lang : '');
  const langSelect = id => `<select id="${id}" class="ylang" aria-label="Langue de tes cartes" title="Langue de tes cartes">${LANGS.map(l => `<option${l === curLang() ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
  function addPrinting(ci, pi, delta = 1, lang) {
    const c = st.db.cards[ci], p = c.p[pi];
    lang = lang || curLang();
    const base = { id: c.i, k: p[1] };
    if (lang !== 'EN') base.lang = lang;
    return changeEntry(keyFor(p[1], lang), base, delta);
  }
  // Exemplaires d'une version, toutes langues confondues
  function qtyAny(pkey) { return qIndex().byKey.get(pkey) || 0; }
  const qtyLang = pkey => { const e = col()[keyFor(pkey, curLang())]; return (e && e.qty) || 0; };
  function addGeneric(id, delta = 1) { return changeEntry(`${id}|*`, { id, k: '' }, delta); }
  // Depuis un deck : une seule version → on ajoute celle-là ; sinon « peu importe la version » (modifiable dans la fiche)
  function addOneToCollection(id) {
    const c = card(id); if (!c) return;
    const ci = st.db.cards.indexOf(c);
    if (c.p && c.p.length === 1 && ci >= 0) addPrinting(ci, 0, 1); else addGeneric(c.i, 1);
    const n = ownedOf(c.i);
    App.toast(`${label(c)} ajoutée à ta collection (${n} possédée${n > 1 ? 's' : ''})`);
  }
  const entryPrint = e => { if (!e || !e.k || !st.idx.byKey.has(e.k)) return null; const [ci, pi] = st.idx.byKey.get(e.k); return st.db.cards[ci].p[pi]; };

  // ---------- Prix (TCGplayer, en dollars) ----------
  const usd = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'USD' });
  const money = v => usd.format(v || 0);
  const priceOf = id => { const c = card(id); return (c && c.cm) || 0; };
  const entryPrice = e => { const p = entryPrint(e); return (p && p[4]) || priceOf(e.id); };
  const tag = v => v ? `<span class="price">${money(v)}</span>` : '';
  const priceTag = (id, qty = 1) => tag(priceOf(id) * qty);
  const pricesDate = () => st.db ? new Date(st.db.at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) : '';
  const priceSrc = () => `<span class="hint" title="Prix du marché TCGplayer (États-Unis), en dollars, mis à jour chaque jour">(TCGplayer, ${pricesDate()})</span>`;

  function stats() {
    let copies = 0, value = 0; const ids = new Set();
    for (const e of Object.values(col())) if (e && e.qty > 0) { copies += e.qty; ids.add(e.id); if (st.db) value += entryPrice(e) * e.qty; }
    $('rbStats').innerHTML = `<b>${ids.size}</b> cartes · ${copies} exemplaires${st.db ? ` · valeur ≈ <b class="price">${money(value)}</b> ${priceSrc()}` : ''} · ${liveDecks().length} decks${wishCount() ? ` · ${wishCount()} en wishlist` : ''}`;
    $('tabRbCount').textContent = ids.size;
  }

  // ---------- Rendu de l'onglet ----------
  function toolsHtml() {
    if (st.view === 'wish') return '';
    if (st.view === 'decks') return `<button class="primary" data-r="newDeck">Nouveau deck</button><button data-r="importList" title="Decklist texte : une carte par ligne (« 3 Jinx - Rebel » ou « 3 OGN-202 »)">Importer une decklist</button>`;
    return `<button class="primary" data-r="add">Ajouter des cartes</button>
      <input type="search" id="rbQ" placeholder="Filtrer ma collection (nom, code)…" value="${esc(st.q)}">
      ${layoutSeg('rbLayout')}
      <select id="rbSort" aria-label="Trier"><option value="name">Par nom</option><option value="added">Derniers ajouts</option><option value="code">Par code</option><option value="price">Par prix (plus chères d'abord)</option></select>`;
  }

  // Après un changement dans une fenêtre : on redessine la fenêtre, la liste derrière à la fermeture
  let listDirty = false;
  function afterChange() {
    if (!$('modal').hidden) { stats(); listDirty = true; refreshOpenModal(); }
    else render();
  }
  document.addEventListener('coffre:modalclose', () => { if (listDirty) { listDirty = false; render(); } });
  function render() {
    if (!$('rbList') || !App.data) return;
    dirty();
    stats();
    $('rbView').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === st.view)));
    const tools = $('rbTools');
    if (tools.dataset.view !== st.view) {
      tools.innerHTML = toolsHtml(); tools.dataset.view = st.view;
      const s = $('rbSort'); if (s) s.value = st.sort;
    }
    const ls = $('rbLayout'); if (ls) ls.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.v === 'gal') === gal())));
    const list = $('rbList');
    if (!st.db) {
      list.innerHTML = `<div class="empty">
        <p>Pour voir toutes les cartes Riftbound, Coffre doit d'abord télécharger la base de cartes (Riftcodex, avec les prix TCGplayer : toutes les extensions, les promos et les versions spéciales, y compris les cartes déjà révélées des extensions à venir). Ça se fait une seule fois, puis elle se met à jour toute seule.</p>
        ${st.loading ? `<p><b>Téléchargement en cours…</b> (quelques secondes)</p>` : `<button class="primary" data-r="dl">Télécharger la base de cartes</button>`}
        ${st.error ? `<p class="error">${esc(st.error)}</p>` : ''}</div>`;
      return;
    }
    if (st.view === 'wish') renderWish();
    else list.innerHTML = st.view === 'decks' ? decksHtml() : collectionHtml();
    loadImages(list);
    refreshOpenModal();
  }

  function collectionHtml() {
    const q = st.q.trim().toLowerCase();
    const rows = [];
    for (const [key, e] of Object.entries(col())) {
      if (!e || !(e.qty > 0)) continue;
      const c = card(e.id); if (!c) continue;
      if (q && !c.s.includes(q)) continue;
      rows.push({ key, e, c, p: entryPrint(e) });
    }
    if (!rows.length) {
      return `<div class="empty">${Object.keys(col()).length && q ? 'Aucune carte ne correspond.' : "Ta collection est vide. Touche « Ajouter des cartes » pour chercher dans toutes les cartes du jeu ou compléter une extension" + (App.info.platform === 'mobile' ? ', ou scanne le numéro imprimé en bas de la carte (ex. OGN · 030/298).' : '.')}</div>`;
    }
    const by = { name: (a, b) => label(a.c).localeCompare(label(b.c), 'fr') || a.c.i.localeCompare(b.c.i), added: (a, b) => (b.e.mt || 0) - (a.e.mt || 0), code: (a, b) => a.c.i.localeCompare(b.c.i, 'en', { numeric: true }),
      price: (a, b) => entryPrice(b.e) - entryPrice(a.e) || label(a.c).localeCompare(label(b.c), 'fr') };
    rows.sort(by[st.sort] || by.name);
    if (gal()) return `<div class="gal">` + rows.map(({ key, e, c, p }) => `<div class="gcard own" data-key="${esc(key)}" data-id="${esc(c.i)}">
        <button class="pic" data-r="card" aria-label="Détails de ${esc(label(c))}">${imgTag(printImg(c, p))}<span class="badge">×${e.qty}</span></button>
        <div class="cap"><span class="num">${esc(p ? p[1] : c.i)} · ${p ? esc(rarName(p)) : 'toute version'}${e.lang ? ' · ' + esc(e.lang) : ''}</span>${tag(entryPrice(e))}${esc(label(c))}</div>${App.qtyHtml(e.qty)}</div>`).join('') + `</div>`;
    return rows.map(({ key, e, c, p }) => `<div class="yrow" data-key="${esc(key)}" data-id="${esc(c.i)}">
        <button class="ypic" data-r="card">${imgTag(printImg(c, p))}</button>
        <div class="yinfo"><button class="nm" data-r="card">${esc(label(c))}</button>
          <span class="meta"><span class="code">${esc(p ? p[1] : c.i)}</span>${e.lang ? `<span class="tag">${esc(e.lang)}</span>` : ''}${p ? `<span>${esc(rarName(p))}</span><span>${esc(setName(p[0]))}</span>${upTag(p[0])}` : `<span class="tag">peu importe la version</span>`}${tag(entryPrice(e))}</span></div>
        ${App.qtyHtml(e.qty)}</div>`).join('');
  }

  // ---------- Decks ----------
  const decks = () => App.data.rbdecks || (App.data.rbdecks = {});
  const WISH = 'wishlist';
  const liveDecks = () => Object.entries(decks()).filter(([id, d]) => d && !d.deleted && id !== WISH);
  function wishDeck() {
    const d = decks()[WISH];
    if (!d || d.deleted) decks()[WISH] = { name: 'Wishlist', cards: {}, wish: true, created: now(), mt: now() };
    return decks()[WISH];
  }
  function wishCount() { const d = decks()[WISH]; return d && !d.deleted ? Object.values(d.cards || {}).reduce((a, q) => a + q, 0) : 0; }
  function deckCounts(d) {
    let total = 0, missing = 0;
    for (const [id, q] of Object.entries(d.cards || {})) { total += q; missing += Math.max(0, q - ownedOf(id)); }
    return { total, missing };
  }
  function missingCost(d) {
    let v = 0;
    for (const [id, q] of Object.entries(d.cards || {})) v += Math.max(0, q - ownedOf(id)) * priceOf(id);
    return v;
  }
  function decksHtml() {
    const ds = liveDecks().sort((a, b) => (b[1].mt || 0) - (a[1].mt || 0));
    if (!ds.length) return `<div class="empty">Aucun deck. Touche « Nouveau deck », choisis ta Légende et ajoute des cartes, même celles que tu n'as pas encore : Coffre te dira lesquelles manquent.</div>`;
    return `<div class="ydecks">` + ds.map(([id, d]) => {
      const { total, missing } = deckCounts(d);
      const lead = deckCover(d);
      return `<button class="ydeck" data-r="deck" data-deck="${id}">
        <span class="ycover">${lead ? imgTag(lead.im) : ''}</span>
        <span class="t">${esc(d.name || 'Deck sans nom')}</span>
        <span class="a">${total} cartes · ${missing ? `<b class="miss">${missing} manquante${missing > 1 ? 's' : ''}</b>` : 'complet'}${missingCost(d) ? ` · ≈ ${money(missingCost(d))} à acheter` : ''}</span></button>`;
    }).join('') + `</div>`;
  }

  function newDeck() {
    const id = 'd' + now().toString(36) + Math.random().toString(36).slice(2, 6);
    decks()[id] = { name: 'Nouveau deck', cards: {}, created: now(), mt: now() };
    App.scheduleSave();
    render();
    openDeck(id);
  }
  function touchDeck(d) { d.mt = now(); App.scheduleSave(); }
  // Carte de couverture : celle choisie (si elle est encore dans le deck), sinon la Légende
  function deckCover(d) {
    if (d.cover && d.cards && d.cards[d.cover] && card(d.cover)) return card(d.cover);
    const ids = Object.keys(d.cards || {});
    return ids.map(card).find(c => c && isLeader(c)) || card(ids[0]);
  }
  function coverSelect(id, d, list) {
    const cur = d.cover && list.some(c => c.i === d.cover) ? d.cover : '';
    const opts = list.slice().sort((a, b) => (isLeader(b) - isLeader(a)) || label(a).localeCompare(label(b), 'fr'));
    return `<label class="dcover">Carte de couverture <select id="${id}"><option value="">Automatique (la Légende)</option>${opts.map(c => `<option value="${esc(c.i)}"${c.i === cur ? ' selected' : ''}>${esc(label(c))} · ${esc(c.i)}</option>`).join('')}</select></label>`;
  }

  // Recherche dans toutes les cartes du jeu (nom, code, type)
  function searchCards(q, max = 60) {
    q = q.trim().toLowerCase();
    if (!q || !st.db) return [];
    const out = [];
    const exact = card(q.toUpperCase().replace(/\s+/g, ''));
    if (exact) out.push(exact);
    const words = q.split(/\s+/);
    const starts = [], contains = [];
    for (const c of st.db.cards) {
      if (c === exact) continue;
      if (!words.every(w => c.s.includes(w))) continue;
      (c.n.toLowerCase().startsWith(q) || c.i.toLowerCase().startsWith(q) ? starts : contains).push(c);
      if (starts.length >= max) break;
    }
    return out.concat(starts, contains).slice(0, max);
  }
  const statLine = c => [catFr(c), colorFr(c), c.c !== '' ? `énergie ${c.c}` : '', c.pw !== '' && c.pw != null ? `puissance ${c.pw}` : '', c.m !== '' && c.m != null ? `force ${c.m}` : ''].filter(Boolean).join(' · ');
  const resultHtml = (c, act) => `<div class="yres" data-id="${esc(c.i)}">
      <button class="ypic" data-r="card">${imgTag(c.im)}</button>
      <div class="yinfo"><button class="nm" data-r="card">${esc(label(c))}</button><span class="en">${esc(c.i)}</span>
        <span class="meta"><span>${esc(statLine(c))}</span>${ownedOf(c.i) ? `<span class="own">${ownedOf(c.i)} dans ta collection</span>` : ''}</span></div>
      ${act}</div>`;

  function openDeck(id, keep) {
    if (!keep) { st.deckQ = ''; st.deckView = 'all'; }
    st.deckId = id;
    App.openModal(`<div id="rdeckSheet"></div>`, 'tcg rb wide', 'rb-deck');
    renderDeck();
  }
  function renderDeck(keepFocus) {
    const box = $('rdeckSheet'); if (!box) return;
    const d = decks()[st.deckId]; if (!d || d.deleted) { App.closeModal(); return; }
    const entries = Object.entries(d.cards || {}).map(([id, q]) => ({ c: card(id), q, owned: ownedOf(id) })).filter(x => x.c);
    const missingList = entries.filter(x => x.q > x.owned);
    const shown = st.deckView === 'miss' ? missingList : entries;
    const cadd = c => `<button class="coladd" data-r="cadd" title="Ajouter 1 exemplaire de ${esc(label(c))} à ta collection">+1 collection</button>`;
    const dq = q => `<div class="qty"><button data-r="dq" data-d="-1" aria-label="Retirer du deck">−</button><output>${q}</output><button data-r="dq" data-d="1" aria-label="Ajouter au deck">+</button></div>`;
    const ownTxt = (q, owned) => owned >= q ? `<span class="own">${owned} possédée${owned > 1 ? 's' : ''}</span>` : `<span class="miss">il en manque ${q - owned}</span>`;
    const sortFn = (a, b) => (Number(a.c.c) || 0) - (Number(b.c.c) || 0) || label(a.c).localeCompare(label(b.c), 'fr');
    // Au plus 3 exemplaires d'une même carte (sauf les runes de base)
    const over = x => zoneOf(x.c) === 'main' && x.q > 3;
    const group = (title, arr, max) => arr.length ? `<h4>${title} <span class="num">${arr.reduce((a, x) => a + x.q, 0)}${max ? ' / ' + max : ''}</span></h4>` + (gal()
      ? `<div class="gal">${arr.sort(sortFn).map(({ c, q, owned }) => `<div class="gcard${owned >= q ? ' own' : ' short'}" data-id="${esc(c.i)}">
          <button class="pic" data-r="card" aria-label="Détails de ${esc(label(c))}">${imgTag(c.im)}<span class="badge">×${q}</span></button>
          <div class="cap"><span class="num">${ownTxt(q, owned)}</span>${esc(label(c))}${priceTag(c.i)}</div>${cadd(c)}${dq(q)}</div>`).join('')}</div>`
      : arr.sort(sortFn).map(({ c, q, owned }) => `
      <div class="yrow${owned >= q ? ' ok' : ' short'}" data-id="${esc(c.i)}">
        <button class="ypic" data-r="card">${imgTag(c.im)}</button>
        <div class="yinfo"><button class="nm" data-r="card">${esc(label(c))}</button><span class="en">${esc(c.i)} · ${esc(statLine(c))}</span>
          <span class="meta">${q > 3 && zoneOf(c) === 'main' ? '<span class="miss">max 3</span>' : ''}${ownTxt(q, owned)}${owned < q ? `<span>(${owned} possédée${owned > 1 ? 's' : ''})</span>` : ''}${priceTag(c.i)}</span></div>
        ${cadd(c)}${dq(q)}</div>`).join('')) : '';
    const count = z => entries.filter(x => zoneOf(x.c) === z).reduce((a, x) => a + x.q, 0);
    const overList = entries.filter(over);
    const results = searchCards(st.deckQ, 30);
    const cm = missingList.map(x => cmLine(x.q - x.owned, x.c)).join('\n');
    const deckValue = entries.reduce((a, x) => a + x.q * (x.c.cm || 0), 0);
    const missValue = missingList.reduce((a, x) => a + (x.q - x.owned) * (x.c.cm || 0), 0);
    const q = $('rdQ'), hadFocus = q && document.activeElement === q, caret = q ? q.selectionStart : 0;
    box.innerHTML = `
      <div class="sheet-head"><input id="rdName" class="dname" value="${esc(d.name || '')}" aria-label="Nom du deck">
        <button class="close" data-r="close">Fermer</button></div>
      ${entries.length ? coverSelect('rdCover', d, entries.map(x => x.c)) : ''}
      <p class="hint">${ZONES.map(([z, n, max]) => `${n} : ${count(z)}/${max}`).join(' · ')} · ${missingList.length ? `<b class="miss">${missingList.reduce((a, x) => a + x.q - x.owned, 0)} carte(s) manquante(s)</b>` : 'tu as toutes les cartes'}
        ${deckValue ? `<br>Prix du deck ≈ <b class="price">${money(deckValue)}</b>${missValue ? ` · ce qu'il te manque ≈ <b class="price miss">${money(missValue)}</b>` : ''} ${priceSrc()}` : ''}</p>
      ${overList.length ? `<p class="banwarn">⚠ Au plus 3 exemplaires d'une même carte : ${overList.map(x => `${esc(label(x.c))} (${x.q})`).join(' · ')}</p>` : ''}
      <div class="ydeckbar">
        <input type="search" id="rdQ" placeholder="Ajouter une carte : nom ou code (OGN-030)…" value="${esc(st.deckQ)}">
        <div class="seg" id="rdView"><button data-v="all" aria-pressed="${st.deckView === 'all'}">Toutes</button><button data-v="miss" aria-pressed="${st.deckView === 'miss'}">Manquantes</button></div>
        ${layoutSeg('rdLayout')}
      </div>
      ${st.deckQ ? `<div class="yresults">${results.length ? results.map(c => resultHtml(c, `<button class="primary" data-r="dadd">+ ${zoneOf(c) === 'main' ? 'Deck' : esc(zoneName(zoneOf(c)).replace(/s$/, '').replace('Champs de', 'Champ de'))}</button>`)).join('') : '<p class="hint">Aucune carte trouvée.</p>'}</div>` : ''}
      <div class="ydecklist">${ZONES.map(([z, n, max]) => group(n, shown.filter(x => zoneOf(x.c) === z), max)).join('')}${!shown.length ? `<p class="hint">${st.deckView === 'miss' ? 'Aucune carte manquante.' : 'Deck vide : cherche ta Légende, tes cartes, tes runes et tes champs de bataille au-dessus pour les ajouter.'}</p>` : ''}</div>
      ${missingList.length ? `<div class="ycm"><h4>Manquantes pour ta wishlist Cardmarket</h4>
        <textarea id="rdCm" readonly rows="${Math.min(8, missingList.length)}">${esc(cm)}</textarea>
        <div class="actions"><span class="hint grow">Cardmarket → Wishlist → « Ajouter des cartes » : colle la liste (une carte par ligne).</span><button class="primary" data-r="copy">Copier la liste</button></div></div>` : ''}
      ${Object.keys(d.cards || {}).length ? `<div class="ycm"><h4>Decklist</h4>
        <textarea id="rdList" readonly rows="${Math.min(12, Object.keys(d.cards || {}).length)}" spellcheck="false">${esc(toDecklist(d))}</textarea>
        <div class="actions"><span class="hint grow">Une carte par ligne, par zone : à partager ou à réimporter.</span><button data-r="saveList">Enregistrer (.txt)</button><button class="primary" data-r="copyList">Copier la decklist</button></div></div>` : ''}
      <div class="actions"><button class="danger" data-r="delDeck">Supprimer ce deck</button></div>`;
    if (hadFocus || keepFocus) { const n = $('rdQ'); n.focus(); try { n.setSelectionRange(caret, caret); } catch (e) { /* rien */ } }
    loadImages(box);
  }
  // Ligne pour la wishlist Cardmarket : « 2x Jinx - Rebel »
  const cmLine = (qty, c) => `${qty}x ${c.n}`;

  // ---------- Decklists texte : « 3 Jinx - Rebel », une carte par ligne, rangées par zone ----------
  const ZONE_EN = { legend: 'Legend', main: 'Main Deck', rune: 'Runes', bf: 'Battlefields' };
  function toDecklist(d) {
    const rows = Object.entries(d.cards || {}).map(([id, q]) => ({ c: card(id), id, q })).filter(x => x.c);
    const out = [];
    for (const [z] of ZONES) {
      const r = rows.filter(x => zoneOf(x.c) === z).sort((a, b) => (Number(a.c.c) || 0) - (Number(b.c.c) || 0) || label(a.c).localeCompare(label(b.c), 'en'));
      if (!r.length) continue;
      if (out.length) out.push('');
      out.push(ZONE_EN[z] + ':', ...r.map(x => `${x.q} ${x.c.n}`));
    }
    return out.join('\n');
  }
  // Nom simplifié pour comparer « Jinx - Rebel », « Jinx, Rebel », « jinx rebel »…
  const normName = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\((alternate art|overnumbered|signature)\)/g, '').replace(/[^a-z0-9']+/g, ' ').trim();
  let byNorm = null;
  function cardByName(t) {
    if (!byNorm || byNorm.db !== st.db) { byNorm = { db: st.db, m: new Map() }; for (const c of st.db.cards) { const k = normName(c.n); if (!byNorm.m.has(k) || zoneOf(c) === 'main') byNorm.m.set(k, c); } }
    return byNorm.m.get(normName(t)) || null;
  }
  function cardByCode(code) {
    const k = String(code || '').trim(), m = k.match(/^([A-Za-z0-9]{2,4})-([A-Za-z]*)(\d{1,3})([a-z*]?)$/i);
    if (!m) return null;
    const key = `${m[1].toUpperCase()}-${m[2].toUpperCase()}${m[2] ? m[3] : m[3].padStart(3, '0')}${(m[4] || '').toLowerCase().replace('*', 's')}`;
    if (card(key)) return card(key);
    const hit = st.idx.byKey.get(key); return hit ? st.db.cards[hit[0]] : null;
  }
  function parseDecklist(text) {
    const cards = {}, unknown = []; let lines = 0;
    for (const raw of String(text || '').replace(/^﻿/, '').split(/\r?\n/)) {
      const t = raw.trim(); if (!t || /:\s*$/.test(t) || /^(#|\/\/)/.test(t)) continue;   // titres de zone (« Main Deck: »), commentaires
      const m = t.match(/^(\d+)\s*[x×*]?\s+(.+)$/i) || t.match(/^(\d+)[x×*](.+)$/i) || t.match(/^(.+?)\s+[x×*]\s*(\d+)$/i);
      let q = 1, name = t;
      if (m) { if (/^\d+$/.test(m[1])) { q = Number(m[1]); name = m[2]; } else { name = m[1]; q = Number(m[2]); } }
      name = name.trim();
      lines++;
      const c = cardByCode(name) || cardByCode((name.match(/\(([^)]+)\)\s*$/) || [])[1]) || cardByName(name.replace(/\s*\([^)]*\)\s*$/, ''));
      if (!c) { unknown.push(name); continue; }
      cards[c.i] = (cards[c.i] || 0) + Math.max(1, q || 1);
    }
    return { cards, unknown, lines };
  }
  function openImport() {
    App.openModal(`
      <div class="sheet-head"><h3>Importer une decklist</h3><button class="close" data-r="close">Fermer</button></div>
      <p class="hint">Colle la decklist (une carte par ligne, ex. <code>3 Jinx - Rebel</code> ou <code>3 OGN-202</code> ; les titres comme <code>Main Deck:</code> sont ignorés), ou ouvre un fichier .txt.</p>
      <label class="f">Nom du deck<input id="riName" value="Deck importé"></label>
      <textarea id="riText" rows="14" placeholder="Legend:&#10;1 Jinx - Loose Cannon&#10;&#10;Main Deck:&#10;3 Jinx - Rebel&#10;…" spellcheck="false"></textarea>
      <p class="hint" id="riMsg"></p>
      <div class="actions"><button data-r="impFile">Ouvrir un fichier .txt</button><span class="grow"></span><button class="primary" data-r="impGo">Créer le deck</button></div>`, 'tcg rb wide', 'rb-import');
    setTimeout(() => { const t = $('riText'); if (t) t.focus(); }, 50);
  }
  function importDecklist() {
    const { cards, unknown } = parseDecklist($('riText').value);
    if (!Object.keys(cards).length) { $('riMsg').textContent = unknown.length ? `Aucune carte reconnue (inconnues : ${unknown.slice(0, 8).join(', ')}).` : 'Aucune carte trouvée : une ligne par carte, au format « 3 Jinx - Rebel ».'; return; }
    const id = 'd' + now().toString(36) + Math.random().toString(36).slice(2, 6);
    decks()[id] = { name: ($('riName').value || '').trim().slice(0, 60) || 'Deck importé', cards, created: now(), mt: now() };
    App.scheduleSave(); render(); openDeck(id);
    App.toast(unknown.length ? `Deck importé (${unknown.length} carte${unknown.length > 1 ? 's' : ''} inconnue${unknown.length > 1 ? 's' : ''} : ${unknown.slice(0, 4).join(', ')})` : 'Deck importé');
  }

  // ---------- Wishlist (dans l'onglet) ----------
  function renderWish(keepFocus) {
    const box = $('rbList'); if (!box) return;
    const d = decks()[WISH] && !decks()[WISH].deleted ? decks()[WISH] : { cards: {} };
    const entries = Object.entries(d.cards || {}).map(([id, q]) => ({ c: card(id), q, owned: ownedOf(id) })).filter(x => x.c)
      .sort((a, b) => label(a.c).localeCompare(label(b.c), 'fr'));
    const total = entries.reduce((a, x) => a + x.q, 0);
    const value = entries.reduce((a, x) => a + x.q * (x.c.cm || 0), 0);
    const cm = entries.map(x => cmLine(x.q, x.c)).join('\n');
    const results = searchCards(st.wishQ || '', 30);
    const wq = q => `<div class="qty"><button data-r="wq" data-d="-1" aria-label="Retirer de la wishlist">−</button><output>${q}</output><button data-r="wq" data-d="1" aria-label="En vouloir une de plus">+</button></div>`;
    const ownTxt = o => o ? `<span class="own">déjà ${o} dans ta collection</span>` : '';
    const q0 = $('rwQ'), hadFocus = q0 && document.activeElement === q0, caret = q0 ? q0.selectionStart : 0;
    box.innerHTML = `<div class="ywish">
      <p class="hint">Les cartes que tu veux, en dehors de tes decks. ${total ? `<b>${total}</b> carte${total > 1 ? 's' : ''}${value ? ` · ≈ <b class="price">${money(value)}</b> ${priceSrc()}` : ''}` : ''}</p>
      <div class="ydeckbar">
        <input type="search" id="rwQ" placeholder="Ajouter une carte à la wishlist : nom ou code…" value="${esc(st.wishQ || '')}">
        ${layoutSeg('rwLayout')}
      </div>
      ${st.wishQ ? `<div class="yresults">${results.length ? results.map(c => resultHtml(c, `<button class="primary" data-r="wadd">+ Wishlist</button>`)).join('') : '<p class="hint">Aucune carte trouvée.</p>'}</div>` : ''}
      ${entries.length ? (gal() ? `<div class="gal">${entries.map(({ c, q, owned }) => `<div class="gcard own" data-id="${esc(c.i)}">
          <button class="pic" data-r="card" aria-label="Détails de ${esc(label(c))}">${imgTag(c.im)}<span class="badge">×${q}</span></button>
          <div class="cap"><span class="num">${ownTxt(owned) || esc(c.i)}</span>${esc(label(c))}${priceTag(c.i, q)}</div>${wq(q)}</div>`).join('')}</div>`
        : entries.map(({ c, q, owned }) => `<div class="yrow" data-id="${esc(c.i)}">
          <button class="ypic" data-r="card">${imgTag(c.im)}</button>
          <div class="yinfo"><button class="nm" data-r="card">${esc(label(c))}</button><span class="en">${esc(c.i)}</span>
            <span class="meta">${ownTxt(owned)}${priceTag(c.i, q)}</span></div>${wq(q)}</div>`).join(''))
        : `<p class="empty">Ta wishlist est vide : cherche une carte au-dessus, ou ouvre la fiche d'une carte et touche « Ajouter à la wishlist ».</p>`}
      ${entries.length ? `<div class="ycm"><h4>Pour ta wishlist Cardmarket</h4>
        <textarea id="rwCm" readonly rows="${Math.min(8, entries.length)}">${esc(cm)}</textarea>
        <div class="actions"><span class="hint grow">Cardmarket → Wishlist → « Ajouter des cartes » : colle la liste (une carte par ligne).</span>
          <button data-r="wclear">Vider la wishlist</button><button class="primary" data-r="wcopy">Copier la liste</button></div></div>` : ''}
    </div>`;
    if (hadFocus || keepFocus) { const n = $('rwQ'); n.focus(); try { n.setSelectionRange(caret, caret); } catch (e) { /* rien */ } }
    loadImages(box);
  }
  function addToWish(id, delta = 1) {
    const d = wishDeck(); d.cards = d.cards || {};
    const n = (d.cards[id] || 0) + delta;
    if (n > 0) d.cards[id] = n; else delete d.cards[id];
    touchDeck(d);
    return n;
  }

  // ---------- Fiche d'une carte (toutes ses versions) ----------
  let cardBack = null;
  function openCard(id, back) {
    const c = card(id); if (!c) return;
    cardBack = back || null;
    App.openModal(`<div id="rcardSheet" data-id="${esc(id)}"></div>`, 'tcg rb wide', 'rb-card');
    renderCard();
  }
  function renderCard() {
    const box = $('rcardSheet'); if (!box) return;
    const c = card(box.dataset.id); if (!c) return;
    const gen = col()[`${c.i}|*`];
    const prints = c.p.map((p, pi) => ({ p, pi, q: qtyLang(p[1]), all: qtyAny(p[1]) }));
    const ds = liveDecks();
    const wish = decks()[WISH] && !decks()[WISH].deleted && (decks()[WISH].cards || {})[c.i];
    box.innerHTML = `
      <div class="sheet-head"><div><h3>${esc(label(c))}</h3><div class="meta">${esc(c.i)}</div></div>
        <button data-r="${cardBack ? 'back' : 'close'}">${cardBack ? '← Retour' : 'Fermer'}</button></div>
      <div class="split">
        <div class="ycol">${imgTag(c.im, 'big')}${c.x ? `<div class="ytext">${esc(c.x)}</div>` : ''}</div>
        <div style="display:flex;flex-direction:column;gap:12px;min-width:0">
          <dl class="kv"><dt>Type</dt><dd>${esc(catFr(c))}</dd>
            ${c.co ? `<dt>Domaine</dt><dd>${esc(colorFr(c))}</dd>` : ''}
            ${c.c !== '' && c.c != null ? `<dt>Énergie</dt><dd>${esc(c.c)}</dd>` : ''}
            ${c.pw !== '' && c.pw != null ? `<dt>Puissance</dt><dd>${esc(c.pw)}</dd>` : ''}
            ${c.m !== '' && c.m != null ? `<dt>Force</dt><dd>${esc(c.m)}</dd>` : ''}
            ${c.ty ? `<dt>Tags</dt><dd>${esc(c.ty)}</dd>` : ''}
            <dt>Dans ta collection</dt><dd><b>${ownedOf(c.i)}</b></dd>
            ${c.cm ? `<dt>Prix</dt><dd><b class="price">${money(c.cm)}</b> <span class="hint">(TCGplayer, version normale)</span></dd>` : ''}</dl>
          <div class="actions" style="justify-content:flex-start">
            ${ds.length ? `<select id="rcDeck">${ds.map(([id, d]) => `<option value="${id}">${esc(d.name || 'Deck')}</option>`).join('')}</select><button data-r="toDeck">Ajouter au deck</button>` : ''}
            <button data-r="toWish">☆ Ajouter à la wishlist${wish ? ` (${wish})` : ''}</button>
            <a data-r="cm">Voir sur Cardmarket ↗</a></div>
          <h4 class="yaddh">Ajouter à ma collection ${langSelect('rcLang')}</h4>
          <div class="yprints">
            <div class="yprint" data-gen="1"><div><b>Peu importe la version</b></div>${App.qtyHtml((gen && gen.qty) || 0)}</div>
            ${prints.map(({ p, pi, q, all }) => `<div class="yprint${all ? ' own' : ''}" data-pi="${pi}">
              <div><span class="code">${esc(p[1])}</span>${all > q ? ` <span class="own">+${all - q} autre langue</span>` : ''} <span class="tag">${esc(rarName(p))}</span>${p[4] ? ' ' + tag(p[4]) : ''}<div class="hint">${esc(setName(p[0]))} ${upTag(p[0])}</div></div>
              ${App.qtyHtml(q)}</div>`).join('')}
          </div>
        </div></div>`;
    loadImages(box);
  }

  // ---------- Ajout de cartes à la collection ----------
  function openAdd() {
    App.openModal(`
      <div class="sheet-head"><h3>Ajouter des cartes Riftbound</h3><button class="close" data-r="close">Fermer</button></div>
      <div class="ydeckbar">${langSelect('raLang')}<input type="search" id="raQ" placeholder="Nom de carte, code (OGN-030) ou extension (Origins, SFD)…" value="${esc(st.addQ)}" autofocus></div>
      <div class="yresults" id="raRes"></div>`, 'tcg rb wide', 'rb-add');
    renderAdd();
  }
  // ---------- Extensions : toutes les cartes d'une extension, pour la compléter ----------
  const normSet = t => String(t || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  function searchSets(q, max = 8) {
    q = q.trim().toLowerCase(); if (q.length < 2) return [];
    const words = q.split(/\s+/), nq = normSet(q);
    const out = [];
    st.db.sets.forEach((x, i) => {
      if (!st.idx.bySet.has(i)) return;
      const name = x[0].toLowerCase();
      if (words.every(w => name.includes(w)) || (x[1] && normSet(x[1]) === nq)) out.push(i);
    });
    return out.sort((a, b) => (st.db.sets[b][3] || 0) - (st.db.sets[a][3] || 0)).slice(0, max);
  }
  function setPrints(i) {
    return (st.idx.bySet.get(i) || []).map(([ci, pi]) => ({ ci, pi, c: st.db.cards[ci], p: st.db.cards[ci].p[pi] }))
      .sort((a, b) => a.c.i.localeCompare(b.c.i, 'en', { numeric: true }) || (a.p[3] ? 1 : 0) - (b.p[3] ? 1 : 0) || a.p[3].localeCompare(b.p[3]));
  }
  // Progression : une carte compte comme possédée si tu as au moins une de ses versions de l'extension
  function setProgress(i) {
    const ix = qIndex(); if (ix.prog.has(i)) return ix.prog.get(i);
    const codes = new Map();
    for (const x of setPrints(i)) codes.set(x.c.i, (codes.get(x.c.i) || 0) + qtyAny(x.p[1]));
    let own = 0; for (const q of codes.values()) if (q > 0) own++;
    const r = { own, total: codes.size }; ix.prog.set(i, r);
    return r;
  }
  // Manquantes : sans filtre, une carte manque si tu n'en as aucune version ; avec une version choisie, chacune compte.
  function setMissing(i) {
    const all = setPrints(i), r = st.setRarity;
    if (r) return all.filter(y => rarName(y.p) === r && !qtyAny(y.p[1]));
    const owned = new Set(); for (const z of all) if (qtyAny(z.p[1]) > 0) owned.add(z.c.i);
    return all.filter(y => !owned.has(y.c.i));
  }
  function setMissingText(i) {
    const seen = new Set(), lines = [];
    for (const x of setMissing(i)) {
      if (seen.has(x.c.i)) continue;
      seen.add(x.c.i);
      lines.push(cmLine(1, x.c));
    }
    return lines.join('\n');
  }
  function rarityProgress(i) {
    const m = new Map();
    for (const x of setPrints(i)) {
      const k = rarName(x.p); const v = m.get(k) || { own: 0, total: 0 };
      v.total++; if (qtyAny(x.p[1]) > 0) v.own++; m.set(k, v);
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
    if (st.setView === 'miss') { const k = new Set(setMissing(i).map(z => z.ci + ':' + z.pi)); rows = rows.filter(y => k.has(y.ci + ':' + y.pi)); }
    const miss = setMissingText(i);
    const cur = st.setRarity ? rars.find(([k]) => k === st.setRarity)[1] : null;
    const missVal = (() => { const seen = new Set(); let v = 0; for (const y of setMissing(i)) { if (seen.has(y.c.i)) continue; seen.add(y.c.i); v += y.c.cm || 0; } return v; })();
    el.innerHTML = `<div class="yset-head">
        <button data-r="unset">← Retour</button>
        <div class="grow"><b>${esc(x[0])}</b> <span class="code">${esc(x[1] || '')}</span> ${upTag(i)}
          <div class="bar"><i style="width:${(cur ? (cur.total ? cur.own / cur.total : 0) : (total ? own / total : 0)) * 100}%"></i></div>
          <span class="hint">${cur ? `<b>${cur.own}</b> / ${cur.total} en ${esc(st.setRarity)}` : `<b>${own}</b> / ${total} cartes de l'extension · ${allV.own} / ${allV.total} versions (arts alternatifs compris)`}${missVal ? ` · manquantes ≈ <b class="price">${money(missVal)}</b>` : ''}</span></div>
        <div class="seg" id="rsView"><button data-sv="all" aria-pressed="${st.setView === 'all'}">Toutes</button><button data-sv="miss" aria-pressed="${st.setView === 'miss'}">Manquantes</button></div>
        ${miss ? `<button data-r="copySet" title="Format wishlist Cardmarket : 1x Nom CODE">Copier les manquantes</button>` : ''}
        ${rars.length > 1 ? `<div class="yrars"><button class="chip" data-rar="" aria-pressed="${!st.setRarity}">Toutes</button>${rars.map(([k, v]) => `<button class="chip${v.own === v.total ? ' done' : ''}" data-rar="${esc(k)}" aria-pressed="${st.setRarity === k}">${esc(k)} <b>${v.own}/${v.total}</b></button>`).join('')}</div>` : ''}</div>
      <textarea id="rsCm" hidden readonly>${esc(miss)}</textarea>
      ${rows.length ? rows.map(({ ci, pi, c, p }) => { const q = qtyLang(p[1]), all = qtyAny(p[1]); return `<div class="yres${all ? ' owned' : ''}" data-id="${esc(c.i)}">
        <button class="ypic" data-r="card">${imgTag(printImg(c, p))}</button>
        <div class="yinfo"><button class="nm" data-r="card">${esc(label(c))}</button>
          <span class="meta"><span class="code">${esc(p[1])}</span><span class="rar">${esc(rarName(p))}</span>${tag(p[4])}${all > q ? `<span class="own">${all - q} dans une autre langue</span>` : ''}</span></div>
        <div class="yquick" data-ci="${ci}" data-pi="${pi}">${App.qtyHtml(q)}</div></div>`; }).join('') : `<p class="hint">${st.setView === 'miss' ? 'Rien ne manque ici.' : 'Aucune carte.'}</p>`}`;
    loadImages(el);
  }

  function renderAdd() {
    const el = $('raRes'); if (!el) return;
    if (st.addSet != null) return renderSet(el);
    const q = st.addQ.trim();
    if (!q) { el.innerHTML = `<p class="hint">Tape quelques lettres : la recherche porte sur les ${st.db.cards.length.toLocaleString('fr-FR')} cartes du jeu. Tape le nom ou le code d'une extension (ex. Origins, SFD) pour la compléter.</p>`; return; }
    const exact = card(q.toUpperCase().replace(/\s+/g, ''));
    const res = searchCards(q).filter(c => c !== exact);
    const sets = searchSets(q);
    const quick = c => c.p.map((p, pi) => `<div class="yquick" data-ci="${st.idx.byId.get(c.i)}" data-pi="${pi}"><span class="tag">${esc(rarName(p))}</span> <span class="hint">${esc(setCode(p[0]) || setName(p[0]))}</span>${App.qtyHtml(qtyLang(p[1]))}</div>`).join('');
    el.innerHTML = (sets.length ? `<h4>Extensions</h4><div class="ysets">${sets.map(i => { const { own, total } = setProgress(i); const x = st.db.sets[i];
      return `<button class="yset" data-r="set" data-set="${i}"><b>${esc(x[0])} ${upTag(i)}</b><span class="hint">${esc(x[1] || '')} · ${own}/${total}</span></button>`; }).join('')}</div>${res.length || exact ? '<h4>Cartes</h4>' : ''}` : '')
      + (exact ? resultHtml(exact, `<div class="yquicks">${quick(exact)}</div>`) : '')
      + (res.length ? res.map(c => resultHtml(c, c.p.length === 1 ? quick(c) : `<button data-r="card">Choisir la version</button>`)).join('') : (exact || sets.length ? '' : '<p class="hint">Aucune carte ni extension trouvée.</p>'));
    loadImages(el);
  }

  function refreshOpenModal() {
    const k = App.modalKind;
    if (k === 'rb-deck') renderDeck();
    else if (k === 'rb-card') renderCard();
    else if (k === 'rb-add') renderAdd();
  }

  async function copyText(t) {
    let ok = false;
    try { await navigator.clipboard.writeText(t.value); ok = true; } catch (err) { t.removeAttribute('readonly'); t.hidden = false; t.select(); try { ok = document.execCommand('copy'); } catch (e2) { ok = false; } t.setAttribute('readonly', ''); }
    return ok;
  }

  // ---------- Événements ----------
  $('rbView').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    st.view = b.dataset.v; App.data.settings.rbView = st.view; App.scheduleSave(); render();
  });
  $('rbTools').addEventListener('click', e => {
    const b = e.target.closest('[data-r]');
    if (b && b.dataset.r === 'add') return st.db ? openAdd() : refreshDb();
    if (b && b.dataset.r === 'newDeck') return st.db ? newDeck() : refreshDb();
    if (b && b.dataset.r === 'importList') return st.db ? openImport() : refreshDb();
    const l = e.target.closest('#rbLayout button'); if (l) setLayout(l.dataset.v);
  });
  let wishTimer = null;
  $('rbList').addEventListener('input', e => {
    if (e.target.id === 'rwQ') { st.wishQ = e.target.value; clearTimeout(wishTimer); wishTimer = setTimeout(() => renderWish(true), 200); }
  });
  $('rbTools').addEventListener('input', e => { if (e.target.id === 'rbQ') { st.q = e.target.value; render(); } });
  $('rbTools').addEventListener('change', e => { if (e.target.id === 'rbSort') { st.sort = e.target.value; App.data.settings.rbSort = st.sort; App.scheduleSave(); render(); } });
  $('rbList').addEventListener('click', async e => {
    const b = e.target.closest('[data-r],[data-act],[data-v]'); if (!b) return;
    if (b.dataset.r === 'dl') return refreshDb();
    const y = b.dataset.r, row = b.closest('[data-id]');
    if (st.view === 'wish') {
      if (b.dataset.v && b.closest('#rwLayout')) return setLayout(b.dataset.v);
      if (y === 'wadd' && row) { const n = addToWish(row.dataset.id, 1); App.toast(`Ajoutée à la wishlist (×${n})`); return render(); }
      if (y === 'wq' && row) { addToWish(row.dataset.id, Number(b.dataset.d)); return render(); }
      if (y === 'wcopy') return App.toast(await copyText($('rwCm')) ? 'Liste copiée : colle-la dans ta wishlist Cardmarket' : 'Sélectionne le texte et copie-le à la main');
      if (y === 'wclear') {
        if (b.dataset.sure) { const d = wishDeck(); d.cards = {}; touchDeck(d); return render(); }
        b.dataset.sure = '1'; b.textContent = 'Confirmer : tout vider'; return;
      }
      if (y === 'card' && row) return openCard(row.dataset.id);
      return;
    }
    if (y === 'deck') return openDeck(b.dataset.deck);
    if (y === 'card' && row) return openCard(row.dataset.id);
    if (b.dataset.act && row && row.dataset.key) {
      const key = row.dataset.key;
      const q = changeEntry(key, col()[key], b.dataset.act === 'inc' ? 1 : -1);
      if (q > 0) { row.querySelectorAll('output').forEach(o => { o.textContent = q; }); const bd = row.querySelector('.badge'); if (bd) bd.textContent = '×' + q; stats(); }
      else render();
    }
  });

  let addTimer = null, deckTimer = null;
  $('sheet').addEventListener('input', e => {
    if (e.target.id === 'raQ') { st.addQ = e.target.value; st.addSet = null; clearTimeout(addTimer); addTimer = setTimeout(renderAdd, 150); }
    if (e.target.id === 'rdQ') { st.deckQ = e.target.value; clearTimeout(deckTimer); deckTimer = setTimeout(() => renderDeck(true), 200); }
  });
  $('sheet').addEventListener('change', e => {
    if (e.target.id === 'raLang' || e.target.id === 'rcLang') { App.data.settings.rbLang = e.target.value; App.scheduleSave(); refreshOpenModal(); return; }
    if (e.target.id === 'rdName') { const d = decks()[st.deckId]; if (d) { d.name = e.target.value.trim() || 'Deck sans nom'; touchDeck(d); render(); } }
    if (e.target.id === 'rdCover') { const d = decks()[st.deckId]; if (d) { if (e.target.value) d.cover = e.target.value; else delete d.cover; touchDeck(d); render(); } }
  });
  $('sheet').addEventListener('click', async e => {
    const k = App.modalKind; if (!k || !k.startsWith('rb-')) return;
    const b = e.target.closest('[data-r],[data-act],[data-v],[data-sv],[data-rar]'); if (!b) return;
    const y = b.dataset.r;
    if (y === 'close') return App.closeModal();
    if (y === 'back') { const back = cardBack; cardBack = null; return back && back(); }
    if (k === 'rb-import') {
      if (y === 'impGo') return importDecklist();
      if (y === 'impFile') {
        try {
          const r = await window.coffre.openText('txt'); if (!r || !r.ok) return;
          $('riText').value = r.text; if (r.name) $('riName').value = String(r.name).replace(/\.[^.]+$/, '').slice(0, 60);
        } catch (err) { $('riMsg').textContent = 'Fichier illisible : ' + (err.message || err); }
      }
      return;
    }
    const row = b.closest('[data-id]');
    if (y === 'card' && row) {
      const back = k === 'rb-add' ? openAdd : k === 'rb-deck' ? (() => openDeck(st.deckId, true)) : null;
      return openCard(row.dataset.id, back);
    }
    // fiche carte : quantités par version
    if (k === 'rb-card' && b.dataset.act) {
      const id = $('rcardSheet').dataset.id, pr = b.closest('.yprint');
      const delta = b.dataset.act === 'inc' ? 1 : -1;
      if (pr.dataset.gen) addGeneric(id, delta); else addPrinting(st.idx.byId.get(id), Number(pr.dataset.pi), delta);
      afterChange(); return;
    }
    if (k === 'rb-card' && y === 'toWish') {
      const n = addToWish($('rcardSheet').dataset.id, 1);
      App.toast(`Ajoutée à la wishlist (×${n})`); afterChange(); return;
    }
    if (k === 'rb-card' && y === 'toDeck') {
      const d = decks()[$('rcDeck').value], id = $('rcardSheet').dataset.id;
      if (d) { d.cards = d.cards || {}; d.cards[id] = (d.cards[id] || 0) + 1; touchDeck(d); App.toast(`Ajoutée à ${d.name}`); render(); }
      return;
    }
    if (k === 'rb-card' && y === 'cm') {
      const c = card($('rcardSheet').dataset.id);
      return window.coffre.openExternal(`https://www.cardmarket.com/fr/Riftbound/Products/Search?searchString=${encodeURIComponent(c.n)}`);
    }
    if (k === 'rb-add' && b.dataset.rar != null) { st.setRarity = b.dataset.rar || null; return renderAdd(); }
    if (k === 'rb-add' && y === 'set') { st.addSet = Number(b.dataset.set); st.setView = 'all'; st.setRarity = null; $('raRes').scrollTop = 0; return renderAdd(); }
    if (k === 'rb-add' && y === 'unset') { st.addSet = null; return renderAdd(); }
    if (k === 'rb-add' && b.dataset.sv) { st.setView = b.dataset.sv; return renderAdd(); }
    if (k === 'rb-add' && y === 'copySet') {
      const t = $('rsCm'); const ok = await copyText(t); t.hidden = true;
      return App.toast(ok ? 'Manquantes copiées : colle-les dans ta wishlist Cardmarket' : 'Copie impossible sur cet appareil');
    }
    if (k === 'rb-add' && b.dataset.act) {
      const q = b.closest('.yquick');
      addPrinting(Number(q.dataset.ci), Number(q.dataset.pi), b.dataset.act === 'inc' ? 1 : -1);
      afterChange(); return;
    }
    // deck
    if (k === 'rb-deck') {
      const d = decks()[st.deckId]; if (!d) return;
      d.cards = d.cards || {};
      if (b.dataset.v && b.closest('#rdLayout')) { setLayout(b.dataset.v); return renderDeck(); }
      if (b.dataset.v) { st.deckView = b.dataset.v; return renderDeck(); }
      if (y === 'dadd' && row) { const id = row.dataset.id; d.cards[id] = (d.cards[id] || 0) + 1; touchDeck(d); afterChange(); return; }
      if (y === 'cadd' && row) { addOneToCollection(row.dataset.id); afterChange(); return; }
      if (y === 'dq' && row) {
        const id = row.dataset.id, n = (d.cards[id] || 0) + Number(b.dataset.d);
        if (n > 0) d.cards[id] = n; else delete d.cards[id];
        touchDeck(d); afterChange(); return;
      }
      if (y === 'copy') return App.toast(await copyText($('rdCm')) ? 'Liste copiée : colle-la dans ta wishlist Cardmarket' : 'Sélectionne le texte et copie-le à la main');
      if (y === 'copyList') return App.toast(await copyText($('rdList')) ? 'Decklist copiée' : 'Copie impossible sur cet appareil');
      if (y === 'saveList') {
        try { const r = await window.coffre.saveText((d.name || 'deck') + '.txt', toDecklist(d), 'txt'); if (r && r.ok) App.toast('Decklist enregistrée : ' + r.path); }
        catch (err) { App.toast('Enregistrement impossible : ' + (err.message || err)); }
        return;
      }
      if (y === 'delDeck') {
        if (b.dataset.sure) { decks()[st.deckId] = { deleted: true, mt: now() }; App.scheduleSave(); App.closeModal(); render(); App.toast('Deck supprimé'); }
        else { b.dataset.sure = '1'; b.textContent = 'Confirmer la suppression'; }
      }
    }
  });

  // ---------- Pour le scan (appli Android) ----------
  // Numéro imprimé en bas de la carte (« OGN · 030/298 ») : la version lue est proposée d'office, les autres en un toucher.
  function lookupScan(res) {
    if (!st.idx) return null;
    for (const key of Core.rbCodesInText(res && res.text)) {
      const hit = st.idx.byKey.get(key) || st.idx.byKey.get(key.replace(/[a-z]$/, ''));
      if (!hit) continue;
      const [ci, pi0] = hit, c = st.db.cards[ci];
      const prints = c.p.map((p, pi) => ({ ci, pi, card: c, p }));
      return { code: c.p[pi0][1], card: c, prints, auto: pi0, lang: '' };
    }
    return null;
  }

  window.CoffreRb = {
    get ready() { return !!st.db; },
    render, refreshDb, lookupScan, curLang, openCard, label,
    locCode: code => code, cardByName,
    addPrinting: (ci, pi, delta, lang) => addPrinting(ci, pi, delta, lang),
    addGeneric: id => addGeneric(id, 1), removeGeneric: id => addGeneric(id, -1),
    imgTag: (id, cls) => { const c = card(id); return imgTag(c ? c.im : id, cls); },
    printName: p => rarName(p), toDecklist, parseDecklist,
    loadImages, ownedOf, money
  };
  const start = () => { if (['name', 'added', 'code', 'price'].includes(App.data.settings.rbSort)) st.sort = App.data.settings.rbSort; st.view = ['decks', 'wish'].includes(App.data.settings.rbView) ? App.data.settings.rbView : 'col'; render(); loadDb(); };
  if (window.coffreReady) start(); else document.addEventListener('coffre:ready', start, { once: true });
})();
