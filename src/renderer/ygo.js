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
    if (st.db && now() - (st.db.at || 0) > 14 * 864e5) refreshDb(true);
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
  function addPrinting(ci, pi, delta = 1) {
    const c = st.db.cards[ci], p = c.p[pi];
    return changeEntry(Core.ygoKey(p[1], p[2]), { id: c.i, code: p[1], r: p[2] }, delta);
  }
  function addGeneric(id, delta = 1) { return changeEntry(`${id}|*`, { id, code: '', r: '' }, delta); }

  function stats() {
    let cards = 0, copies = 0; const ids = new Set();
    for (const e of Object.values(col())) if (e && e.qty > 0) { copies += e.qty; ids.add(e.id); }
    cards = ids.size;
    $('ygoStats').innerHTML = `<b>${cards}</b> cartes · ${copies} exemplaires · ${Object.values(App.data.decks || {}).filter(d => d && !d.deleted).length} decks`;
    $('tabYgoCount').textContent = cards;
  }

  // ---------- Rendu de l'onglet ----------
  function toolsHtml() {
    if (st.view === 'decks') return `<button class="primary" data-y="newDeck">Nouveau deck</button>`;
    return `<button class="primary" data-y="add">Ajouter des cartes</button>
      <input type="search" id="ygoQ" placeholder="Filtrer ma collection (nom, code)…" value="${esc(st.q)}">
      ${layoutSeg('ygoLayout')}
      <select id="ygoSort" aria-label="Trier"><option value="name">Par nom</option><option value="added">Derniers ajouts</option><option value="code">Par code</option></select>`;
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
    list.innerHTML = st.view === 'decks' ? decksHtml() : collectionHtml();
    loadImages(list);
    refreshOpenModal();
  }

  function collectionHtml() {
    const q = st.q.trim().toLowerCase();
    const rows = [];
    for (const [key, e] of Object.entries(col())) {
      if (!e || !(e.qty > 0)) continue;
      const c = card(e.id); if (!c) continue;
      if (q && !(c.s.includes(q) || (e.code || '').toLowerCase().includes(q))) continue;
      const p = e.code ? c.p.find(x => x[1] === e.code && x[2] === e.r) : null;
      rows.push({ key, e, c, p });
    }
    if (!rows.length) {
      return `<div class="empty">${Object.keys(col()).length && q ? 'Aucune carte ne correspond.' : "Ta collection est vide. Touche « Ajouter des cartes » pour chercher dans toutes les cartes du jeu" + (App.info.platform === 'mobile' ? ', ou scanne le code imprimé sous l\'illustration (ex. SGX1-FRA18).' : '.')}</div>`;
    }
    const by = { name: (a, b) => label(a.c).localeCompare(label(b.c), 'fr'), added: (a, b) => (b.e.mt || 0) - (a.e.mt || 0), code: (a, b) => (a.e.code || '~').localeCompare(b.e.code || '~') };
    rows.sort(by[st.sort] || by.name);
    if (gal()) return `<div class="gal">` + rows.map(({ key, e, c, p }) => `<div class="gcard own" data-key="${esc(key)}" data-id="${c.i}">
        <button class="pic" data-y="card" aria-label="Détails de ${esc(label(c))}">${imgTag(c.i)}<span class="badge">×${e.qty}</span></button>
        <div class="cap"><span class="num">${esc(e.code || "toute extension")}${p ? ' · ' + esc(p[2]) : ''}</span>${esc(label(c))}</div>${App.qtyHtml(e.qty)}</div>`).join('') + `</div>`;
    return rows.map(({ key, e, c, p }) => `<div class="yrow" data-key="${esc(key)}" data-id="${c.i}">
        <button class="ypic" data-y="card">${imgTag(c.i)}</button>
        <div class="yinfo"><button class="nm" data-y="card">${esc(label(c))}</button>${sub(c) ? `<span class="en">${esc(sub(c))}</span>` : ''}
          <span class="meta">${e.code ? `<span class="code">${esc(e.code)}</span><span>${esc(p ? p[3] : e.r)}</span><span>${esc(p ? setName(p[0]) : '')}</span>` : `<span class="tag">peu importe l'extension</span>`}</span></div>
        ${App.qtyHtml(e.qty)}</div>`).join('');
  }

  // ---------- Decks ----------
  const decks = () => App.data.decks || (App.data.decks = {});
  const liveDecks = () => Object.entries(decks()).filter(([, d]) => d && !d.deleted);
  function deckCounts(d) {
    let total = 0, missing = 0;
    for (const [id, q] of Object.entries(d.cards || {})) {
      total += q; missing += Math.max(0, q - ownedOf(Number(id)));
    }
    return { total, missing };
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
        <span class="a">${total} cartes · ${missing ? `<b class="miss">${missing} manquante${missing > 1 ? 's' : ''}</b>` : 'complet'}</span></button>`;
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
        <span class="meta"><span>${esc(c.ty)}</span>${c.k !== '' ? `<span>${c.k}/${c.d === '' ? '—' : c.d}</span>` : ''}${ownedOf(c.i) ? `<span class="own">${ownedOf(c.i)} dans ta collection</span>` : ''}</span></div>
      ${act}</div>`;

  function openDeck(id, keep) {
    if (!keep) { st.deckQ = ''; st.deckView = 'all'; }
    st.deckId = id;
    App.openModal(`<div id="ydeckSheet"></div>`, 'ygo wide', 'ygo-deck');
    renderDeck();
  }
  function renderDeck(keepFocus) {
    const box = $('ydeckSheet'); if (!box) return;
    const d = decks()[st.deckId]; if (!d || d.deleted) { App.closeModal(); return; }
    const entries = Object.entries(d.cards || {}).map(([id, q]) => ({ c: card(Number(id)), q, owned: ownedOf(Number(id)) })).filter(x => x.c);
    const missingList = entries.filter(x => x.q > x.owned);
    const shown = st.deckView === 'miss' ? missingList : entries;
    const dq = q => `<div class="qty"><button data-y="dq" data-d="-1" aria-label="Retirer du deck">−</button><output>${q}</output><button data-y="dq" data-d="1" aria-label="Ajouter au deck">+</button></div>`;
    const tile = ({ c, q, owned }) => `<div class="gcard${owned >= q ? ' own' : ' short'}" data-id="${c.i}">
        <button class="pic" data-y="card" aria-label="Détails de ${esc(label(c))}">${imgTag(c.i)}<span class="badge">×${q}</span></button>
        <div class="cap"><span class="num">${owned >= q ? `<span class="own">${owned} possédée${owned > 1 ? 's' : ''}</span>` : `<span class="miss">il en manque ${q - owned}</span>`}</span>${esc(label(c))}</div>${dq(q)}</div>`;
    const group = (title, arr) => arr.length ? `<h4>${title} <span class="num">${arr.reduce((a, x) => a + x.q, 0)}</span></h4>` + (gal() ? `<div class="gal">${arr.sort((a, b) => label(a.c).localeCompare(label(b.c), 'fr')).map(tile).join('')}</div>` : arr.sort((a, b) => label(a.c).localeCompare(label(b.c), 'fr')).map(({ c, q, owned }) => `
      <div class="yrow${owned >= q ? ' ok' : ' short'}" data-id="${c.i}">
        <button class="ypic" data-y="card">${imgTag(c.i)}</button>
        <div class="yinfo"><button class="nm" data-y="card">${esc(label(c))}</button>${sub(c) ? `<span class="en">${esc(sub(c))}</span>` : ''}
          <span class="meta">${owned >= q ? `<span class="own">${owned} possédée${owned > 1 ? 's' : ''}</span>` : `<span class="miss">il en manque ${q - owned}</span><span>(${owned} possédée${owned > 1 ? 's' : ''})</span>`}</span></div>
        ${dq(q)}</div>`).join('')) : '';
    const main = shown.filter(x => !isExtra(x.c)), extra = shown.filter(x => isExtra(x.c));
    const mainCount = entries.filter(x => !isExtra(x.c)).reduce((a, x) => a + x.q, 0);
    const extraCount = entries.filter(x => isExtra(x.c)).reduce((a, x) => a + x.q, 0);
    const results = searchCards(st.deckQ, 30);
    const cm = missingList.map(x => Core.cmLine(x.q - x.owned, x.c.n)).join('\n');
    const q = $('ydQ'), hadFocus = q && document.activeElement === q, caret = q ? q.selectionStart : 0;
    box.innerHTML = `
      <div class="sheet-head"><input id="ydName" class="dname" value="${esc(d.name || '')}" aria-label="Nom du deck">
        <button class="close" data-y="close">Fermer</button></div>
      <p class="hint">${mainCount} cartes dans le Main Deck${extraCount ? ` · ${extraCount} dans l'Extra Deck` : ''} · ${missingList.length ? `<b class="miss">${missingList.reduce((a, x) => a + x.q - x.owned, 0)} carte(s) manquante(s)</b>` : 'tu as toutes les cartes'}</p>
      <div class="ydeckbar">
        <input type="search" id="ydQ" placeholder="Ajouter une carte : nom (français ou anglais) ou code…" value="${esc(st.deckQ)}">
        <div class="seg" id="ydView"><button data-v="all" aria-pressed="${st.deckView === 'all'}">Toutes</button><button data-v="miss" aria-pressed="${st.deckView === 'miss'}">Manquantes</button></div>
        ${layoutSeg('ydLayout')}
      </div>
      ${st.deckQ ? `<div class="yresults">${results.length ? results.map(c => resultHtml(c, `<button class="primary" data-y="dadd">+ Deck</button>`)).join('') : '<p class="hint">Aucune carte trouvée.</p>'}</div>` : ''}
      <div class="ydecklist">${group('Main Deck', main)}${group('Extra Deck', extra)}${!shown.length ? `<p class="hint">${st.deckView === 'miss' ? 'Aucune carte manquante.' : 'Deck vide : cherche une carte au-dessus pour l\'ajouter.'}</p>` : ''}</div>
      ${missingList.length ? `<div class="ycm"><h4>Manquantes pour ta wishlist Cardmarket</h4>
        <textarea id="ydCm" readonly rows="${Math.min(8, missingList.length)}">${esc(cm)}</textarea>
        <div class="actions"><span class="hint grow">Cardmarket → Wishlist → « Ajouter des cartes » : colle la liste (une carte par ligne).</span><button class="primary" data-y="copy">Copier la liste</button></div></div>` : ''}
      <div class="actions"><button class="danger" data-y="delDeck">Supprimer ce deck</button></div>`;
    if (hadFocus || keepFocus) { const n = $('ydQ'); n.focus(); try { n.setSelectionRange(caret, caret); } catch (e) { /* rien */ } }
    loadImages(box);
  }

  // ---------- Fiche d'une carte (toutes ses impressions) ----------
  let cardBack = null;
  function openCard(id, back) {
    const c = card(id); if (!c) return;
    cardBack = back || null;
    App.openModal(`<div id="ycardSheet" data-id="${id}"></div>`, 'ygo wide', 'ygo-card');
    renderCard();
  }
  function renderCard() {
    const box = $('ycardSheet'); if (!box) return;
    const c = card(Number(box.dataset.id)); if (!c) return;
    const gen = col()[`${c.i}|*`];
    const prints = c.p.map((p, pi) => ({ p, pi, e: col()[Core.ygoKey(p[1], p[2])] }))
      .sort((a, b) => ((b.e && b.e.qty) || 0) - ((a.e && a.e.qty) || 0) || a.p[1].localeCompare(b.p[1]));
    const ds = liveDecks();
    box.innerHTML = `
      <div class="sheet-head"><div><h3>${esc(label(c))}</h3>${sub(c) ? `<div class="meta">${esc(sub(c))}</div>` : ''}</div>
        <button data-y="${cardBack ? 'back' : 'close'}">${cardBack ? '← Retour' : 'Fermer'}</button></div>
      <div class="split">
        <div>${imgTag(c.i, 'big')}</div>
        <div style="display:flex;flex-direction:column;gap:12px;min-width:0">
          <dl class="kv"><dt>Type</dt><dd>${esc(c.ty)}${c.r ? ' · ' + esc(c.r) : ''}${c.a ? ' · ' + esc(c.a) : ''}</dd>
            ${c.l !== '' ? `<dt>${/link/.test(c.t) ? 'Lien' : /xyz/.test(c.t) ? 'Rang' : 'Niveau'}</dt><dd>${c.l}</dd>` : ''}
            ${c.k !== '' ? `<dt>ATK / DEF</dt><dd>${c.k} / ${c.d === '' ? '—' : c.d}</dd>` : ''}
            <dt>Dans ta collection</dt><dd><b>${ownedOf(c.i)}</b></dd></dl>
          <div class="actions" style="justify-content:flex-start">
            ${ds.length ? `<select id="ycDeck">${ds.map(([id, d]) => `<option value="${id}">${esc(d.name || 'Deck')}</option>`).join('')}</select><button data-y="toDeck">Ajouter au deck</button>` : ''}
            <a data-y="cm">Voir sur Cardmarket ↗</a></div>
          <h4>Ajouter à ma collection</h4>
          <div class="yprints">
            <div class="yprint" data-gen="1"><div><b>Peu importe l'extension</b></div>${App.qtyHtml((gen && gen.qty) || 0)}</div>
            ${prints.map(({ p, pi, e }) => `<div class="yprint${e && e.qty ? ' own' : ''}" data-pi="${pi}">
              <div><span class="code">${esc(p[1])}</span> <span class="tag">${esc(p[3] || p[2])}</span><div class="hint">${esc(setName(p[0]))}</div></div>
              ${App.qtyHtml((e && e.qty) || 0)}</div>`).join('')}
          </div>
        </div></div>`;
    loadImages(box);
  }

  // ---------- Ajout de cartes à la collection ----------
  function openAdd() {
    App.openModal(`
      <div class="sheet-head"><h3>Ajouter des cartes</h3><button class="close" data-y="close">Fermer</button></div>
      <input type="search" id="yaQ" placeholder="Nom de carte (français ou anglais), code (SGX1-FRA18) ou extension…" value="${esc(st.addQ)}" autofocus>
      <div class="yresults" id="yaRes"></div>`, 'ygo wide', 'ygo-add');
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
  const qtyOf = (code, r) => { const e = col()[Core.ygoKey(code, r)]; return (e && e.qty) || 0; };
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
          <span class="hint">${cur ? `<b>${cur.own}</b> / ${cur.total} en ${esc(st.setRarity)}` : `<b>${own}</b> / ${total} cartes de l'extension · ${allV.own} / ${allV.total} versions (toutes raretés)`}</span></div>
        <div class="seg" id="ysView"><button data-sv="all" aria-pressed="${st.setView === 'all'}">Toutes</button><button data-sv="miss" aria-pressed="${st.setView === 'miss'}">Manquantes</button></div>
        ${miss ? `<button data-y="copySet" title="Format wishlist Cardmarket : 1 Nom (Extension)">Copier les manquantes</button>` : ''}
        ${rars.length > 1 ? `<div class="yrars"><button class="chip" data-rar="" aria-pressed="${!st.setRarity}">Toutes raretés</button>${rars.map(([k, v]) => `<button class="chip${v.own === v.total ? ' done' : ''}" data-rar="${esc(k)}" aria-pressed="${st.setRarity === k}">${esc(k)} <b>${v.own}/${v.total}</b></button>`).join('')}</div>` : ''}</div>
      <textarea id="ysCm" hidden readonly>${esc(miss)}</textarea>
      ${rows.length ? rows.map(({ ci, pi, c, p }) => { const q = qtyOf(p[1], p[2]); return `<div class="yres${q ? ' owned' : ''}" data-id="${c.i}">
        <button class="ypic" data-y="card">${imgTag(c.i)}</button>
        <div class="yinfo"><button class="nm" data-y="card">${esc(label(c))}</button>${sub(c) ? `<span class="en">${esc(sub(c))}</span>` : ''}
          <span class="meta"><span class="code">${esc(p[1])}</span><span class="rar">${esc(rarName(p))}</span></span></div>
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
      const c = st.db.cards[ci], p = c.p[pi], e = col()[Core.ygoKey(p[1], p[2])];
      return resultHtml(c, `<div class="yquick" data-ci="${ci}" data-pi="${pi}"><span class="code">${esc(p[1])}</span> <span class="tag">${esc(p[3] || p[2])}</span>${App.qtyHtml((e && e.qty) || 0)}</div>`);
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
  });
  $('ygoTools').addEventListener('click', e => { const b = e.target.closest('#ygoLayout button'); if (b) setLayout(b.dataset.v); });
  $('ygoTools').addEventListener('input', e => { if (e.target.id === 'ygoQ') { st.q = e.target.value; render(); } });
  $('ygoTools').addEventListener('change', e => { if (e.target.id === 'ygoSort') { st.sort = e.target.value; render(); } });
  $('ygoList').addEventListener('click', e => {
    const b = e.target.closest('[data-y],[data-act]'); if (!b) return;
    if (b.dataset.y === 'dl') return refreshDb();
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
      if (y === 'dq' && row) {
        const id = Number(row.dataset.id); const n = (d.cards[id] || 0) + Number(b.dataset.d);
        if (n > 0) d.cards[id] = n; else delete d.cards[id];
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

  window.CoffreYgo = {
    render, refreshDb, lookupCodes, addPrinting, openCard, label,
    get ready() { return !!st.db; },
    imgTag, loadImages,
    ownedOf
  };
  const start = () => { st.view = App.data.settings.ygoView === 'decks' ? 'decks' : 'col'; render(); loadDb(); };
  if (window.coffreReady) start(); else document.addEventListener('coffre:ready', start, { once: true });
})();
