// Coffre — interface
'use strict';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- Données des cartes ----------
const TYPE_NAME = { M: 'Monstre', G: 'Magie', E: 'Équipement', F: 'Terrain', R: 'Rituel', T: 'Piège' };
const CARDS = window.FM_RAW.map((r, i) => {
  const p = r.split('|'); const t = p[1]; const m = t === 'M';
  return {
    n: String(i + 1).padStart(3, '0'), name: p[0], t,
    race: m ? p[2] : '', lvl: m ? p[3] : '', atk: m ? p[4] : '', def: m ? p[5] : '',
    pw: (m ? p[6] : p[p.length - 2]) || '', cost: (m ? p[7] : p[p.length - 1]) || ''
  };
});
const HAS_IMG = new Set(window.FM_IMG || []);
const cardImg = n => `${window.CARD_IMG_BASE || '../assets/cards/'}${n}.webp`;
const fmtCost = c => !c ? '—' : c === '999999' ? 'non achetable' : Number(c).toLocaleString('fr-FR') + ' ★';

// ---------- État ----------
let data = null;
let info = { coversUrl: '', version: '' };
const fmF = { q: '', t: '', v: 'all' };
const vinF = { q: '', v: 'all', sort: 'artist' };
const search = { q: '', source: 'discogs', page: 1, results: [], hasMore: false, loading: false, error: '' };
let modalKind = null;

const coverUrl = name => name ? info.coversUrl + encodeURIComponent(name) : '';
const discogsAuth = () => ({ token: data.settings.discogsToken || '', key: data.settings.discogsKey || '', secret: data.settings.discogsSecret || '' });
const hasDiscogs = () => !!(data.settings.discogsToken || (data.settings.discogsKey && data.settings.discogsSecret));
const now = () => Date.now();
const liveVinyls = () => Object.entries(data.vinyls).filter(([, v]) => v && !v.deleted);
const uid = () => 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ---------- Sauvegarde ----------
let saveTimer = null;
function scheduleSave() {
  $('savedState').textContent = 'Enregistrement…';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try { await window.coffre.save(data); $('savedState').textContent = 'Enregistré'; }
    catch (e) { $('savedState').textContent = "Échec de l'enregistrement"; }
  }, 400);
}

// ---------- Utilitaires d'interface ----------
function seg(id, value, cb) {
  const el = $(id);
  const mark = v => el.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === v)));
  mark(value);
  el.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; mark(b.dataset.v); cb(b.dataset.v); });
}

function openModal(html, cls = '') {
  $('sheet').className = 'sheet ' + cls;
  $('sheet').innerHTML = html;
  $('modal').hidden = false;
  const first = $('sheet').querySelector('[autofocus]');
  if (first) first.focus();
}
function closeModal() { $('modal').hidden = true; $('sheet').innerHTML = ''; modalKind = null; }
$('modal').addEventListener('mousedown', e => { if (e.target.id === 'modal' && ['card', 'vinyl', 'settings', 'ygo-card', 'ygo-add', 'op-card', 'op-add', 'news'].includes(modalKind)) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('modal').hidden) closeModal(); });

// ============================================================
//  CARTES FORBIDDEN MEMORIES
// ============================================================
function fmStats() {
  let owned = 0, copies = 0;
  for (const k in data.fm) { const q = data.fm[k].qty || 0; if (q > 0) { owned++; copies += q; } }
  $('fmOwned').textContent = owned;
  $('fmCopies').textContent = copies;
  $('fmBar').style.width = (owned / 722 * 100).toFixed(2) + '%';
  $('tabFmCount').textContent = `${owned}/722`;
}

function qtyHtml(qty) {
  return `<div class="qty"><button data-act="dec" aria-label="Retirer un exemplaire" ${!qty ? 'disabled' : ''}>−</button><output>${qty}</output><button data-act="inc" aria-label="Ajouter un exemplaire">+</button></div>`;
}

function renderFm() {
  fmStats();
  const q = fmF.q.trim().toLowerCase();
  const gal = data.settings.layout !== 'list';
  const out = [];
  for (const c of CARDS) {
    const d = data.fm[c.n] || {}; const qty = d.qty || 0;
    if (fmF.t && c.t !== fmF.t) continue;
    if (fmF.v === 'own' && !qty) continue;
    if (fmF.v === 'miss' && qty) continue;
    if (fmF.v === 'dup' && qty < 2) continue;
    if (q && !(c.name.toLowerCase().includes(q) || c.n.includes(q) || Number(c.n) === Number(q) || (c.pw && c.pw.includes(q)))) continue;
    const pic = HAS_IMG.has(c.n) ? `<img src="${cardImg(c.n)}" alt="" loading="lazy">` : `<span class="noimg">pas d'image</span>`;
    if (gal) {
      out.push(`<div class="gcard${qty ? ' own' : ''}" data-n="${c.n}">
        <button class="pic" data-act="open" aria-label="Détails de ${esc(c.name)}">${pic}${qty ? `<span class="badge">×${qty}</span>` : ''}</button>
        <div class="cap"><span class="num">${c.n}</span>${esc(c.name)}</div>${qtyHtml(qty)}</div>`);
    } else {
      const stats = c.t === 'M' ? `<span>${esc(c.race)}</span><span>Niv ${c.lvl}</span><span>${c.atk}/${c.def}</span>` : '';
      out.push(`<div class="row${qty ? ' own' : ''}" data-n="${c.n}"><span class="num">${c.n}</span>${pic}
        <div style="min-width:0"><button class="nm" data-act="open">${esc(c.name)}</button>
        <div class="meta"><span class="tag">${TYPE_NAME[c.t]}</span>${stats}${d.cond ? `<span>${esc(d.cond)}</span>` : ''}</div></div>${qtyHtml(qty)}</div>`);
    }
  }
  $('fmList').innerHTML = out.length ? (gal ? `<div class="gal">${out.join('')}</div>` : out.join('')) : `<div class="empty">Aucune carte ne correspond.</div>`;
}

function changeQty(n, delta) {
  const d = { ...(data.fm[n] || {}) };
  d.qty = Math.max(0, (d.qty || 0) + delta);
  d.mt = now();
  data.fm[n] = d;
  scheduleSave();
  return d.qty;
}

$('fmList').addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const n = b.closest('[data-n]').dataset.n;
  if (b.dataset.act === 'open') return openCard(n);
  changeQty(n, b.dataset.act === 'inc' ? 1 : -1);
  renderFm();
});

