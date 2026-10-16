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
const search = { q: '', source: 'musicbrainz', page: 1, results: [], hasMore: false, loading: false, error: '' };
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
$('modal').addEventListener('mousedown', e => { if (e.target.id === 'modal' && ['card', 'vinyl', 'settings'].includes(modalKind)) closeModal(); });
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
$('fmType').addEventListener('change', e => { fmF.t = e.target.value; renderFm(); });

// ============================================================
//  VINYLES — collection
// ============================================================
function coverHtml(v, cls = 'cover') {
  const src = v.cover ? coverUrl(v.cover) : '';
  return src ? `<img class="${cls}" src="${src}" alt="" loading="lazy">` : `<div class="${cls} ph"></div>`;
}

function renderVinyls() {
  const all = liveVinyls();
  $('vinOwned').textContent = all.filter(([, v]) => v.status !== 'wish').length;
  $('vinWish').textContent = all.filter(([, v]) => v.status === 'wish').length;
  $('tabVinCount').textContent = all.filter(([, v]) => v.status !== 'wish').length;
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
      <span>${v.status === 'wish' ? '<span class="pill wish">Recherché</span>' : v.grade ? `<span class="pill">${esc(v.grade)}</span>` : ''}</span>
    </button>`).join('')}</div>` : `<div class="empty">Aucun disque ne correspond.</div>`;
}

$('vinList').addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (b) openVinyl(b.dataset.id); });
$('vinFilter').addEventListener('input', e => { vinF.q = e.target.value; renderVinyls(); });
$('vinSort').addEventListener('change', e => { vinF.sort = e.target.value; renderVinyls(); });

const GRADES = ['', 'M', 'NM', 'VG+', 'VG', 'G+', 'G', 'P'];
const gradeOpts = cur => GRADES.map(g => `<option value="${g}" ${cur === g ? 'selected' : ''}>${g || '—'}</option>`).join('');
const sourceName = s => s === 'discogs' ? 'Discogs' : s === 'musicbrainz' ? 'MusicBrainz' : 'ajout manuel';

function tracksHtml(list) {
  if (!list || !list.length) return '';
  return `<div class="tracks">${list.map(t => `<div><span class="p">${esc(t.pos)}</span><span>${esc(t.title)}</span><span class="d">${esc(t.duration)}</span></div>`).join('')}</div>`;
}

function vinylInfoHtml(v) {
  const rows = [['Label', v.label], ['Référence', v.catno], ['Format', v.format], ['Pays', v.country], ['Année', v.year], ['Genres', (v.genres || []).join(', ')]].filter(([, x]) => x);
  return `<dl class="kv">${rows.map(([k, x]) => `<dt>${k}</dt><dd>${esc(x)}</dd>`).join('')}</dl>`;
}

