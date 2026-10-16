// Coffre — onglet One Piece : toutes les cartes du jeu (base optcgapi.com),
// ta collection (par version : normale, parallèle… ou « peu importe la version »),
// les extensions à compléter, tes decks, ta wishlist et les listes au format wishlist Cardmarket.
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
    try { setDb(await window.coffre.opDb()); } catch (e) { /* pas encore téléchargée */ }
    render();
    // Mise à jour discrète (nouvelles cartes, prix) chaque semaine
    if (st.db && (st.db.v !== 1 || now() - (st.db.at || 0) > 7 * 864e5)) refreshDb(true);
  }
  async function refreshDb(silent) {
    if (st.loading) return;
    st.loading = true; st.error = '';
    if (!silent) render();
    try { setDb(await window.coffre.opRefresh()); if (!silent) App.toast('Base de cartes One Piece à jour'); }
    catch (e) { st.error = "Impossible de télécharger la base de cartes : " + String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''); }
    st.loading = false;
    render();
  }

  const card = id => st.idx && st.idx.byId.has(id) ? st.db.cards[st.idx.byId.get(id)] : null;
  const setName = i => (st.db.sets[i] || [''])[0];
  const setCode = i => (st.db.sets[i] || ['', ''])[1];
  const label = c => c.n;
  const isLeader = c => /leader/i.test(c.t || '');
  const gal = () => App.data.settings.opLayout !== 'list';
  const layoutSeg = id => `<div class="seg" id="${id}"><button data-v="gal" aria-pressed="${gal()}">Galerie</button><button data-v="list" aria-pressed="${!gal()}">Liste</button></div>`;
  function setLayout(v) { App.data.settings.opLayout = v; App.scheduleSave(); render(); }
  // Version d'une impression : « SR », « SR · Parallèle »…
  const rarName = p => [p[2], p[3]].filter(Boolean).join(' · ') || '?';
  const printImg = (c, p) => (p && p[5]) || c.im;

  const CAT = { leader: 'Leader', character: 'Personnage', event: 'Événement', stage: 'Lieu' };
  const COLORS = { red: 'Rouge', green: 'Vert', blue: 'Bleu', purple: 'Violet', black: 'Noir', yellow: 'Jaune' };
  const catFr = c => CAT[String(c.t || '').toLowerCase()] || c.t || '';
  const colorFr = c => String(c.co || '').split(/[\s/]+/).filter(Boolean).map(x => COLORS[x.toLowerCase()] || x).join(' / ');

  // ---------- Images (téléchargées une fois, puis gardées sur l'appareil) ----------
  const imgTag = (img, cls = '') => `<img class="yimg ${cls}" data-op="${esc(img || '')}" alt="" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7">`;
  let io = null;
  function loadImages(root) {
    const imgs = (root || document).querySelectorAll('img[data-op]:not([data-done])');
    const go = img => {
      img.dataset.done = '1';
      if (!img.dataset.op) { img.classList.add('missing'); return; }
      window.coffre.opImg(img.dataset.op).then(u => { if (u) img.src = u; else img.classList.add('missing'); });
    };
    if (!('IntersectionObserver' in window)) { imgs.forEach(go); return; }
    if (!io) io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { io.unobserve(e.target); go(e.target); } }), { rootMargin: '300px' });
    imgs.forEach(img => io.observe(img));
  }

  // ---------- Collection ----------
  // data.op[clé] = { id: code de la carte, k: clé de la version, lang, qty, mt }
  // clé = « version » (anglais), « version|FR », « version|JP », ou « code|* » (peu importe la version)
  const col = () => App.data.op || (App.data.op = {});
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
  // Langue de la carte physique (le code est le même dans toutes les langues)
  const LANGS = ['FR', 'EN', 'JP'];
  const curLang = () => LANGS.includes(App.data.settings.opLang) ? App.data.settings.opLang : 'FR';
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
  function qtyAny(pkey) {
    let n = 0;
    for (const e of Object.values(col())) if (e && e.k === pkey) n += e.qty || 0;
    return n;
  }
  const qtyLang = pkey => { const e = col()[keyFor(pkey, curLang())]; return (e && e.qty) || 0; };
  function addGeneric(id, delta = 1) { return changeEntry(`${id}|*`, { id, k: '' }, delta); }
  const entryPrint = e => { if (!e || !e.k || !st.idx.byKey.has(e.k)) return null; const [ci, pi] = st.idx.byKey.get(e.k); return st.db.cards[ci].p[pi]; };

  // ---------- Prix (TCGplayer, en dollars) ----------
  const usd = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'USD' });
  const money = v => usd.format(v || 0);
  const priceOf = id => { const c = card(id); return (c && c.cm) || 0; };
  const entryPrice = e => { const p = entryPrint(e); return (p && p[4]) || priceOf(e.id); };
  const tag = v => v ? `<span class="price">${money(v)}</span>` : '';
  const priceTag = (id, qty = 1) => tag(priceOf(id) * qty);
  const pricesDate = () => st.db ? new Date(st.db.at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) : '';
  const priceSrc = () => `<span class="hint" title="Prix du marché TCGplayer (États-Unis), en dollars, mis à jour chaque semaine">(TCGplayer, ${pricesDate()})</span>`;

  function stats() {
    let copies = 0, value = 0; const ids = new Set();
    for (const e of Object.values(col())) if (e && e.qty > 0) { copies += e.qty; ids.add(e.id); if (st.db) value += entryPrice(e) * e.qty; }
    $('opStats').innerHTML = `<b>${ids.size}</b> cartes · ${copies} exemplaires${st.db ? ` · valeur ≈ <b class="price">${money(value)}</b> ${priceSrc()}` : ''} · ${liveDecks().length} decks${wishCount() ? ` · ${wishCount()} en wishlist` : ''}`;
    $('tabOpCount').textContent = ids.size;
  }

  // ---------- Rendu de l'onglet ----------
  function toolsHtml() {
    if (st.view === 'wish') return '';
    if (st.view === 'decks') return `<button class="primary" data-o="newDeck">Nouveau deck</button>`;
    return `<button class="primary" data-o="add">Ajouter des cartes</button>
      <input type="search" id="opQ" placeholder="Filtrer ma collection (nom, code)…" value="${esc(st.q)}">
      ${layoutSeg('opLayout')}
      <select id="opSort" aria-label="Trier"><option value="name">Par nom</option><option value="added">Derniers ajouts</option><option value="code">Par code</option></select>`;
  }

  function render() {
    if (!$('opList') || !App.data) return;
    stats();
    $('opView').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === st.view)));
    const tools = $('opTools');
    if (tools.dataset.view !== st.view) {
      tools.innerHTML = toolsHtml(); tools.dataset.view = st.view;
      const s = $('opSort'); if (s) s.value = st.sort;
    }
    const ls = $('opLayout'); if (ls) ls.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.v === 'gal') === gal())));
    const list = $('opList');
    if (!st.db) {
      list.innerHTML = `<div class="empty">
        <p>Pour voir toutes les cartes One Piece, Coffre doit d'abord télécharger la base de cartes (optcgapi.com, gratuite : toutes les extensions, decks de démarrage et promos, avec les versions parallèles). Ça se fait une seule fois, puis elle se met à jour toute seule chaque semaine.</p>
        ${st.loading ? `<p><b>Téléchargement en cours…</b> (une minute environ)</p>` : `<button class="primary" data-o="dl">Télécharger la base de cartes</button>`}
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
      return `<div class="empty">${Object.keys(col()).length && q ? 'Aucune carte ne correspond.' : "Ta collection est vide. Touche « Ajouter des cartes » pour chercher dans toutes les cartes du jeu ou compléter une extension" + (App.info.platform === 'mobile' ? ', ou scanne le code imprimé en bas à droite de la carte (ex. OP01-001).' : '.')}</div>`;
    }
    const by = { name: (a, b) => label(a.c).localeCompare(label(b.c), 'fr') || a.c.i.localeCompare(b.c.i), added: (a, b) => (b.e.mt || 0) - (a.e.mt || 0), code: (a, b) => a.c.i.localeCompare(b.c.i, 'en', { numeric: true }) };
    rows.sort(by[st.sort] || by.name);
    if (gal()) return `<div class="gal">` + rows.map(({ key, e, c, p }) => `<div class="gcard own" data-key="${esc(key)}" data-id="${esc(c.i)}">
        <button class="pic" data-o="card" aria-label="Détails de ${esc(label(c))}">${imgTag(printImg(c, p))}<span class="badge">×${e.qty}</span></button>
        <div class="cap"><span class="num">${esc(c.i)} · ${p ? esc(rarName(p)) : 'toute version'}${e.lang ? ' · ' + esc(e.lang) : ''}</span>${tag(entryPrice(e))}${esc(label(c))}</div>${App.qtyHtml(e.qty)}</div>`).join('') + `</div>`;
    return rows.map(({ key, e, c, p }) => `<div class="yrow" data-key="${esc(key)}" data-id="${esc(c.i)}">
        <button class="ypic" data-o="card">${imgTag(printImg(c, p))}</button>
        <div class="yinfo"><button class="nm" data-o="card">${esc(label(c))}</button>
          <span class="meta"><span class="code">${esc(c.i)}</span>${e.lang ? `<span class="tag">${esc(e.lang)}</span>` : ''}${p ? `<span>${esc(rarName(p))}</span><span>${esc(setName(p[0]))}</span>` : `<span class="tag">peu importe la version</span>`}${tag(entryPrice(e))}</span></div>
        ${App.qtyHtml(e.qty)}</div>`).join('');
  }

  // ---------- Decks ----------
  const decks = () => App.data.opdecks || (App.data.opdecks = {});
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
    if (!ds.length) return `<div class="empty">Aucun deck. Touche « Nouveau deck », choisis ton Leader et ajoute des cartes, même celles que tu n'as pas encore : Coffre te dira lesquelles manquent.</div>`;
    return `<div class="ydecks">` + ds.map(([id, d]) => {
      const { total, missing } = deckCounts(d);
      const ids = Object.keys(d.cards || {});
      const lead = ids.map(card).find(c => c && isLeader(c)) || card(ids[0]);
      return `<button class="ydeck" data-o="deck" data-deck="${id}">
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
  const statLine = c => [catFr(c), colorFr(c), c.c !== '' ? `coût ${c.c}` : '', c.pw !== '' ? `${c.pw}` : ''].filter(Boolean).join(' · ');
  const resultHtml = (c, act) => `<div class="yres" data-id="${esc(c.i)}">
      <button class="ypic" data-o="card">${imgTag(c.im)}</button>
      <div class="yinfo"><button class="nm" data-o="card">${esc(label(c))}</button><span class="en">${esc(c.i)}</span>
        <span class="meta"><span>${esc(statLine(c))}</span>${ownedOf(c.i) ? `<span class="own">${ownedOf(c.i)} dans ta collection</span>` : ''}</span></div>
      ${act}</div>`;

  function openDeck(id, keep) {
    if (!keep) { st.deckQ = ''; st.deckView = 'all'; }
    st.deckId = id;
    App.openModal(`<div id="odeckSheet"></div>`, 'tcg op wide', 'op-deck');
    renderDeck();
  }
  function renderDeck(keepFocus) {
    const box = $('odeckSheet'); if (!box) return;
    const d = decks()[st.deckId]; if (!d || d.deleted) { App.closeModal(); return; }
    const entries = Object.entries(d.cards || {}).map(([id, q]) => ({ c: card(id), q, owned: ownedOf(id) })).filter(x => x.c);
    const missingList = entries.filter(x => x.q > x.owned);
    const shown = st.deckView === 'miss' ? missingList : entries;
    const dq = q => `<div class="qty"><button data-o="dq" data-d="-1" aria-label="Retirer du deck">−</button><output>${q}</output><button data-o="dq" data-d="1" aria-label="Ajouter au deck">+</button></div>`;
    const ownTxt = (q, owned) => owned >= q ? `<span class="own">${owned} possédée${owned > 1 ? 's' : ''}</span>` : `<span class="miss">il en manque ${q - owned}</span>`;
    const sortFn = (a, b) => (Number(a.c.c) || 0) - (Number(b.c.c) || 0) || label(a.c).localeCompare(label(b.c), 'fr');
    const group = (title, arr) => arr.length ? `<h4>${title} <span class="num">${arr.reduce((a, x) => a + x.q, 0)}</span></h4>` + (gal()
      ? `<div class="gal">${arr.sort(sortFn).map(({ c, q, owned }) => `<div class="gcard${owned >= q ? ' own' : ' short'}" data-id="${esc(c.i)}">
          <button class="pic" data-o="card" aria-label="Détails de ${esc(label(c))}">${imgTag(c.im)}<span class="badge">×${q}</span></button>
          <div class="cap"><span class="num">${ownTxt(q, owned)}</span>${esc(label(c))}${priceTag(c.i)}</div>${dq(q)}</div>`).join('')}</div>`
      : arr.sort(sortFn).map(({ c, q, owned }) => `
      <div class="yrow${owned >= q ? ' ok' : ' short'}" data-id="${esc(c.i)}">
        <button class="ypic" data-o="card">${imgTag(c.im)}</button>
        <div class="yinfo"><button class="nm" data-o="card">${esc(label(c))}</button><span class="en">${esc(c.i)} · ${esc(statLine(c))}</span>
          <span class="meta">${ownTxt(q, owned)}${owned < q ? `<span>(${owned} possédée${owned > 1 ? 's' : ''})</span>` : ''}${priceTag(c.i)}</span></div>
        ${dq(q)}</div>`).join('')) : '';
    const leaders = shown.filter(x => isLeader(x.c)), main = shown.filter(x => !isLeader(x.c));
    const leadCount = entries.filter(x => isLeader(x.c)).reduce((a, x) => a + x.q, 0);
    const mainCount = entries.filter(x => !isLeader(x.c)).reduce((a, x) => a + x.q, 0);
    const results = searchCards(st.deckQ, 30);
    const cm = missingList.map(x => cmLine(x.q - x.owned, x.c)).join('\n');
    const deckValue = entries.reduce((a, x) => a + x.q * (x.c.cm || 0), 0);
    const missValue = missingList.reduce((a, x) => a + (x.q - x.owned) * (x.c.cm || 0), 0);
    const q = $('odQ'), hadFocus = q && document.activeElement === q, caret = q ? q.selectionStart : 0;
    box.innerHTML = `
      <div class="sheet-head"><input id="odName" class="dname" value="${esc(d.name || '')}" aria-label="Nom du deck">
        <button class="close" data-o="close">Fermer</button></div>
      <p class="hint">Leader : ${leadCount}/1 · Deck : ${mainCount}/50 cartes · ${missingList.length ? `<b class="miss">${missingList.reduce((a, x) => a + x.q - x.owned, 0)} carte(s) manquante(s)</b>` : 'tu as toutes les cartes'}
        ${deckValue ? `<br>Prix du deck ≈ <b class="price">${money(deckValue)}</b>${missValue ? ` · ce qu'il te manque ≈ <b class="price miss">${money(missValue)}</b>` : ''} ${priceSrc()}` : ''}</p>
      <div class="ydeckbar">
        <input type="search" id="odQ" placeholder="Ajouter une carte : nom ou code (OP01-001)…" value="${esc(st.deckQ)}">
        <div class="seg" id="odView"><button data-v="all" aria-pressed="${st.deckView === 'all'}">Toutes</button><button data-v="miss" aria-pressed="${st.deckView === 'miss'}">Manquantes</button></div>
        ${layoutSeg('odLayout')}
      </div>
      ${st.deckQ ? `<div class="yresults">${results.length ? results.map(c => resultHtml(c, `<button class="primary" data-o="dadd">+ ${isLeader(c) ? 'Leader' : 'Deck'}</button>`)).join('') : '<p class="hint">Aucune carte trouvée.</p>'}</div>` : ''}
      <div class="ydecklist">${group('Leader', leaders)}${group('Deck', main)}${!shown.length ? `<p class="hint">${st.deckView === 'miss' ? 'Aucune carte manquante.' : 'Deck vide : cherche ton Leader et tes cartes au-dessus pour les ajouter.'}</p>` : ''}</div>
      ${missingList.length ? `<div class="ycm"><h4>Manquantes pour ta wishlist Cardmarket</h4>
        <textarea id="odCm" readonly rows="${Math.min(8, missingList.length)}">${esc(cm)}</textarea>
        <div class="actions"><span class="hint grow">Cardmarket → Wishlist → « Ajouter des cartes » : colle la liste (une carte par ligne).</span><button class="primary" data-o="copy">Copier la liste</button></div></div>` : ''}
      <div class="actions"><button class="danger" data-o="delDeck">Supprimer ce deck</button></div>`;
    if (hadFocus || keepFocus) { const n = $('odQ'); n.focus(); try { n.setSelectionRange(caret, caret); } catch (e) { /* rien */ } }
    loadImages(box);
  }
  // Ligne pour la wishlist Cardmarket One Piece : « 2x Roronoa Zoro OP01-025 »
  const cmLine = (qty, c) => `${qty}x ${c.n} ${c.i}`;

  // ---------- Wishlist (dans l'onglet) ----------
  function renderWish(keepFocus) {
    const box = $('opList'); if (!box) return;
    const d = decks()[WISH] && !decks()[WISH].deleted ? decks()[WISH] : { cards: {} };
    const entries = Object.entries(d.cards || {}).map(([id, q]) => ({ c: card(id), q, owned: ownedOf(id) })).filter(x => x.c)
      .sort((a, b) => label(a.c).localeCompare(label(b.c), 'fr'));
    const total = entries.reduce((a, x) => a + x.q, 0);
    const value = entries.reduce((a, x) => a + x.q * (x.c.cm || 0), 0);
    const cm = entries.map(x => cmLine(x.q, x.c)).join('\n');
    const results = searchCards(st.wishQ || '', 30);
    const wq = q => `<div class="qty"><button data-o="wq" data-d="-1" aria-label="Retirer de la wishlist">−</button><output>${q}</output><button data-o="wq" data-d="1" aria-label="En vouloir une de plus">+</button></div>`;
    const ownTxt = o => o ? `<span class="own">déjà ${o} dans ta collection</span>` : '';
    const q0 = $('owQ'), hadFocus = q0 && document.activeElement === q0, caret = q0 ? q0.selectionStart : 0;
    box.innerHTML = `<div class="ywish">
      <p class="hint">Les cartes que tu veux, en dehors de tes decks. ${total ? `<b>${total}</b> carte${total > 1 ? 's' : ''}${value ? ` · ≈ <b class="price">${money(value)}</b> ${priceSrc()}` : ''}` : ''}</p>
      <div class="ydeckbar">
        <input type="search" id="owQ" placeholder="Ajouter une carte à la wishlist : nom ou code…" value="${esc(st.wishQ || '')}">
        ${layoutSeg('owLayout')}
      </div>
      ${st.wishQ ? `<div class="yresults">${results.length ? results.map(c => resultHtml(c, `<button class="primary" data-o="wadd">+ Wishlist</button>`)).join('') : '<p class="hint">Aucune carte trouvée.</p>'}</div>` : ''}
      ${entries.length ? (gal() ? `<div class="gal">${entries.map(({ c, q, owned }) => `<div class="gcard own" data-id="${esc(c.i)}">
          <button class="pic" data-o="card" aria-label="Détails de ${esc(label(c))}">${imgTag(c.im)}<span class="badge">×${q}</span></button>
          <div class="cap"><span class="num">${ownTxt(owned) || esc(c.i)}</span>${esc(label(c))}${priceTag(c.i, q)}</div>${wq(q)}</div>`).join('')}</div>`
        : entries.map(({ c, q, owned }) => `<div class="yrow" data-id="${esc(c.i)}">
          <button class="ypic" data-o="card">${imgTag(c.im)}</button>
          <div class="yinfo"><button class="nm" data-o="card">${esc(label(c))}</button><span class="en">${esc(c.i)}</span>
            <span class="meta">${ownTxt(owned)}${priceTag(c.i, q)}</span></div>${wq(q)}</div>`).join(''))
        : `<p class="empty">Ta wishlist est vide : cherche une carte au-dessus, ou ouvre la fiche d'une carte et touche « Ajouter à la wishlist ».</p>`}
      ${entries.length ? `<div class="ycm"><h4>Pour ta wishlist Cardmarket</h4>
        <textarea id="owCm" readonly rows="${Math.min(8, entries.length)}">${esc(cm)}</textarea>
        <div class="actions"><span class="hint grow">Cardmarket → Wishlist → « Ajouter des cartes » : colle la liste (une carte par ligne).</span>
          <button data-o="wclear">Vider la wishlist</button><button class="primary" data-o="wcopy">Copier la liste</button></div></div>` : ''}
    </div>`;
    if (hadFocus || keepFocus) { const n = $('owQ'); n.focus(); try { n.setSelectionRange(caret, caret); } catch (e) { /* rien */ } }
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
    App.openModal(`<div id="ocardSheet" data-id="${esc(id)}"></div>`, 'tcg op wide', 'op-card');
    renderCard();
  }
  function renderCard() {
    const box = $('ocardSheet'); if (!box) return;
    const c = card(box.dataset.id); if (!c) return;
    const gen = col()[`${c.i}|*`];
    const prints = c.p.map((p, pi) => ({ p, pi, q: qtyLang(p[1]), all: qtyAny(p[1]) }));
    const ds = liveDecks();
    const wish = decks()[WISH] && !decks()[WISH].deleted && (decks()[WISH].cards || {})[c.i];
    box.innerHTML = `
      <div class="sheet-head"><div><h3>${esc(label(c))}</h3><div class="meta">${esc(c.i)}</div></div>
        <button data-o="${cardBack ? 'back' : 'close'}">${cardBack ? '← Retour' : 'Fermer'}</button></div>
      <div class="split">
        <div>${imgTag(c.im, 'big')}</div>
        <div style="display:flex;flex-direction:column;gap:12px;min-width:0">
          <dl class="kv"><dt>Catégorie</dt><dd>${esc(catFr(c))}${c.co ? ' · ' + esc(colorFr(c)) : ''}</dd>
            ${c.c !== '' ? `<dt>Coût</dt><dd>${esc(c.c)}</dd>` : ''}
            ${c.l !== '' ? `<dt>Vie</dt><dd>${esc(c.l)}</dd>` : ''}
            ${c.pw !== '' ? `<dt>Puissance</dt><dd>${esc(c.pw)}</dd>` : ''}
            ${c.ct !== '' && c.ct !== 0 ? `<dt>Counter</dt><dd>+${esc(c.ct)}</dd>` : ''}
            ${c.at ? `<dt>Attribut</dt><dd>${esc(c.at)}</dd>` : ''}
            ${c.ty ? `<dt>Types</dt><dd>${esc(c.ty)}</dd>` : ''}
            <dt>Dans ta collection</dt><dd><b>${ownedOf(c.i)}</b></dd>
            ${c.cm ? `<dt>Prix</dt><dd><b class="price">${money(c.cm)}</b> <span class="hint">(TCGplayer, version normale)</span></dd>` : ''}</dl>
          <div class="actions" style="justify-content:flex-start">
            ${ds.length ? `<select id="ocDeck">${ds.map(([id, d]) => `<option value="${id}">${esc(d.name || 'Deck')}</option>`).join('')}</select><button data-o="toDeck">Ajouter au deck</button>` : ''}
            <button data-o="toWish">☆ Ajouter à la wishlist${wish ? ` (${wish})` : ''}</button>
            <a data-o="cm">Voir sur Cardmarket ↗</a></div>
          <h4 class="yaddh">Ajouter à ma collection ${langSelect('ocLang')}</h4>
          <div class="yprints">
            <div class="yprint" data-gen="1"><div><b>Peu importe la version</b></div>${App.qtyHtml((gen && gen.qty) || 0)}</div>
            ${prints.map(({ p, pi, q, all }) => `<div class="yprint${all ? ' own' : ''}" data-pi="${pi}">
              <div><span class="code">${esc(c.i)}</span>${all > q ? ` <span class="own">+${all - q} autre langue</span>` : ''} <span class="tag">${esc(rarName(p))}</span>${p[4] ? ' ' + tag(p[4]) : ''}<div class="hint">${esc(setName(p[0]))}</div></div>
              ${App.qtyHtml(q)}</div>`).join('')}
          </div>
        </div></div>`;
    loadImages(box);
  }

  // ---------- Ajout de cartes à la collection ----------
  function openAdd() {
    App.openModal(`
      <div class="sheet-head"><h3>Ajouter des cartes One Piece</h3><button class="close" data-o="close">Fermer</button></div>
      <div class="ydeckbar">${langSelect('oaLang')}<input type="search" id="oaQ" placeholder="Nom de carte, code (OP01-001) ou extension (OP-05, Romance Dawn)…" value="${esc(st.addQ)}" autofocus></div>
      <div class="yresults" id="oaRes"></div>`, 'tcg op wide', 'op-add');
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
    const codes = new Map();
    for (const x of setPrints(i)) codes.set(x.c.i, (codes.get(x.c.i) || 0) + qtyAny(x.p[1]));
    let own = 0; for (const q of codes.values()) if (q > 0) own++;
    return { own, total: codes.size };
  }
  // Manquantes : sans filtre, une carte manque si tu n'en as aucune version ; avec une version choisie, chacune compte.
  function setMissing(i) {
    const all = setPrints(i), r = st.setRarity;
    if (r) return all.filter(y => rarName(y.p) === r && !qtyAny(y.p[1]));
    return all.filter(y => !all.some(z => z.c.i === y.c.i && qtyAny(z.p[1]) > 0));
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
    if (st.setView === 'miss') { const m = setMissing(i); rows = rows.filter(y => m.some(z => z.ci === y.ci && z.pi === y.pi)); }
    const miss = setMissingText(i);
    const cur = st.setRarity ? rars.find(([k]) => k === st.setRarity)[1] : null;
    const missVal = (() => { const seen = new Set(); let v = 0; for (const y of setMissing(i)) { if (seen.has(y.c.i)) continue; seen.add(y.c.i); v += y.c.cm || 0; } return v; })();
    el.innerHTML = `<div class="yset-head">
        <button data-o="unset">← Retour</button>
        <div class="grow"><b>${esc(x[0])}</b> <span class="code">${esc(x[1] || '')}</span>
          <div class="bar"><i style="width:${(cur ? (cur.total ? cur.own / cur.total : 0) : (total ? own / total : 0)) * 100}%"></i></div>
          <span class="hint">${cur ? `<b>${cur.own}</b> / ${cur.total} en ${esc(st.setRarity)}` : `<b>${own}</b> / ${total} cartes de l'extension · ${allV.own} / ${allV.total} versions (parallèles comprises)`}${missVal ? ` · manquantes ≈ <b class="price">${money(missVal)}</b>` : ''}</span></div>
        <div class="seg" id="osView"><button data-sv="all" aria-pressed="${st.setView === 'all'}">Toutes</button><button data-sv="miss" aria-pressed="${st.setView === 'miss'}">Manquantes</button></div>
        ${miss ? `<button data-o="copySet" title="Format wishlist Cardmarket : 1x Nom CODE">Copier les manquantes</button>` : ''}
        ${rars.length > 1 ? `<div class="yrars"><button class="chip" data-rar="" aria-pressed="${!st.setRarity}">Toutes</button>${rars.map(([k, v]) => `<button class="chip${v.own === v.total ? ' done' : ''}" data-rar="${esc(k)}" aria-pressed="${st.setRarity === k}">${esc(k)} <b>${v.own}/${v.total}</b></button>`).join('')}</div>` : ''}</div>
      <textarea id="osCm" hidden readonly>${esc(miss)}</textarea>
      ${rows.length ? rows.map(({ ci, pi, c, p }) => { const q = qtyLang(p[1]), all = qtyAny(p[1]); return `<div class="yres${all ? ' owned' : ''}" data-id="${esc(c.i)}">
        <button class="ypic" data-o="card">${imgTag(printImg(c, p))}</button>
        <div class="yinfo"><button class="nm" data-o="card">${esc(label(c))}</button>
          <span class="meta"><span class="code">${esc(c.i)}</span><span class="rar">${esc(rarName(p))}</span>${tag(p[4])}${all > q ? `<span class="own">${all - q} dans une autre langue</span>` : ''}</span></div>
        <div class="yquick" data-ci="${ci}" data-pi="${pi}">${App.qtyHtml(q)}</div></div>`; }).join('') : `<p class="hint">${st.setView === 'miss' ? 'Rien ne manque ici.' : 'Aucune carte.'}</p>`}`;
    loadImages(el);
  }

  function renderAdd() {
    const el = $('oaRes'); if (!el) return;
    if (st.addSet != null) return renderSet(el);
    const q = st.addQ.trim();
    if (!q) { el.innerHTML = `<p class="hint">Tape quelques lettres : la recherche porte sur les ${st.db.cards.length.toLocaleString('fr-FR')} cartes du jeu. Tape le nom ou le code d'une extension (ex. OP-05) pour la compléter.</p>`; return; }
    const exact = card(q.toUpperCase().replace(/\s+/g, ''));
    const res = searchCards(q).filter(c => c !== exact);
    const sets = searchSets(q);
    const quick = c => c.p.map((p, pi) => `<div class="yquick" data-ci="${st.idx.byId.get(c.i)}" data-pi="${pi}"><span class="tag">${esc(rarName(p))}</span> <span class="hint">${esc(setCode(p[0]) || setName(p[0]))}</span>${App.qtyHtml(qtyLang(p[1]))}</div>`).join('');
    el.innerHTML = (sets.length ? `<h4>Extensions</h4><div class="ysets">${sets.map(i => { const { own, total } = setProgress(i); const x = st.db.sets[i];
      return `<button class="yset" data-o="set" data-set="${i}"><b>${esc(x[0])}</b><span class="hint">${esc(x[1] || '')} · ${own}/${total}</span></button>`; }).join('')}</div>${res.length || exact ? '<h4>Cartes</h4>' : ''}` : '')
      + (exact ? resultHtml(exact, `<div class="yquicks">${quick(exact)}</div>`) : '')
      + (res.length ? res.map(c => resultHtml(c, c.p.length === 1 ? quick(c) : `<button data-o="card">Choisir la version</button>`)).join('') : (exact || sets.length ? '' : '<p class="hint">Aucune carte ni extension trouvée.</p>'));
    loadImages(el);
  }

  function refreshOpenModal() {
    const k = App.modalKind;
    if (k === 'op-deck') renderDeck();
    else if (k === 'op-card') renderCard();
    else if (k === 'op-add') renderAdd();
  }

  async function copyText(t) {
    let ok = false;
    try { await navigator.clipboard.writeText(t.value); ok = true; } catch (err) { t.removeAttribute('readonly'); t.hidden = false; t.select(); try { ok = document.execCommand('copy'); } catch (e2) { ok = false; } t.setAttribute('readonly', ''); }
    return ok;
  }

  // ---------- Événements ----------
  $('opView').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    st.view = b.dataset.v; App.data.settings.opView = st.view; App.scheduleSave(); render();
  });
  $('opTools').addEventListener('click', e => {
    const b = e.target.closest('[data-o]');
    if (b && b.dataset.o === 'add') return st.db ? openAdd() : refreshDb();
    if (b && b.dataset.o === 'newDeck') return st.db ? newDeck() : refreshDb();
    const l = e.target.closest('#opLayout button'); if (l) setLayout(l.dataset.v);
  });
  let wishTimer = null;
  $('opList').addEventListener('input', e => {
    if (e.target.id === 'owQ') { st.wishQ = e.target.value; clearTimeout(wishTimer); wishTimer = setTimeout(() => renderWish(true), 200); }
  });
  $('opTools').addEventListener('input', e => { if (e.target.id === 'opQ') { st.q = e.target.value; render(); } });
  $('opTools').addEventListener('change', e => { if (e.target.id === 'opSort') { st.sort = e.target.value; render(); } });
  $('opList').addEventListener('click', async e => {
    const b = e.target.closest('[data-o],[data-act],[data-v]'); if (!b) return;
    if (b.dataset.o === 'dl') return refreshDb();
    const y = b.dataset.o, row = b.closest('[data-id]');
    if (st.view === 'wish') {
      if (b.dataset.v && b.closest('#owLayout')) return setLayout(b.dataset.v);
      if (y === 'wadd' && row) { const n = addToWish(row.dataset.id, 1); App.toast(`Ajoutée à la wishlist (×${n})`); return render(); }
      if (y === 'wq' && row) { addToWish(row.dataset.id, Number(b.dataset.d)); return render(); }
      if (y === 'wcopy') return App.toast(await copyText($('owCm')) ? 'Liste copiée : colle-la dans ta wishlist Cardmarket' : 'Sélectionne le texte et copie-le à la main');
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
      changeEntry(key, col()[key], b.dataset.act === 'inc' ? 1 : -1);
      render();
    }
  });

  let addTimer = null, deckTimer = null;
  $('sheet').addEventListener('input', e => {
    if (e.target.id === 'oaQ') { st.addQ = e.target.value; st.addSet = null; clearTimeout(addTimer); addTimer = setTimeout(renderAdd, 150); }
    if (e.target.id === 'odQ') { st.deckQ = e.target.value; clearTimeout(deckTimer); deckTimer = setTimeout(() => renderDeck(true), 200); }
  });
  $('sheet').addEventListener('change', e => {
    if (e.target.id === 'oaLang' || e.target.id === 'ocLang') { App.data.settings.opLang = e.target.value; App.scheduleSave(); refreshOpenModal(); return; }
    if (e.target.id === 'odName') { const d = decks()[st.deckId]; if (d) { d.name = e.target.value.trim() || 'Deck sans nom'; touchDeck(d); render(); } }
  });
  $('sheet').addEventListener('click', async e => {
    const k = App.modalKind; if (!k || !k.startsWith('op-')) return;
    const b = e.target.closest('[data-o],[data-act],[data-v],[data-sv],[data-rar]'); if (!b) return;
    const y = b.dataset.o;
    if (y === 'close') return App.closeModal();
    if (y === 'back') { const back = cardBack; cardBack = null; return back && back(); }
    const row = b.closest('[data-id]');
    if (y === 'card' && row) {
      const back = k === 'op-add' ? openAdd : k === 'op-deck' ? (() => openDeck(st.deckId, true)) : null;
      return openCard(row.dataset.id, back);
    }
    // fiche carte : quantités par version
    if (k === 'op-card' && b.dataset.act) {
      const id = $('ocardSheet').dataset.id, pr = b.closest('.yprint');
      const delta = b.dataset.act === 'inc' ? 1 : -1;
      if (pr.dataset.gen) addGeneric(id, delta); else addPrinting(st.idx.byId.get(id), Number(pr.dataset.pi), delta);
      renderCard(); render(); return;
    }
    if (k === 'op-card' && y === 'toWish') {
      const n = addToWish($('ocardSheet').dataset.id, 1);
      App.toast(`Ajoutée à la wishlist (×${n})`); renderCard(); render(); return;
    }
    if (k === 'op-card' && y === 'toDeck') {
      const d = decks()[$('ocDeck').value], id = $('ocardSheet').dataset.id;
      if (d) { d.cards = d.cards || {}; d.cards[id] = (d.cards[id] || 0) + 1; touchDeck(d); App.toast(`Ajoutée à ${d.name}`); render(); }
      return;
    }
    if (k === 'op-card' && y === 'cm') {
      const c = card($('ocardSheet').dataset.id);
      return window.coffre.openExternal(`https://www.cardmarket.com/fr/OnePiece/Products/Search?searchString=${encodeURIComponent(c.n)}`);
    }
    if (k === 'op-add' && b.dataset.rar != null) { st.setRarity = b.dataset.rar || null; return renderAdd(); }
    if (k === 'op-add' && y === 'set') { st.addSet = Number(b.dataset.set); st.setView = 'all'; st.setRarity = null; $('oaRes').scrollTop = 0; return renderAdd(); }
    if (k === 'op-add' && y === 'unset') { st.addSet = null; return renderAdd(); }
    if (k === 'op-add' && b.dataset.sv) { st.setView = b.dataset.sv; return renderAdd(); }
    if (k === 'op-add' && y === 'copySet') {
      const t = $('osCm'); const ok = await copyText(t); t.hidden = true;
      return App.toast(ok ? 'Manquantes copiées : colle-les dans ta wishlist Cardmarket' : 'Copie impossible sur cet appareil');
    }
    if (k === 'op-add' && b.dataset.act) {
      const q = b.closest('.yquick');
      addPrinting(Number(q.dataset.ci), Number(q.dataset.pi), b.dataset.act === 'inc' ? 1 : -1);
      renderAdd(); render(); return;
    }
    // deck
    if (k === 'op-deck') {
      const d = decks()[st.deckId]; if (!d) return;
      d.cards = d.cards || {};
      if (b.dataset.v && b.closest('#odLayout')) { setLayout(b.dataset.v); return renderDeck(); }
      if (b.dataset.v) { st.deckView = b.dataset.v; return renderDeck(); }
      if (y === 'dadd' && row) { const id = row.dataset.id; d.cards[id] = (d.cards[id] || 0) + 1; touchDeck(d); renderDeck(); render(); return; }
      if (y === 'dq' && row) {
        const id = row.dataset.id, n = (d.cards[id] || 0) + Number(b.dataset.d);
        if (n > 0) d.cards[id] = n; else delete d.cards[id];
        touchDeck(d); renderDeck(); render(); return;
      }
      if (y === 'copy') return App.toast(await copyText($('odCm')) ? 'Liste copiée : colle-la dans ta wishlist Cardmarket' : 'Sélectionne le texte et copie-le à la main');
      if (y === 'delDeck') {
        if (b.dataset.sure) { decks()[st.deckId] = { deleted: true, mt: now() }; App.scheduleSave(); App.closeModal(); render(); App.toast('Deck supprimé'); }
        else { b.dataset.sure = '1'; b.textContent = 'Confirmer la suppression'; }
      }
    }
  });

  // ---------- Pour le scan (appli Android) ----------
  // Code imprimé en bas à droite de la carte (OP01-001). Les versions parallèles ont le même code :
  // la version normale de l'extension du code est proposée d'office, les autres en un toucher.
  function lookupScan(res) {
    if (!st.idx) return null;
    for (const code of Core.opCodesInText(res && res.text)) {
      const c = card(code); if (!c) continue;
      const ci = st.idx.byId.get(code);
      const prints = c.p.map((p, pi) => ({ ci, pi, card: c, p }));
      const home = code.startsWith('P-') ? '' : normSet(code.split('-')[0]);
      let auto = prints.findIndex(x => !x.p[3] && normSet(setCode(x.p[0])) === home);
      if (auto < 0) auto = prints.findIndex(x => !x.p[3]);
      return { code, card: c, prints, auto: auto < 0 ? null : auto, lang: '' };
    }
    return null;
  }

  window.CoffreOp = {
    get ready() { return !!st.db; },
    render, refreshDb, lookupScan, curLang, openCard, label,
    locCode: code => code,
    addPrinting: (ci, pi, delta, lang) => addPrinting(ci, pi, delta, lang),
    addGeneric: id => addGeneric(id, 1), removeGeneric: id => addGeneric(id, -1),
    imgTag: (id, cls) => { const c = card(id); return imgTag(c ? c.im : id, cls); },
    printName: p => rarName(p),
    loadImages, ownedOf, money
  };
  const start = () => { st.view = ['decks', 'wish'].includes(App.data.settings.opView) ? App.data.settings.opView : 'col'; render(); loadDb(); };
  if (window.coffreReady) start(); else document.addEventListener('coffre:ready', start, { once: true });
})();