function openCard(n) {
  modalKind = 'card';
  const c = CARDS[Number(n) - 1]; const d = data.fm[n] || {}; const qty = d.qty || 0;
  const stats = c.t === 'M' ? `${esc(c.race)} · Niveau ${c.lvl} · ${c.atk} ATK / ${c.def} DEF` : TYPE_NAME[c.t];
  const conds = ['', 'Mint', 'Near Mint', 'Excellent', 'Good', 'Played', 'Poor'];
  openModal(`
    <div class="sheet-head"><div><span class="num">N° ${c.n}</span><h3>${esc(c.name)}</h3><div class="meta">${stats}</div></div>
      <button class="close" data-act="close">Fermer</button></div>
    <div class="split" data-n="${c.n}">
      ${HAS_IMG.has(c.n) ? `<img class="big" src="${cardImg(c.n)}" alt="${esc(c.name)}">` : `<span class="noimg">Carte propre au jeu, pas d'image</span>`}
      <div style="display:flex;flex-direction:column;gap:12px;min-width:0">
        <div>${qtyHtml(qty)}</div>
        <div class="form">
          <label class="f">État<select data-f="cond">${conds.map(o => `<option value="${o}" ${d.cond === o ? 'selected' : ''}>${o || '—'}</option>`).join('')}</select></label>
          <label class="f">Langue / édition<input data-f="lang" value="${esc(d.lang || '')}" placeholder="FR, EN, 1st edition…"></label>
          <label class="f wide">Notes<textarea data-f="note" placeholder="Où je l'ai eue, prix payé…">${esc(d.note || '')}</textarea></label>
        </div>
        <dl class="kv"><dt>Mot de passe</dt><dd>${c.pw || '—'}</dd><dt>Coût en étoiles</dt><dd>${fmtCost(c.cost)}</dd></dl>
        <div><a data-act="cm">Voir les prix sur Cardmarket ↗</a></div>
      </div>
    </div>`, 'card');
}

$('sheet').addEventListener('click', e => {
  if (modalKind !== 'card') return;
  const b = e.target.closest('[data-act]'); if (!b) return;
  const n = $('sheet').querySelector('[data-n]').dataset.n;
  const act = b.dataset.act;
  if (act === 'close') return closeModal();
  if (act === 'cm') return window.coffre.openExternal(`https://www.cardmarket.com/fr/YuGiOh/Products/Search?searchString=${encodeURIComponent(CARDS[Number(n) - 1].name)}`);
  if (act === 'inc' || act === 'dec') {
    changeQty(n, act === 'inc' ? 1 : -1);
    const qty = (data.fm[n] || {}).qty || 0;
    $('sheet').querySelector('.qty output').textContent = qty;
    $('sheet').querySelector('.qty [data-act=dec]').disabled = !qty;
    renderFm();
  }
});
$('sheet').addEventListener('change', e => {
  if (modalKind !== 'card') return;
  const f = e.target.dataset.f; if (!f) return;
  const n = $('sheet').querySelector('[data-n]').dataset.n;
  data.fm[n] = { ...(data.fm[n] || {}), [f]: e.target.value, mt: now() };
  scheduleSave(); renderFm();
});

$('fmSearch').addEventListener('input', e => { fmF.q = e.target.value; renderFm(); });

// ---------- Wishlist Cardmarket des cartes FM manquantes ----------
// Chaque carte FM est retrouvée dans la base Yu-Gi-Oh (mot de passe, sinon nom) pour écrire son nom officiel.
// Les cartes qui n'existent que dans le jeu (pas de version papier) sont mises à part.
function fmFiltered(c) {
  const q = fmF.q.trim().toLowerCase();
  if (fmF.t && c.t !== fmF.t) return false;
  if (q && !(c.name.toLowerCase().includes(q) || c.n.includes(q) || Number(c.n) === Number(q) || (c.pw && c.pw.includes(q)))) return false;
  return true;
}
let fmWishScope = 'all', fmWishKeep = false;
function openFmWish() {
  modalKind = 'fmwish';
  fmWishScope = (fmF.q.trim() || fmF.t) ? 'shown' : 'all';
  openModal(`<div class="sheet-head"><h3>Wishlist Cardmarket — cartes FM</h3><button class="close" data-act="close">Fermer</button></div><div id="fmWishBox"></div>`, 'card');
  renderFmWish();
}
function renderFmWish() {
  const box = $('fmWishBox'); if (!box) return;
  const Y = window.CoffreYgo;
  const missing = CARDS.filter(c => !((data.fm[c.n] || {}).qty) && (fmWishScope === 'all' || fmFiltered(c)));
  const lines = [], fmOnly = []; let value = 0;
  for (const c of missing) {
    const real = Y && Y.dbReady ? Y.matchCard(c.name, c.pw) : null;
    if (Y && Y.dbReady && !real) { fmOnly.push(c); if (!fmWishKeep) continue; }
    lines.push(`1 ${real ? real.n : c.name}`);
    if (real && real.cm) value += real.cm;
  }
  const filtered = !!(fmF.q.trim() || fmF.t);
  box.innerHTML = `
    ${filtered ? `<div class="seg" id="fmWishScope"><button data-scope="all" aria-pressed="${fmWishScope === 'all'}">Toutes les manquantes</button><button data-scope="shown" aria-pressed="${fmWishScope === 'shown'}">Seulement le filtre actuel</button></div>` : ''}
    <p><b>${lines.length}</b> carte${lines.length > 1 ? 's' : ''} à mettre dans ta wishlist${value ? ` · ≈ <b class="price">${esc(Y.money(value))}</b> (prix de référence Cardmarket)` : ''}.</p>
    <textarea id="fmWishText" readonly rows="10">${esc(lines.join('\n'))}</textarea>
    <div class="actions"><span class="hint grow">Cardmarket → Wishlist → « Ajouter des cartes » : colle la liste (une carte par ligne).</span>
      <button class="primary" data-act="copyWish" ${lines.length ? '' : 'disabled'}>Copier la liste</button></div>
    ${!(Y && Y.dbReady) ? `<p class="hint">Astuce : télécharge la base de cartes dans l'onglet Yu-Gi-Oh pour avoir les noms officiels Cardmarket, les prix, et mettre à part les cartes qui n'existent pas en vrai.</p>` : ''}
    ${fmOnly.length ? `<details><summary>${fmOnly.length} carte${fmOnly.length > 1 ? 's' : ''} introuvable${fmOnly.length > 1 ? 's' : ''} dans la base (propres au jeu, ou nom différent) — ${fmWishKeep ? 'incluses' : 'exclues'}</summary>
      <p class="hint">${fmOnly.map(c => esc(c.n + ' ' + c.name)).join(' · ')}</p>
      <button data-act="keepWish">${fmWishKeep ? 'Les retirer de la liste' : 'Les ajouter quand même'}</button></details>` : ''}`;
}
$('fmWishBtn').addEventListener('click', openFmWish);
$('sheet').addEventListener('click', async e => {
  if (modalKind !== 'fmwish') return;
  const b = e.target.closest('[data-act],[data-scope]'); if (!b) return;
  if (b.dataset.scope) { fmWishScope = b.dataset.scope; return renderFmWish(); }
  if (b.dataset.act === 'close') return closeModal();
  if (b.dataset.act === 'keepWish') { fmWishKeep = !fmWishKeep; renderFmWish(); const d = $('fmWishBox').querySelector('details'); if (d) d.open = true; return; }
  if (b.dataset.act === 'copyWish') {
    const t = $('fmWishText'); let ok = false;
    try { await navigator.clipboard.writeText(t.value); ok = true; } catch (err) { t.removeAttribute('readonly'); t.select(); try { ok = document.execCommand('copy'); } catch (e2) { ok = false; } t.setAttribute('readonly', ''); }
    toast(ok ? 'Liste copiée : colle-la dans ta wishlist Cardmarket' : 'Sélectionne le texte et copie-le à la main');
  }
});
$('fmType').addEventListener('change', e => { fmF.t = e.target.value; renderFm(); });