// Fiche d'un vinyle de la collection
function openVinyl(id) {
  modalKind = 'vinyl';
  const v = data.vinyls[id]; if (!v) return;
  openModal(`
    <div class="sheet-head"><div><h3>${esc(v.title)}</h3><div class="meta">${esc(v.artist)}</div></div>
      <button class="close" data-act="close">Fermer</button></div>
    <div class="split" data-id="${esc(id)}">
      <div style="display:flex;flex-direction:column;gap:8px">${coverHtml(v)}<button data-act="cover">Changer la pochette</button></div>
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
    case 'cover': {
      const name = await window.coffre.pickCover();
      if (!name) return;
      if (v.cover) window.coffre.deleteCover(v.cover);
      v.cover = name; v.mt = now(); scheduleSave(); renderVinyls(); openVinyl(id); return;
    }
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
  search.source = data.settings.source || 'musicbrainz';
  const noToken = !hasDiscogs();
  openModal(`
    <div class="sheet-head"><h3>Rechercher un vinyle</h3><button class="close" data-act="close">Fermer</button></div>
    <form class="searchbar" id="sForm">
      <input id="sQ" type="search" placeholder="Artiste, album, label, référence ou code-barres…" value="${esc(search.q)}" autofocus>
      <div class="seg" id="sSrc">
        <button type="button" data-v="musicbrainz">MusicBrainz</button>
        <button type="button" data-v="discogs" ${noToken ? 'title="Ajoute ta clé Discogs dans les réglages"' : ''}>Discogs</button>
      </div>
      <button class="primary" type="submit">Chercher</button>
    </form>
    ${search.hint ? `<div class="shint" id="sHint">${search.hint}</div>` : ''}
    <div class="results" id="sRes"></div>`, 'vinyl wide');
  const mark = () => $('sSrc').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === search.source)));
  mark();
  $('sSrc').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    search.source = b.dataset.v; data.settings.source = search.source; scheduleSave(); mark();
    if (search.q) runSearch(1);
  });
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
      : `<div class="spinner">${search.q ? 'Aucun vinyle trouvé. Essaie avec moins de mots, ou change de source.' : 'Tape un nom et appuie sur Entrée. Les résultats viennent directement de ' + (search.source === 'discogs' ? 'Discogs' : 'MusicBrainz') + ', les nouveautés comprises.'}</div>`;
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
  btn.disabled = true; $('aMsg').textContent = 'Téléchargement de la pochette…';
  let cover = await window.coffre.downloadCover(r.cover || r.thumb);
  if (!cover && r.thumb && r.thumb !== r.cover) cover = await window.coffre.downloadCover(r.thumb);
  const id = uid();
  data.vinyls[id] = {
    source: r.source, sourceId: r.id, url: r.url || '',
    artist: r.artist || '', title: r.title || '', year: r.year || '', country: r.country || '',
    label: r.label || '', catno: r.catno || '', format: r.format || '',
    genres: r.genres || [], tracklist: r.tracklist || [],
    status: $('aStatus').value, grade: $('aGrade').value, price: $('aPrice').value.trim(), note: $('aNote').value.trim(),
    cover, added: now(), mt: now()
  };
  scheduleSave(); renderVinyls();
  $('aMsg').textContent = cover ? 'Ajouté au coffre.' : 'Ajouté au coffre (sans pochette, tu peux en choisir une dans sa fiche).';
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
let manualCover = '';
function openManual() {
  modalKind = 'manual'; manualCover = '';
  openModal(`
    <div class="sheet-head"><h3>Ajouter un vinyle à la main</h3><button class="close" data-act="close">Fermer</button></div>
    <p class="hint">Pour un pressage introuvable en ligne. Tu peux mettre une photo de ta pochette.</p>
    <div class="split">
      <div style="display:flex;flex-direction:column;gap:8px"><div id="mCover"><div class="cover ph"></div></div><button data-act="pick">Choisir une pochette</button></div>
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
      cover: manualCover, added: now(), mt: now()
    };
    manualCover = '';
    scheduleSave(); renderVinyls(); closeModal();
  });
}
$('sheet').addEventListener('click', async e => {
  if (modalKind !== 'manual') return;
  const b = e.target.closest('[data-act]'); if (!b) return;
  if (b.dataset.act === 'close') { if (manualCover) window.coffre.deleteCover(manualCover); manualCover = ''; return closeModal(); }
  if (b.dataset.act === 'pick') {
    const name = await window.coffre.pickCover(); if (!name) return;
    if (manualCover) window.coffre.deleteCover(manualCover);
    manualCover = name; $('mCover').innerHTML = `<img class="cover" src="${coverUrl(name)}" alt="">`;
  }
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
      <label class="f">Source de recherche par défaut
        <select id="stSource"><option value="musicbrainz">MusicBrainz (sans clé)</option><option value="discogs">Discogs (clé requise)</option></select></label>
      <label class="f">Discogs — Consumer Key
        <input id="stKey" value="${esc(data.settings.discogsKey || '')}" spellcheck="false" autocomplete="off"></label>
      <label class="f">Discogs — Consumer Secret
        <input id="stSecret" type="password" value="${esc(data.settings.discogsSecret || '')}" spellcheck="false" autocomplete="off"></label>
      <label class="f wide">Ou token personnel Discogs (facultatif)
        <input id="stToken" type="password" value="${esc(data.settings.discogsToken || '')}" placeholder="Seulement si tu en as un" spellcheck="false" autocomplete="off"></label>
    </div>
    <p class="hint">Discogs référence plus de pressages vinyles. Sur Discogs : Paramètres → Développeurs → « Créer une application », puis copie la Consumer Key et le Consumer Secret ici. Ils restent sur cet appareil, jamais dans le code. <a data-act="dgs">Ouvrir la page ↗</a></p>
    ${phoneSectionHtml()}
    <h3>Sauvegarde</h3>
    <div class="actions" style="justify-content:flex-start">
      <button data-act="export">Exporter une sauvegarde</button>
      <button data-act="import">Importer une sauvegarde</button>
      <button data-act="folder" class="desktop-only">Ouvrir le dossier des données</button>
    </div>
    <p class="hint" id="stMsg">L'export contient tes cartes, tes vinyles et toutes les pochettes dans un seul fichier.</p>
    <h3>Application</h3>
    <div class="actions" style="justify-content:flex-start"><span>Coffre version ${esc(info.version)}</span>
      <button data-act="check">Chercher une mise à jour</button>
      ${updateState.status === 'ready' ? `<button class="primary" data-act="install">${info.platform === 'mobile' ? 'Télécharger la mise à jour' : 'Redémarrer et mettre à jour'}</button>` : ''}</div>
    <p class="hint" id="stUpd">${esc(updateLabel())}</p>`, 'vinyl');
  $('stSource').value = data.settings.source || 'musicbrainz';
  loadPhoneSection();
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
  if (e.target.id === 'stSource') data.settings.source = e.target.value;
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
    default: if (ext.settingsClick) return ext.settingsClick(b.dataset.act, b);
  }
});
$('settingsBtn').addEventListener('click', openSettings);

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
function renderAll() { renderFm(); renderVinyls(); }

// Onglets Cartes FM / Vinyles (Ctrl+1 et Ctrl+2 au clavier)
function showTab(tab) {
  $('shelves').dataset.tab = tab;
  $('tabs').querySelectorAll('button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  if (data.settings.tab !== tab) { data.settings.tab = tab; scheduleSave(); }
}
$('tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) showTab(b.dataset.tab); });
document.addEventListener('keydown', e => {
  if (!e.ctrlKey || !$('modal').hidden) return;
  if (e.key === '1') showTab('fm');
  if (e.key === '2') showTab('vin');
});

// Changements arrivés d'un autre appareil (synchro)
function applyRemote(c) {
  data.fm = c.fm || data.fm; data.vinyls = c.vinyls || data.vinyls;
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
  get data() { return data; }, CARDS, HAS_IMG, cardImg, esc,
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
  searchRaw(q) { return window.coffre.search({ q, source: search.source || data.settings.source || 'musicbrainz', page: 1, auth: discogsAuth() }); },
  get searchSource() { return search.source || data.settings.source || 'musicbrainz'; },
  rerunSearch(q) { search.q = q; const i = $('sQ'); if (i) i.value = q; if (q) runSearch(1); }
};

(async () => {
  info = await window.coffre.info();
  if (info.platform) document.body.classList.add(info.platform);
  data = await window.coffre.load();
  seg('fmLayout', data.settings.layout || 'gal', v => { data.settings.layout = v; scheduleSave(); renderFm(); });
  seg('fmView', 'all', v => { fmF.v = v; renderFm(); });
  seg('vinView', 'all', v => { vinF.v = v; renderVinyls(); });
  showTab(data.settings.tab === 'vin' ? 'vin' : 'fm');
  renderAll();
  if (ext.ready) ext.ready();
})();
