// Coffre — code partagé entre l'appli PC (Node/Electron) et l'appli Android (navigateur).
// Contient la recherche de vinyles (Discogs, par texte ou code-barres, avec le prix du marché)
// et la fusion des collections pour la synchronisation PC <-> téléphone.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CoffreCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- Synchronisation ----------
  // Chaque carte et chaque vinyle porte « mt » (date de dernière modification, en ms).
  // Quand deux appareils ont la même entrée, la plus récente gagne.
  // Un vinyle retiré devient { deleted: true, mt } pour que la suppression se propage.
  function mergeMaps(a, b) {
    const out = { ...(a || {}) };
    for (const [k, v] of Object.entries(b || {})) {
      const cur = out[k];
      if (!cur || (v && (v.mt || 0) > (cur.mt || 0))) out[k] = v;
    }
    return out;
  }

  // Ce qui se synchronise : cartes FM, vinyles, collections Yu-Gi-Oh et One Piece, et leurs decks (chaque entrée porte « mt »)
  const PARTS = ['fm', 'vinyls', 'ygo', 'decks', 'op', 'opdecks'];
  function pickCollections(d) {
    const o = {}; for (const k of PARTS) o[k] = (d && d[k]) || {}; return o;
  }
  function mergeCollections(base, inc) {
    const o = {}; for (const k of PARTS) o[k] = mergeMaps(base && base[k], inc && inc[k]); return o;
  }
  function sameCollections(a, b) {
    return PARTS.every(k => JSON.stringify((a && a[k]) || {}) === JSON.stringify((b && b[k]) || {}));
  }

  // ---------- Recherche de vinyles ----------
  // getJson(url, headers) doit renvoyer le JSON décodé ou lever une erreur lisible.
  function createVinylApi(getJson) {
    const isBarcode = q => /^\d{8,14}$/.test(String(q).replace(/\s/g, ''));

    function discogsAuth(auth) {
      auth = auth || {};
      if (auth.token) return { Authorization: `Discogs token=${auth.token}` };
      if (auth.key && auth.secret) return { Authorization: `Discogs key=${auth.key}, secret=${auth.secret}` };
      return null;
    }

    async function searchDiscogs(q, page, auth) {
      const headers = discogsAuth(auth);
      if (!headers) throw new Error('Ajoute ta Consumer Key et ton Consumer Secret Discogs dans les réglages pour chercher sur Discogs.');
      const param = isBarcode(q) ? `barcode=${encodeURIComponent(String(q).replace(/\s/g, ''))}` : `q=${encodeURIComponent(q)}&format=Vinyl`;
      const d = await getJson(`https://api.discogs.com/database/search?${param}&type=release&per_page=30&page=${page}`, headers);
      const results = (d.results || []).map(r => {
        const parts = (r.title || '').split(' - ');
        return {
          source: 'discogs', id: String(r.id),
          artist: parts.length > 1 ? parts[0] : '', title: parts.length > 1 ? parts.slice(1).join(' - ') : r.title,
          year: r.year ? String(r.year) : '', country: r.country || '',
          label: (r.label || [])[0] || '', catno: r.catno || '',
          format: (r.format || []).slice(0, 3).join(', '),
          thumb: r.thumb || r.cover_image || '', cover: r.cover_image || r.thumb || ''
        };
      });
      return { results, hasMore: ((d.pagination && d.pagination.pages) || 1) > page };
    }

    async function detailsDiscogs(id, auth) {
      const d = await getJson(`https://api.discogs.com/releases/${id}?curr_abbr=EUR`, discogsAuth(auth) || {});
      const imgs = d.images || [];
      const primary = imgs.find(i => i.type === 'primary') || imgs[0];
      const fmt = (d.formats || [])[0];
      return {
        tracklist: (d.tracklist || []).filter(t => t.type_ !== 'heading').map(t => ({ pos: t.position, title: t.title, duration: t.duration })),
        genres: [...(d.genres || []), ...(d.styles || [])],
        label: (d.labels && d.labels[0] && d.labels[0].name) || '', catno: (d.labels && d.labels[0] && d.labels[0].catno) || '',
        country: d.country || '', year: d.year ? String(d.year) : '',
        format: fmt ? [fmt.qty && fmt.qty !== '1' ? `${fmt.qty}×` : '', fmt.name, ...(fmt.descriptions || [])].filter(Boolean).join(' ') : '',
        cover: (primary && primary.uri) || '',
        url: d.uri || `https://www.discogs.com/release/${id}`,
        // Marché Discogs : prix le plus bas actuellement en vente (en €) et nombre d'exemplaires en vente
        dp: typeof d.lowest_price === 'number' ? d.lowest_price : null,
        dpN: d.num_for_sale || 0,
        dpAt: Date.now()
      };
    }

    return {
      isBarcode,
      hasDiscogs: auth => !!discogsAuth(auth),
      search: ({ q, page = 1, auth }) => searchDiscogs(q, page, auth),
      details: ({ id, auth }) => detailsDiscogs(id, auth)
    };
  }

  // ---------- Base de cartes Yu-Gi-Oh (YGOPRODeck) ----------
  const YGO_API = 'https://db.ygoprodeck.com/api/v7/';
  const YGO_URLS = {
    en: YGO_API + 'cardinfo.php',
    fr: YGO_API + 'cardinfo.php?language=fr',
    sets: YGO_API + 'cardsets.php'
  };
  const ygoImgUrl = (id, big) => `https://images.ygoprodeck.com/images/${big ? 'cards' : 'cards_small'}/${id}.jpg`;

  // Garde seulement ce dont l'appli a besoin (quelques Mo au lieu de plusieurs dizaines).
  // Carte : { i: id, n: nom anglais, f: nom français, t: cadre, ty: type, r: race, a: attribut,
  //           l: niveau/lien, k: ATK, d: DEF, im: [ids d'images], p: [[n° extension, code, rareté courte, rareté]] }
  const BAN = { Banned: 0, Forbidden: 0, Limited: 1, 'Semi-Limited': 2 };
  function ygoCompact(en, fr, sets) {
    const frName = new Map(((fr && fr.data) || []).map(c => [c.id, c.name]));
    const frDesc = new Map(((fr && fr.data) || []).map(c => [c.id, c.desc]));
    const info = new Map((Array.isArray(sets) ? sets : []).map(x => [x.set_name, x]));
    const setIdx = new Map(); const setList = [];
    const cards = [];
    for (const c of (en && en.data) || []) {
      const p = [];
      for (const x of c.card_sets || []) {
        let i = setIdx.get(x.set_name);
        if (i === undefined) {
          i = setList.length; setIdx.set(x.set_name, i);
          const inf = info.get(x.set_name) || {};
          setList.push([x.set_name, inf.set_code || String(x.set_code || '').split('-')[0], inf.tcg_date || '']);
        }
        const short = String(x.set_rarity_code || '').replace(/[()]/g, '') || String(x.set_rarity || '?').replace(/[^A-Z]/g, '') || '?';
        p.push([i, String(x.set_code || ''), short, String(x.set_rarity || '')]);
      }
      const frn = frName.get(c.id);
      cards.push({
        i: c.id, n: c.name, f: frn && frn !== c.name ? frn : '', t: c.frameType || '', ty: c.humanReadableCardType || c.type || '',
        r: c.race || '', a: c.attribute || '', l: c.level != null ? c.level : (c.linkval != null ? c.linkval : ''),
        k: c.atk != null ? c.atk : '', d: c.def != null ? c.def : '',
        im: (c.card_images || []).map(x => x.id), p,
        // Prix de référence Cardmarket de la carte (en €), toutes éditions confondues
        cm: parseFloat(((c.card_prices || [])[0] || {}).cardmarket_price) || 0,
        // Texte de la carte : en français si YGOPRODeck l'a, sinon en anglais
        x: String(frDesc.get(c.id) || c.desc || '').trim(),
        // Banlist TCG (Europe) : 0 interdite, 1 limitée, 2 semi-limitée ; absente = 3 exemplaires autorisés
        ...(BAN[(c.banlist_info || {}).ban_tcg] != null ? { b: BAN[c.banlist_info.ban_tcg] } : {})
      });
    }
    return { v: 4, at: Date.now(), cards, sets: setList };
  }

  // Clé d'une impression dans la collection : « SGX1-ENA18|C »
  const ygoKey = (code, rarity) => `${code}|${rarity}`;

  // Code sans la langue : SGX1-ENA18 et SGX1-FRA18 → SGX1-A18 (même carte, même extension)
  function ygoNormCode(code) {
    const c = String(code || '').toUpperCase().replace(/\s+/g, '');
    const m = c.match(/^([A-Z0-9]{2,5})-([A-Z0-9]+)$/);
    if (!m) return c;
    const rest = m[2].replace(/^(EN|FR|DE|IT|SP|ES|PT|JP|JA|KR|AE|SC|TC|E|F|G|I|S|P|K|J)(?=[A-Z]?\d)/, '');
    return m[1] + '-' + rest;
  }

  // Codes de carte trouvés dans un texte lu par l'appareil photo, avec variantes pour les erreurs de lecture
  function ygoCodesInText(text) {
    const t = String(text || '').toUpperCase().replace(/[‐-―−]/g, '-');
    const out = [];
    const re = /\b([A-Z0-9]{2,5})\s?-\s?([A-Z]{0,3}[0-9OILSZBG]{2,3})\b/g;
    let m;
    while ((m = re.exec(t))) {
      out.push(m[1] + '-' + m[2]);
      // Dans la partie numérique, la lecture confond parfois O/0, I/1, S/5…
      const tail = m[2].match(/^([A-Z]{0,3}?)([0-9OILSZBG]{2,3})$/);
      if (tail) {
        const fixed = tail[2].replace(/O/g, '0').replace(/[IL]/g, '1').replace(/S/g, '5').replace(/Z/g, '2').replace(/B/g, '8').replace(/G/g, '6');
        if (fixed !== tail[2]) out.push(m[1] + '-' + tail[1] + fixed);
      }
    }
    return [...new Set(out)];
  }

  // Index utiles à l'interface (calculés une fois)
  function ygoIndex(db) {
    const byId = new Map(); const byNorm = new Map(); const bySet = new Map();
    db.cards.forEach((c, ci) => {
      byId.set(c.i, ci);
      c.s = (c.n + ' ' + c.f + ' ' + c.p.map(x => x[1]).join(' ')).toLowerCase();
      c.p.forEach((x, pi) => {
        const nk = ygoNormCode(x[1]);
        if (!byNorm.has(nk)) byNorm.set(nk, []);
        byNorm.get(nk).push([ci, pi]);
        if (!bySet.has(x[0])) bySet.set(x[0], []);
        bySet.get(x[0]).push([ci, pi]);
      });
    });
    return { byId, byNorm, bySet };
  }


  // ---------- Base de cartes One Piece (optcgapi.com, gratuite, sans clé) ----------
  const OP_API = 'https://optcgapi.com/api/';
  const OP_URLS = {
    sets: OP_API + 'allSets/', decks: OP_API + 'allDecks/',
    setCards: OP_API + 'allSetCards/', stCards: OP_API + 'allSTCards/', promoCards: OP_API + 'allPromoCards/'
  };
  const opImgUrl = id => `https://optcgapi.com/media/static/Card_Images/${encodeURIComponent(id)}.jpg`;
  const OP_VARIANTS = { 'parallel': 'Parallèle', 'alternate art': 'Parallèle', 'alt art': 'Parallèle' };
  // « Roronoa Zoro (001) (Parallel) » → { name: 'Roronoa Zoro', variant: 'Parallèle' }
  function opSplitName(raw, code) {
    let t = String(raw || '').trim();
    const num = String(code || '').split('-').pop();
    t = t.replace(new RegExp('\\s*\\((' + num.replace(/[^A-Z0-9]/gi, '') + '|' + String(code || '').replace(/[^A-Z0-9-]/gi, '') + ')\\)', 'i'), '');
    const vars = [];
    let m;
    while ((m = t.match(/\s*\(([^()]*)\)\s*$/))) { vars.unshift(m[1].trim()); t = t.slice(0, m.index); }
    const variant = vars.map(v => OP_VARIANTS[v.toLowerCase()] || v).join(' · ');
    return { name: t.trim(), variant };
  }
  // Carte : { i: code (OP01-001), n: nom, t: catégorie (Leader, Character, Event, Stage), co: couleur, c: coût,
  //           pw: puissance, l: vie, ct: counter, at: attribut, ty: types,
  //           p: [[n° extension, clé de l'impression, rareté, version (Parallèle…), prix $ TCGplayer, image]] }
  function opCompact(sets, decks, ...lists) {
    const setList = [], setIdx = new Map();
    const addSet = (id, name, kind) => {
      id = String(id || '').trim(); if (!id && !name) return -1;
      const k = id || name;
      if (setIdx.has(k)) return setIdx.get(k);
      const i = setList.length; setIdx.set(k, i); setList.push([String(name || id), id, kind || '', i]);
      return i;
    };
    for (const x of Array.isArray(sets) ? sets : []) addSet(x.set_id, x.set_name, 'booster');
    for (const x of Array.isArray(decks) ? decks : []) addSet(x.structure_deck_id, x.structure_deck_name, 'deck');
    const byCode = new Map(), cards = [], seen = new Set();
    for (const list of lists) for (const r of Array.isArray(list) ? list : []) {
      const code = String(r.card_set_id || '').trim().toUpperCase(); if (!code) continue;
      if (/^don/i.test(r.card_type || '')) continue;
      const { name, variant } = opSplitName(r.card_name, code);
      const img = String(r.card_image_id || '').trim();
      const key = img || `${code}#${opSplitName(r.card_name, code).variant || r.set_name || ''}`;
      const si = addSet(r.set_id || '', r.set_name || r.set_id || '', /^P-/.test(code) ? 'promo' : '');
      if (seen.has(key + '|' + si)) continue; seen.add(key + '|' + si);
      let c = byCode.get(code);
      if (!c) {
        const num = v => v === null || v === undefined || v === '' ? '' : (isNaN(Number(v)) ? String(v) : Number(v));
        c = { i: code, n: name, t: String(r.card_type || ''), co: String(r.card_color || ''), c: num(r.card_cost), pw: num(r.card_power),
          l: num(r.life), ct: num(r.counter_amount), at: String(r.attribute || ''), ty: String(r.sub_types || ''),
          x: [r.card_text, r.trigger_text || r.card_trigger].filter(Boolean).map(t => String(t).trim()).join('\n'), p: [] };
        byCode.set(code, c); cards.push(c);
      }
      if (!variant && c.n.length > name.length) c.n = name;
      const price = parseFloat(r.market_price) || parseFloat(r.inventory_price) || 0;
      c.p.push([si, key, String(r.rarity || ''), variant, Math.round(price * 100) / 100, img && r.card_image ? img : '']);
    }
    for (const c of cards) c.p.sort((a, b) => (a[3] ? 1 : 0) - (b[3] ? 1 : 0) || a[0] - b[0]);
    cards.sort((a, b) => a.i.localeCompare(b.i, 'en', { numeric: true }));
    return { v: 2, at: Date.now(), cur: 'USD', cards, sets: setList };
  }
  // Codes One Piece lus par l'appareil photo : OP01-001, ST10-005, EB01-012, PRB01-001, P-034
  function opCodesInText(text) {
    const t = String(text || '').toUpperCase().replace(/[‐-―−]/g, '-');
    const fix = d => d.replace(/O/g, '0').replace(/[IL]/g, '1').replace(/S/g, '5').replace(/Z/g, '2').replace(/B/g, '8').replace(/G/g, '6');
    const out = [];
    let m;
    const re = /\b(OP|ST|EB|PRB|0P)\s?([0-9OILSZBG]{2})\s?-\s?([0-9OILSZBG]{3})\b/g;
    while ((m = re.exec(t))) out.push(`${m[1] === '0P' ? 'OP' : m[1]}${fix(m[2])}-${fix(m[3])}`);
    const rp = /\bP\s?-\s?([0-9OILSZBG]{3})\b/g;
    while ((m = rp.exec(t))) out.push(`P-${fix(m[1])}`);
    return [...new Set(out)];
  }
  function opIndex(db) {
    const byId = new Map(), bySet = new Map(), byKey = new Map();
    db.cards.forEach((c, ci) => {
      byId.set(c.i, ci);
      c.s = (c.n + ' ' + c.i + ' ' + c.ty).toLowerCase();
      c.p.forEach((x, pi) => {
        byKey.set(x[1], [ci, pi]);
        if (!bySet.has(x[0])) bySet.set(x[0], []);
        bySet.get(x[0]).push([ci, pi]);
      });
      // Prix de référence : la version normale la moins chère (sinon la moins chère tout court)
      const pr = a => a.map(x => x[4]).filter(v => v > 0);
      const base = pr(c.p.filter(x => !x[3]));
      c.cm = base.length ? Math.min(...base) : (pr(c.p).length ? Math.min(...pr(c.p)) : 0);
      const im = c.p.find(x => x[5] && !x[3]) || c.p.find(x => x[5]);
      c.im = im ? im[5] : '';
    });
    return { byId, bySet, byKey };
  }

  // Ligne pour la wishlist Cardmarket : « 2 Dark Magician »
  const cmLine = (qty, name) => `${qty} ${name}`;

  return { PARTS, pickCollections, mergeMaps, mergeCollections, sameCollections, createVinylApi,
    YGO_URLS, ygoImgUrl, ygoCompact, ygoKey, ygoNormCode, ygoCodesInText, ygoIndex, cmLine,
    OP_URLS, opImgUrl, opCompact, opSplitName, opCodesInText, opIndex };
});