// ============================================================
//  VINYLES — collection
// ============================================================
// Pochette affichée depuis Discogs (adresse « img ») ; rien n'est enregistré sur l'appareil.
// (« cover » = ancienne pochette enregistrée, gardée seulement le temps de retrouver son adresse en ligne)
function coverHtml(v, cls = 'cover') {
  const src = v.img || (v.cover ? coverUrl(v.cover) : '');
  return src ? `<img class="${cls}" src="${src}" alt="" loading="lazy">` : `<div class="${cls} ph"></div>`;
}

// Pochette introuvable (hors ligne, lien expiré) : cadre vide à la place
document.addEventListener('error', e => {
  const img = e.target;
  if (img && img.tagName === 'IMG' && img.classList.contains('cover') && !img.dataset.ph) { const d = document.createElement('div'); d.className = img.className + ' ph'; img.replaceWith(d); }
}, true);

function renderVinyls() {
  const all = liveVinyls();
  $('vinOwned').textContent = all.filter(([, v]) => v.status !== 'wish').length;
  $('vinWish').textContent = all.filter(([, v]) => v.status === 'wish').length;
  $('tabVinCount').textContent = all.filter(([, v]) => v.status !== 'wish').length;
  const value = all.filter(([, v]) => v.status !== 'wish' && typeof v.dp === 'number').reduce((a, [, v]) => a + v.dp, 0);
  $('vinValue').innerHTML = value ? ` · valeur ≈ <b class="price">${eurFmt.format(value)}</b> <span class="hint">(Discogs)</span>` : '';
  if (!all.length) {
    $('vinList').innerHTML = `<div class="empty">Ton bac est vide.<br>Clique sur <b>Rechercher un vinyle</b>, tape un artiste ou un album, puis ajoute le disque avec sa pochette.</div>`;
    return;
  }
  const q = vinF.q.trim().toLowerCase();
  const rows = all.filter(([, v]) => {
    if (vinF.v === 'own' && v.status === 'wish') return false;
    if (vinF.v === 'wish' && v.status !== 'wish') return false;
    if (q && ![v.artist, v.title, v.label, v.catno, v.note, v.year].some(x => String(x || '').toLowerCase().includes(q))) return false;
    return true;
  });
  const s = vinF.sort;
  rows.sort(([, a], [, b]) => s === 'added' ? (b.added || 0) - (a.added || 0)
    : s === 'year' ? String(a.year || '9999').localeCompare(String(b.year || '9999'))
    : String(a.artist || '').localeCompare(String(b.artist || ''), 'fr') || String(a.year || '').localeCompare(String(b.year || '')));
  $('vinList').innerHTML = rows.length ? `<div class="vgrid">${rows.map(([id, v]) => `
    <button class="vcard${v.status === 'wish' ? ' wish' : ''}" data-id="${esc(id)}">
      ${coverHtml(v)}
      <span class="t">${esc(v.title)}</span>
      <span class="a">${esc(v.artist)}${v.year ? ' · ' + esc(v.year) : ''}</span>
      <span>${v.status === 'wish' ? '<span class="pill wish">Recherché</span>' : v.grade ? `<span class="pill">${esc(v.grade)}</span>` : ''} ${dpText(v) ? `<span class="price">${esc(dpText(v))}</span>` : ''}</span>
    </button>`).join('')}</div>` : `<div class="empty">Aucun disque ne correspond.</div>`;
}

$('vinList').addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (b) openVinyl(b.dataset.id); });
$('vinFilter').addEventListener('input', e => { vinF.q = e.target.value; renderVinyls(); });
$('vinSort').addEventListener('change', e => { vinF.sort = e.target.value; renderVinyls(); });

const GRADES = ['', 'M', 'NM', 'VG+', 'VG', 'G+', 'G', 'P'];
const gradeOpts = cur => GRADES.map(g => `<option value="${g}" ${cur === g ? 'selected' : ''}>${g || '—'}</option>`).join('');
const sourceName = s => s === 'discogs' ? 'Discogs' : s === 'musicbrainz' ? 'MusicBrainz' : 'ajout manuel';
const eurFmt = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const dpText = v => typeof v.dp === 'number' ? `dès ${eurFmt.format(v.dp)}` : '';

function tracksHtml(list) {
  if (!list || !list.length) return '';
  return `<div class="tracks">${list.map(t => `<div><span class="p">${esc(t.pos)}</span><span>${esc(t.title)}</span><span class="d">${esc(t.duration)}</span></div>`).join('')}</div>`;
}

// ---------- Prix Discogs (prix le plus bas en vente sur le marché Discogs) ----------
function vinylInfoHtml(v) {
  const rows = [['Label', v.label], ['Référence', v.catno], ['Format', v.format], ['Pays', v.country], ['Année', v.year], ['Genres', (v.genres || []).join(', ')]].filter(([, x]) => x);
  const price = typeof v.dp === 'number'
    ? `<dt>Prix Discogs</dt><dd><b class="price">${eurFmt.format(v.dp)}</b> <span class="hint">le moins cher en vente · ${v.dpN || 0} en vente${v.dpAt ? ' · ' + new Date(v.dpAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) : ''}</span></dd>`
    : (v.dpAt ? `<dt>Prix Discogs</dt><dd class="hint">aucun exemplaire en vente</dd>` : '');
  return `<dl class="kv">${rows.map(([k, x]) => `<dt>${k}</dt><dd>${esc(x)}</dd>`).join('')}${price}</dl>`;
}

// Met à jour le prix Discogs de chaque vinyle (une demande par seconde : limite de Discogs)
let priceRun = null;
async function refreshPrices(onlyStale) {
  if (priceRun) return;
  if (!hasDiscogs()) { if (!onlyStale) toast('Ajoute ta clé Discogs dans les réglages pour avoir les prix'); return; }
  const week = 7 * 864e5;
  const ids = liveVinyls().filter(([, v]) => v.source === 'discogs' && v.sourceId && (!onlyStale || !v.dpAt || Date.now() - v.dpAt > week)).map(([id]) => id);
  if (!ids.length) { if (!onlyStale) toast('Aucun vinyle Discogs à mettre à jour'); return; }
  priceRun = { done: 0, total: ids.length };
  const btn = $('vinPriceBtn');
  try {
    for (const id of ids) {
      const v = data.vinyls[id]; if (!v || v.deleted) continue;
      if (btn) btn.textContent = `Prix… ${priceRun.done + 1}/${priceRun.total}`;
      try {
        const d = await window.coffre.details({ source: 'discogs', id: v.sourceId, auth: discogsAuth() });
        data.vinyls[id] = { ...data.vinyls[id], dp: d.dp, dpN: d.dpN, dpAt: d.dpAt || Date.now(), ...(!v.img && d.cover ? { img: d.cover, cover: '' } : {}), mt: now() };
        scheduleSave(); renderVinyls();
      } catch (e) { if (/limite/i.test(String(e.message))) await new Promise(r => setTimeout(r, 10000)); }
      priceRun.done++;
      await new Promise(r => setTimeout(r, 1100));
    }
    if (!onlyStale) toast('Prix Discogs mis à jour');
  } finally {
    priceRun = null;
    if (btn) btn.textContent = 'Actualiser les prix';
  }
}

// Anciennes pochettes enregistrées sur l'appareil → adresse en ligne (Discogs / Cover Art Archive), puis effacées.
let coverRun = false;
async function migrateCovers() {
  if (coverRun) return; coverRun = true;
  try {
    for (const [id, v] of liveVinyls()) {
      if (!v.cover || v.img) continue;
      let img = '';
      if (v.source === 'discogs' && v.sourceId) {
        if (!hasDiscogs()) continue;   // il faut la clé Discogs pour retrouver l'adresse : on réessaiera
        try { img = (await window.coffre.details({ source: 'discogs', id: v.sourceId, auth: discogsAuth() })).cover || ''; } catch (e) { continue; }
        await new Promise(r => setTimeout(r, 1100));
      } else if (v.source === 'musicbrainz' && v.sourceId) {
        img = `https://coverartarchive.org/release/${encodeURIComponent(v.sourceId)}/front-500`;
      }
      const cur = data.vinyls[id]; if (!cur || cur.deleted) continue;
      data.vinyls[id] = { ...cur, img, cover: '', mt: now() };
      scheduleSave(); renderVinyls();
    }
    // Plus aucune pochette enregistrée, sauf celles qui attendent encore leur adresse
    const keep = liveVinyls().map(([, v]) => v.cover).filter(Boolean);
    if (window.coffre.purgeCovers) await window.coffre.purgeCovers(keep);
  } finally { coverRun = false; }
}
$('vinPriceBtn').addEventListener('click', () => refreshPrices(false));

// Fiche d'un vinyle de la collection
function openVinyl(id) {
  modalKind = 'vinyl';
  const v = data.vinyls[id]; if (!v) return;
  openModal(`
    <div class="sheet-head"><div><h3>${esc(v.title)}</h3><div class="meta">${esc(v.artist)}</div></div>
      <button class="close" data-act="close">Fermer</button></div>
    <div class="split" data-id="${esc(id)}">
      <div style="display:flex;flex-direction:column;gap:8px">${coverHtml(v)}</div>
      <div style="display:flex;flex-direction:column;gap:12px;min-width:0">
        ${vinylInfoHtml(v)}
        <div class="form">
          <label class="f">Statut<select data-f="status"><option value="own" ${v.status !== 'wish' ? 'selected' : ''}>Je l'ai</option><option value="wish" ${v.status === 'wish' ? 'selected' : ''}>Je le cherche</option></select></label>
          <label class="f">État (Goldmine)<select data-f="grade">${gradeOpts(v.grade)}</select></label>
          <label class="f">Prix (€)<input data-f="price" value="${esc(v.price || '')}" inputmode="decimal"></label>
          <label class="f wide">Notes<textarea data-f="note" placeholder="Couleur du vinyle, pressage, où je l'ai trouvé…">${esc(v.note || '')}</textarea></label>
        </div>
        ${tracksHtml(v.tracklist)}
      </div>
    </div>
    <div class="actions">
      <span class="hint grow">Source : ${sourceName(v.source)}${v.url ? ` · <a data-act="src">voir la fiche ↗</a>` : ''}</span>
      <span id="delZone"><button class="danger" data-act="ask">Retirer du coffre</button></span>
    </div>`, 'vinyl');
}

$('sheet').addEventListener('click', async e => {
  if (modalKind !== 'vinyl') return;
  const b = e.target.closest('[data-act]'); if (!b) return;
  const id = $('sheet').querySelector('[data-id]').dataset.id;
  const v = data.vinyls[id];
  switch (b.dataset.act) {
    case 'close': return closeModal();
    case 'src': return window.coffre.openExternal(v.url);
    case 'ask':
      $('delZone').innerHTML = `<span class="hint">Retirer ce disque ?</span> <button class="danger" data-act="del">Oui, retirer</button> <button data-act="nodel">Non</button>`; return;
    case 'nodel':
      $('delZone').innerHTML = `<button class="danger" data-act="ask">Retirer du coffre</button>`; return;
    case 'del':
      if (v.cover) window.coffre.deleteCover(v.cover);
      data.vinyls[id] = { deleted: true, mt: now() }; scheduleSave(); renderVinyls(); closeModal(); return;
  }
});
$('sheet').addEventListener('change', e => {
  if (modalKind !== 'vinyl') return;
  const f = e.target.dataset.f; if (!f) return;
  const id = $('sheet').querySelector('[data-id]').dataset.id;
  data.vinyls[id][f] = e.target.value; data.vinyls[id].mt = now(); scheduleSave(); renderVinyls();
});

// ============================================================
//  VINYLES — recherche en ligne
// ============================================================
function findInCollection(r) {
  const hit = liveVinyls().find(([, v]) => v.source === r.source && String(v.sourceId) === String(r.id));
  return hit ? hit[0] : undefined;
}

function openSearch() {
  modalKind = 'search';
  search.source = 'discogs';
  openModal(`
    <div class="sheet-head"><h3>Rechercher un vinyle</h3><button class="close" data-act="close">Fermer</button></div>
    <form class="searchbar" id="sForm">
      <input id="sQ" type="search" placeholder="Artiste, album, label, référence ou code-barres…" value="${esc(search.q)}" autofocus>
      <button class="primary" type="submit">Chercher sur Discogs</button>
    </form>
    ${search.hint ? `<div class="shint" id="sHint">${search.hint}</div>` : ''}
    <div class="results" id="sRes"></div>`, 'vinyl wide');
  $('sForm').addEventListener('submit', e => { e.preventDefault(); search.q = $('sQ').value.trim(); if (search.q) runSearch(1); });
  renderResults();
}

async function runSearch(page) {
  search.loading = true; search.error = ''; search.page = page;
  if (page === 1) search.results = [];
  renderResults();
  try {
    const r = await window.coffre.search({ q: search.q, source: search.source, page, auth: discogsAuth() });
    search.results = page === 1 ? r.results : search.results.concat(r.results);
    search.hasMore = r.hasMore;
    if (page === 1) startRerank();
  } catch (e) {
    search.error = String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
  }
  search.loading = false;
  if (modalKind === 'search') renderResults();
}

// Appli Android : les résultats sont ensuite classés selon leur ressemblance avec la photo de la pochette
function startRerank() {
  if (!search.rerank || !search.results.length) return;
  const token = search.token = {};
  search.reranking = true;
  search.rerank(search.results).then(sorted => {
    if (search.token !== token) return;
    search.reranking = false;
    if (sorted) search.results = sorted;
    if (modalKind === 'search') renderResults();
  }).catch(() => { search.reranking = false; if (modalKind === 'search') renderResults(); });
}

function renderResults() {
  const el = $('sRes'); if (!el) return;
  if (search.error) { el.innerHTML = `<div class="spinner error">${esc(search.error)}</div>`; return; }
  if (!search.results.length) {
    el.innerHTML = search.loading ? `<div class="spinner">Recherche…</div>`
      : `<div class="spinner">${search.q ? 'Aucun vinyle trouvé. Essaie avec moins de mots.' : hasDiscogs() ? 'Tape un nom ou un code-barres et appuie sur Entrée. Les résultats viennent directement de Discogs, les nouveautés comprises.' : 'Ajoute ta Consumer Key et ton Consumer Secret Discogs dans les réglages (⚙) pour pouvoir chercher.'}</div>`;
    return;
  }
  el.innerHTML = (search.reranking ? `<div class="spinner" style="padding:6px">Comparaison avec ta photo…</div>` : '') + search.results.map((r, i) => {
    const have = findInCollection(r);
    return `<button class="res" data-i="${i}">
      ${r.thumb ? `<img class="cover" src="${esc(r.thumb)}" alt="" loading="lazy" data-ph="1">` : `<div class="cover ph"></div>`}
      <span class="t">${esc(r.title)}</span><span class="a">${esc(r.artist)}</span>
      <span class="m">${[r.year, r.country, r.format].filter(Boolean).map(esc).join(' · ')}</span>
      ${r.label || r.catno ? `<span class="m">${esc([r.label, r.catno].filter(Boolean).join(' — '))}</span>` : ''}
      ${r.match ? `<span class="match">${esc(r.match)}</span>` : ''}
      ${have ? `<span class="have">Déjà dans ton coffre</span>` : ''}
    </button>`;
  }).join('') + (search.loading ? `<div class="spinner">Chargement…</div>` : search.hasMore ? `<button class="more" data-act="more">Plus de résultats</button>` : '');
  // Pochette manquante : on remplace par le disque stylisé
  el.querySelectorAll('img[data-ph]').forEach(img => img.addEventListener('error', () => { const d = document.createElement('div'); d.className = 'cover ph'; img.replaceWith(d); }, { once: true }));
}

// Fiche d'un résultat avant ajout
async function openRelease(r) {
  modalKind = 'release';
  const have = findInCollection(r);
  openModal(`
    <div class="sheet-head"><div><h3>${esc(r.title)}</h3><div class="meta">${esc(r.artist)}</div></div>
      <button data-act="back">← Retour aux résultats</button></div>
    <div class="split">
      <div id="rCover">${r.cover || r.thumb ? `<img class="cover" src="${esc(r.cover || r.thumb)}" alt="">` : `<div class="cover ph"></div>`}</div>
      <div style="display:flex;flex-direction:column;gap:12px;min-width:0">
        <div id="rInfo">${vinylInfoHtml(r)}<p class="hint">Chargement des détails…</p></div>
        ${have ? `<p class="hint">Ce pressage est déjà dans ton coffre.</p>` : ''}
        <div class="form">
          <label class="f">Statut<select id="aStatus"><option value="own">Je l'ai</option><option value="wish">Je le cherche</option></select></label>
          <label class="f">État (Goldmine)<select id="aGrade">${gradeOpts('')}</select></label>
          <label class="f">Prix (€)<input id="aPrice" inputmode="decimal"></label>
          <label class="f wide">Notes<textarea id="aNote" placeholder="Couleur du vinyle, pressage, où je l'ai trouvé…"></textarea></label>
        </div>
        <div class="actions"><span class="hint grow" id="aMsg"></span>
          ${have ? `<button data-act="see">Voir dans mon coffre</button>` : ''}
          <button class="primary" data-act="add">Ajouter au coffre</button></div>
        <div id="rTracks"></div>
      </div>
    </div>`, 'vinyl wide');
  $('sheet').dataset.release = JSON.stringify(r);
  const cover = $('rCover').querySelector('img');
  if (cover) cover.addEventListener('error', () => { $('rCover').innerHTML = `<div class="cover ph"></div>`; }, { once: true });
  try {
    const d = await window.coffre.details({ source: r.source, id: r.id, auth: discogsAuth() });
    if (modalKind !== 'release') return;
    const full = { ...r, ...Object.fromEntries(Object.entries(d).filter(([, x]) => x && (!Array.isArray(x) || x.length))) };
    $('sheet').dataset.release = JSON.stringify(full);
    $('rInfo').innerHTML = vinylInfoHtml(full);
    $('rTracks').innerHTML = tracksHtml(full.tracklist);
    if (d.cover && d.cover !== r.cover) $('rCover').innerHTML = `<img class="cover" src="${esc(d.cover)}" alt="">`;
  } catch (e) {
    if ($('rInfo')) $('rInfo').innerHTML = vinylInfoHtml(r) + `<p class="hint">Détails indisponibles pour l'instant. Tu peux quand même l'ajouter.</p>`;
  }
}

async function addRelease() {
  const r = JSON.parse($('sheet').dataset.release);
  const btn = $('sheet').querySelector('[data-act=add]');
  btn.disabled = true;
  const img = r.cover || r.thumb || '';
  const id = uid();
  data.vinyls[id] = {
    source: r.source, sourceId: r.id, url: r.url || '',
    artist: r.artist || '', title: r.title || '', year: r.year || '', country: r.country || '',
    label: r.label || '', catno: r.catno || '', format: r.format || '',
    genres: r.genres || [], tracklist: r.tracklist || [],
    status: $('aStatus').value, grade: $('aGrade').value, price: $('aPrice').value.trim(), note: $('aNote').value.trim(),
    img, added: now(), mt: now(),
    ...(r.dpAt ? { dp: r.dp, dpN: r.dpN, dpAt: r.dpAt } : {})
  };
  scheduleSave(); renderVinyls();
  $('aMsg').textContent = 'Ajouté au coffre.';
  setTimeout(() => { if (modalKind === 'release') backToSearch(); }, 700);
}

function backToSearch() { openSearch(); }

$('sheet').addEventListener('click', e => {
  if (modalKind === 'search') {
    const b = e.target.closest('[data-act], [data-i]'); if (!b) return;
    if (b.dataset.act === 'close') return closeModal();
    if (b.dataset.act === 'more') return runSearch(search.page + 1);
    if (b.dataset.i !== undefined) return openRelease(search.results[Number(b.dataset.i)]);
  } else if (modalKind === 'release') {
    const b = e.target.closest('[data-act]'); if (!b) return;
    if (b.dataset.act === 'back') return backToSearch();
    if (b.dataset.act === 'add') return addRelease();
    if (b.dataset.act === 'see') { const r = JSON.parse($('sheet').dataset.release); return openVinyl(findInCollection(r)); }
  }
});

$('vinFindBtn').addEventListener('click', () => { search.rerank = null; search.hint = ''; openSearch(); });

// ============================================================
//  VINYLES — ajout à la main
// ============================================================
function openManual() {
  modalKind = 'manual';
  openModal(`
    <div class="sheet-head"><h3>Ajouter un vinyle à la main</h3><button class="close" data-act="close">Fermer</button></div>
    <p class="hint">Pour un pressage introuvable en ligne (il n'aura pas de pochette).</p>
    <div>
      <form class="form" id="mForm">
        <label class="f">Artiste<input id="mArtist" required autofocus></label>
        <label class="f">Album<input id="mTitle" required></label>
        <label class="f">Année<input id="mYear" inputmode="numeric" maxlength="4"></label>
        <label class="f">Label<input id="mLabel"></label>
        <label class="f">Référence<input id="mCatno"></label>
        <label class="f">Format<input id="mFormat" value="LP"></label>
        <label class="f">Pays<input id="mCountry"></label>
        <label class="f">Statut<select id="mStatus"><option value="own">Je l'ai</option><option value="wish">Je le cherche</option></select></label>
        <label class="f">État (Goldmine)<select id="mGrade">${gradeOpts('')}</select></label>
        <label class="f">Prix (€)<input id="mPrice" inputmode="decimal"></label>
        <label class="f wide">Notes<textarea id="mNote"></textarea></label>
        <div class="actions wide"><button class="primary" type="submit">Ajouter au coffre</button></div>
      </form>
    </div>`, 'vinyl');
  $('mForm').addEventListener('submit', e => {
    e.preventDefault();
    const id = uid();
    data.vinyls[id] = {
      source: 'manuel', sourceId: '', url: '',
      artist: $('mArtist').value.trim(), title: $('mTitle').value.trim(), year: $('mYear').value.trim(),
      label: $('mLabel').value.trim(), catno: $('mCatno').value.trim(), format: $('mFormat').value.trim(), country: $('mCountry').value.trim(),
      genres: [], tracklist: [], status: $('mStatus').value, grade: $('mGrade').value, price: $('mPrice').value.trim(), note: $('mNote').value.trim(),
      added: now(), mt: now()
    };
    scheduleSave(); renderVinyls(); closeModal();
  });
}
$('sheet').addEventListener('click', async e => {
  if (modalKind !== 'manual') return;
  const b = e.target.closest('[data-act]'); if (!b) return;
  if (b.dataset.act === 'close') return closeModal();
});
$('vinManualBtn').addEventListener('click', openManual);

// ============================================================
//  RÉGLAGES
// ============================================================
let updateState = { status: '' };
function updateLabel() {
  const s = updateState;
  switch (s.status) {
    case 'dev': return "Mises à jour désactivées en mode développement.";
    case 'checking': return 'Recherche de mise à jour…';
    case 'none': return "Tu as la dernière version.";
    case 'available': return `Version ${s.version} trouvée, téléchargement…`;
    case 'downloading': return `Téléchargement de la mise à jour : ${s.percent} %`;
    case 'ready': return info.platform === 'mobile' ? `Version ${s.version} disponible : touche « Télécharger », puis ouvre le fichier pour l'installer.` : `Version ${s.version} prête à être installée.`;
    case 'error': return `Impossible de vérifier les mises à jour : ${s.message}`;
    default: return '';
  }
}

function openSettings() {
  modalKind = 'settings';
  openModal(`
    <div class="sheet-head"><h3>Réglages</h3><button class="close" data-act="close">Fermer</button></div>
    <div class="form">
      <label class="f">Discogs — Consumer Key
        <input id="stKey" value="${esc(data.settings.discogsKey || '')}" spellcheck="false" autocomplete="off"></label>
      <label class="f">Discogs — Consumer Secret
        <input id="stSecret" type="password" value="${esc(data.settings.discogsSecret || '')}" spellcheck="false" autocomplete="off"></label>
      <label class="f wide">Ou token personnel Discogs (facultatif)
        <input id="stToken" type="password" value="${esc(data.settings.discogsToken || '')}" placeholder="Seulement si tu en as un" spellcheck="false" autocomplete="off"></label>
    </div>
    <p class="hint">La recherche de vinyles et leurs prix passent par Discogs. Sur Discogs : Paramètres → Développeurs → « Créer une application », puis copie la Consumer Key et le Consumer Secret ici. Ils restent sur cet appareil, jamais dans le code. <a data-act="dgs">Ouvrir la page ↗</a></p>
    <h3>Onglets</h3>
    <div class="tabtoggles">${TABS.map(([k, n]) => `<label class="tgl"><input type="checkbox" data-tabtoggle="${k}" ${tabOn(k) ? 'checked' : ''}> ${n}</label>`).join('')}</div>
    <p class="hint">Un onglet désactivé est seulement caché : tes cartes et vinyles restent enregistrés et continuent de se synchroniser.</p>
    ${phoneSectionHtml()}
    <h3>Sauvegarde</h3>
    <div class="actions" style="justify-content:flex-start">
      <button data-act="export">Exporter une sauvegarde</button>
      <button data-act="import">Importer une sauvegarde</button>
      <button data-act="folder" class="desktop-only">Ouvrir le dossier des données</button>
    </div>
    <p class="hint" id="stMsg">L'export contient tes cartes, tes decks et tes vinyles dans un seul fichier (les pochettes et images restent en ligne).</p>
    <h3>Images</h3>
    <div class="actions" style="justify-content:flex-start"><span id="stImg" class="hint">…</span><button data-act="imgClear">Vider les images des cartes</button><button data-act="dbRefresh" title="Nouvelles cartes et extensions, banlist, prix">Mettre à jour les cartes maintenant</button></div>
    <p class="hint">Les pochettes de vinyles s'affichent depuis Discogs et ne sont pas enregistrées. Les images Yu-Gi-Oh et One Piece sont gardées dans un cache limité (200 Mo sur PC, 50 Mo sur téléphone ; YGOPRODeck interdit de les recharger sans arrêt) : au-delà, les plus anciennes s'effacent toutes seules.</p>
    <h3>Application</h3>
    <div class="actions" style="justify-content:flex-start"><span>Coffre version ${esc(info.version)}</span>
      <button data-act="news">Nouveautés</button>
      <button data-act="check">Chercher une mise à jour</button>
      ${updateState.status === 'ready' ? `<button class="primary" data-act="install">${info.platform === 'mobile' ? 'Télécharger la mise à jour' : 'Redémarrer et mettre à jour'}</button>` : ''}</div>
    <p class="hint" id="stUpd">${esc(updateLabel())}</p>`, 'vinyl');
  loadPhoneSection();
  loadImgInfo();
}
const mo = b => (b / 1048576).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' Mo';
async function loadImgInfo() {
  if (!window.coffre.imgCacheInfo || !$('stImg')) return;
  try { const r = await window.coffre.imgCacheInfo(); if ($('stImg')) $('stImg').textContent = `Images enregistrées : ${mo(r.bytes)} (max ${mo(r.max)})`; } catch (e) { /* rien */ }
}

// ---------- Téléphone (appli Android) ----------
// Sur PC : QR code d'appairage. Sur téléphone : le module mobile fournit sa propre section.
const ext = window.CoffreExt || {};
function phoneSectionHtml() {
  if (ext.settingsHtml) return ext.settingsHtml();
  if (!window.coffre.syncInfo) return '';
  return `<h3>Téléphone</h3><div id="phoneBox" class="phone"><p class="hint">Chargement…</p></div>`;
}
const fmtDate = ms => new Date(ms).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
async function loadPhoneSection() {
  if (ext.settingsHtml || !window.coffre.syncInfo || !$('phoneBox')) return;
  const s = await window.coffre.syncInfo();
  if (!$('phoneBox')) return;
  $('phoneBox').innerHTML = `
    ${s.qr ? `<img class="qr" src="${s.qr}" alt="QR code d'appairage">` : ''}
    <div style="display:flex;flex-direction:column;gap:8px;min-width:0">
      <p>Dans Coffre sur ton téléphone : <b>Réglages → Associer au PC</b>, puis scanne ce code. Le téléphone et le PC doivent être sur le même Wi-Fi.</p>
      <dl class="kv"><dt>Adresse du PC</dt><dd>${s.ips.length ? s.ips.map(ip => esc(ip + ':' + s.port)).join('<br>') : 'aucun réseau détecté'}</dd>
        <dt>Dernière synchro</dt><dd>${s.lastSync ? `${esc(s.lastSync.device)}, le ${fmtDate(s.lastSync.at)}` : 'jamais'}</dd></dl>
      ${s.error ? `<p class="error">${esc(s.error)}</p>` : ''}
      <p class="hint">Si Windows demande l'autorisation réseau pour Coffre, accepte pour les <b>réseaux privés</b>.</p>
      <div><button data-act="phoneReset">Changer le code (déconnecte le téléphone)</button></div>
    </div>`;
}
$('sheet').addEventListener('change', e => {
  if (modalKind !== 'settings') return;
  const tt = e.target.dataset && e.target.dataset.tabtoggle;
  if (tt) {
    const hid = new Set(data.settings.hiddenTabs || []);
    if (e.target.checked) hid.delete(tt); else hid.add(tt);
    if (hid.size >= TABS.length) { e.target.checked = true; return; } // au moins un onglet
    data.settings.hiddenTabs = [...hid];
    applyTabs(); scheduleSave(); return;
  }
  if (e.target.id === 'stToken') data.settings.discogsToken = e.target.value.trim();
  if (e.target.id === 'stKey') data.settings.discogsKey = e.target.value.trim();
  if (e.target.id === 'stSecret') data.settings.discogsSecret = e.target.value.trim();
  scheduleSave();
});
$('sheet').addEventListener('click', async e => {
  if (modalKind !== 'settings') return;
  const b = e.target.closest('[data-act]'); if (!b) return;
  const msg = t => { const m = $('stMsg'); if (m) m.textContent = t; };
  switch (b.dataset.act) {
    case 'close': return closeModal();
    case 'dgs': return window.coffre.openExternal('https://www.discogs.com/settings/developers');
    case 'folder': return window.coffre.openDataDir();
    case 'export': {
      const r = await window.coffre.exportBackup(data);
      if (r.ok) msg('Sauvegarde enregistrée : ' + r.path); return;
    }
    case 'import': {
      try {
        const r = await window.coffre.importBackup();
        if (r.ok) { data = r.data; renderAll(); msg('Sauvegarde importée.'); }
      } catch (err) { msg("Ce fichier n'a pas pu être importé. Choisis un fichier .coffre exporté depuis l'appli."); }
      return;
    }
    case 'check': { const r = await window.coffre.checkUpdate(); updateState = r.status === 'checking' ? { status: 'checking' } : r; $('stUpd').textContent = updateLabel(); return; }
    case 'install': return window.coffre.installUpdate();
    case 'phoneReset': await window.coffre.syncReset(); return loadPhoneSection();
    case 'news': return openNews((window.COFFRE_CHANGELOG || []).slice(0, 15), true);
    case 'dbRefresh':
      b.disabled = true; b.textContent = 'Mise à jour…';
      await Promise.all([window.CoffreYgo && window.CoffreYgo.ready && window.CoffreYgo.refreshDb(), window.CoffreOp && window.CoffreOp.ready && window.CoffreOp.refreshDb()].filter(Boolean));
      b.disabled = false; b.textContent = 'Mettre à jour les cartes maintenant'; return;
    case 'imgClear': if (window.coffre.imgCacheClear) await window.coffre.imgCacheClear(); return loadImgInfo();
    default: if (ext.settingsClick) return ext.settingsClick(b.dataset.act, b);
  }
});
$('settingsBtn').addEventListener('click', openSettings);

// ---------- Nouveautés (changelog) ----------
const cmpVer = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0; };
function openNews(list, fromSettings) {
  if (!list || !list.length) return;
  modalKind = 'news';
  openModal(`
    <div class="sheet-head"><h3>${fromSettings ? 'Nouveautés' : 'Coffre a été mis à jour'}</h3><button class="close" data-act="newsClose">${fromSettings ? '← Réglages' : 'OK'}</button></div>
    <div class="news">${list.map(e => `<section><h4>Version ${esc(e.v)} <span class="hint">${esc(e.date)}</span></h4><ul>${e.items.map(t => `<li>${esc(t)}</li>`).join('')}</ul></section>`).join('')}</div>`, 'vinyl wide');
  $('sheet').dataset.newsBack = fromSettings ? '1' : '';
}
$('sheet').addEventListener('click', e => {
  if (modalKind !== 'news') return;
  const b = e.target.closest('[data-act=newsClose]'); if (!b) return;
  if ($('sheet').dataset.newsBack) openSettings(); else closeModal();
});
// Après une mise à jour : les nouveautés des versions installées depuis la dernière ouverture
function showNewsIfUpdated() {
  const log = window.COFFRE_CHANGELOG || [], cur = info.version, seen = data.settings.seenVersion;
  if (!cur || seen === cur) return;
  data.settings.seenVersion = cur; scheduleSave();
  const used = Object.keys(data.fm || {}).length || Object.keys(data.vinyls || {}).length || Object.keys(data.ygo || {}).length || Object.keys(data.op || {}).length;
  let list = [];
  if (seen) list = log.filter(e => cmpVer(e.v, seen) > 0 && cmpVer(e.v, cur) <= 0);
  else if (used) list = log.filter(e => e.v === cur);   // première fois avec le changelog : juste cette version
  if (list.length) setTimeout(() => { if (!$('modal') || $('modal').hidden) openNews(list.slice(0, 6)); }, 900);
}

// Bandeau de mise à jour
window.coffre.onUpdate(s => {
  updateState = s;
  const bar = $('updateBar');
  if (s.status === 'ready') {
    bar.innerHTML = `<span>Version ${esc(s.version)} prête</span><button class="primary" id="updNow">${info.platform === 'mobile' ? 'Télécharger' : 'Redémarrer'}</button>`;
    bar.hidden = false;
    $('updNow').addEventListener('click', () => window.coffre.installUpdate());
  } else if (s.status === 'available' || s.status === 'downloading') {
    bar.innerHTML = `<span>${esc(updateLabel())}</span>`; bar.hidden = false;
  } else {
    bar.hidden = true;
  }
  const upd = $('stUpd'); if (upd) upd.textContent = updateLabel();
});

// ============================================================
//  DÉMARRAGE
// ============================================================
function renderAll() { renderFm(); renderVinyls(); if (window.CoffreYgo) window.CoffreYgo.render(); if (window.CoffreOp) window.CoffreOp.render(); }

// Onglets Cartes FM / Vinyles (Ctrl+1 et Ctrl+2 au clavier)
const TABS = [['fm', 'Cartes FM'], ['ygo', 'Yu-Gi-Oh'], ['op', 'One Piece'], ['vin', 'Vinyles']];
const tabOn = k => !(data.settings.hiddenTabs || []).includes(k);
// Cache les onglets désactivés dans les réglages (les données ne sont pas touchées)
function applyTabs() {
  const on = TABS.map(t => t[0]).filter(tabOn);
  $('tabs').querySelectorAll('[data-tab]').forEach(b => { b.hidden = !tabOn(b.dataset.tab); });
  $('tabs').hidden = on.length < 2;
  if (!on.includes($('shelves').dataset.tab)) showTab(on[0]);
}
function showTab(tab) {
  if (!tabOn(tab)) return;
  $('shelves').dataset.tab = tab;
  $('tabs').querySelectorAll('button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  if (data.settings.tab !== tab) { data.settings.tab = tab; scheduleSave(); }
}
$('tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) showTab(b.dataset.tab); });
document.addEventListener('keydown', e => {
  if (!e.ctrlKey || !$('modal').hidden) return;
  if (e.key === '1') showTab('fm');
  if (e.key === '2') showTab('ygo');
  if (e.key === '3') showTab('op');
  if (e.key === '4') showTab('vin');
});

// Changements arrivés d'un autre appareil (synchro)
function applyRemote(c) {
  data.fm = c.fm || data.fm; data.vinyls = c.vinyls || data.vinyls; data.ygo = c.ygo || data.ygo || {}; data.decks = c.decks || data.decks || {}; data.op = c.op || data.op || {}; data.opdecks = c.opdecks || data.opdecks || {};
  renderAll();
  if (modalKind === 'vinyl') {
    const id = $('sheet').querySelector('[data-id]')?.dataset.id;
    if (id && (!data.vinyls[id] || data.vinyls[id].deleted)) closeModal();
  }
}
if (window.coffre.onDataChanged) window.coffre.onDataChanged(applyRemote);
if (window.coffre.onSyncStatus) window.coffre.onSyncStatus(() => { if (modalKind === 'settings') loadPhoneSection(); });

// Petit message temporaire en bas de l'écran
function toast(text) {
  let el = $('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = text; el.hidden = false;
  clearTimeout(el._t); el._t = setTimeout(() => { el.hidden = true; }, 2200);
}

// Accès pour le module de scan (appli Android)
window.CoffreApp = {
  get data() { return data; }, CARDS, HAS_IMG, cardImg, esc, qtyHtml,
  get modalKind() { return modalKind; },
  openModal(html, cls, kind) { modalKind = kind; openModal(html, cls); },
  get info() { return info; },
  changeQty, renderFm, renderVinyls, renderAll, scheduleSave, toast, applyRemote, showTab,
  openCard, openRelease, closeModal, coverUrl,
  // opts (appli Android) : rerank(résultats) → résultats triés ; hint : HTML affiché sous la barre de recherche
  searchFor(q, opts = {}) {
    search.q = q; search.rerank = opts.rerank || null; search.hint = opts.hint || '';
    openSearch();
    if (q) runSearch(1); else { const i = $('sQ'); if (i) i.focus(); }
  },
  setSearchHint(h) { search.hint = h; },
  // Recherche faite par le module de scan (plusieurs requêtes fusionnées)
  presetSearch({ q = '', hint = '', rerank = null } = {}) {
    search.q = q; search.hint = hint; search.rerank = rerank;
    search.results = []; search.hasMore = false; search.error = ''; search.page = 1; search.loading = true;
    search.token = {}; search.reranking = false;
    openSearch();
  },
  setResults(list, { loading = false, done = false, error = '' } = {}) {
    search.results = list; search.loading = loading; search.error = error;
    if (done) startRerank();
    if (modalKind === 'search') renderResults();
  },
  searchRaw(q) { return window.coffre.search({ q, source: 'discogs', page: 1, auth: discogsAuth() }); },
  get searchSource() { return 'discogs'; },
  rerunSearch(q) { search.q = q; const i = $('sQ'); if (i) i.value = q; if (q) runSearch(1); }
};

(async () => {
  info = await window.coffre.info();
  if (info.platform) document.body.classList.add(info.platform);
  data = await window.coffre.load();
  seg('fmLayout', data.settings.layout || 'gal', v => { data.settings.layout = v; scheduleSave(); renderFm(); });
  seg('fmView', 'all', v => { fmF.v = v; renderFm(); });
  seg('vinView', 'all', v => { vinF.v = v; renderVinyls(); });
  data.ygo = data.ygo || {}; data.decks = data.decks || {}; data.op = data.op || {}; data.opdecks = data.opdecks || {};
  const want = ['vin', 'ygo', 'op'].includes(data.settings.tab) ? data.settings.tab : 'fm';
  $('shelves').dataset.tab = want; applyTabs(); showTab($('shelves').dataset.tab);
  renderAll();
  if (ext.ready) ext.ready();
  // Prix Discogs manquants ou vieux de plus d'une semaine, en arrière-plan
  setTimeout(() => migrateCovers().then(() => refreshPrices(true)), 6000);
  showNewsIfUpdated();
  window.coffreReady = true;
  document.dispatchEvent(new Event('coffre:ready'));
})();
