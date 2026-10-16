// Coffre — code partagé entre l'appli PC (Node/Electron) et l'appli Android (navigateur).
// Contient la recherche de vinyles (MusicBrainz / Discogs, par texte ou code-barres)
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

  // Ce qui se synchronise : cartes FM, vinyles, collection Yu-Gi-Oh et decks (chaque entrée porte « mt »)
  const PARTS = ['fm', 'vinyls', 'ygo', 'decks'];
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
    const mbArtist = credit => (credit || []).map(c => (c.name || (c.artist && c.artist.name) || '') + (c.joinphrase || '')).join('').trim();
    const msToTime = ms => { if (!ms) return ''; const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
    const isBarcode = q => /^\d{8,14}$/.test(String(q).replace(/\s/g, ''));

    function discogsAuth(auth) {
      auth = auth || {};
      if (auth.token) return { Authorization: `Discogs token=${auth.token}` };
      if (auth.key && auth.secret) return { Authorization: `Discogs key=${auth.key}, secret=${auth.secret}` };
      return null;
    }

    function mbRelease(r) {
      const li = (r['label-info'] || [])[0] || {};
      const formats = (r.media || []).map(m => m.format).filter(Boolean);
      const discs = (r.media || []).length;
      return {
        source: 'musicbrainz', id: r.id,
        artist: mbArtist(r['artist-credit']), title: r.title,
        year: (r.date || '').slice(0, 4), country: r.country || '',
        label: (li.label && li.label.name) || '', catno: li['catalog-number'] || '',
        format: discs > 1 ? `${discs}× ${formats[0] || 'Vinyl'}` : (formats[0] || 'Vinyl'),
        barcode: r.barcode || '',
        thumb: `https://coverartarchive.org/release/${r.id}/front-250`,
        cover: `https://coverartarchive.org/release/${r.id}/front-500`
      };
    }

    async function searchMusicBrainz(q, page) {
      const limit = 30;
      let query;
      if (isBarcode(q)) {
        // Un même disque peut être enregistré en UPC (12 chiffres) ou en EAN (13 chiffres, avec un 0 devant)
        const b = String(q).replace(/\s/g, '');
        const alt = b.length === 12 ? '0' + b : (b.length === 13 && b[0] === '0' ? b.slice(1) : '');
        query = alt ? `barcode:(${b} OR ${alt})` : `barcode:${b}`;
      } else {
        const t = String(q).replace(/[\\+\-!(){}\[\]^"~*?:/]|&&|\|\|/g, ' ').trim();
        if (!t) return { results: [], hasMore: false };
        query = `(release:(${t}) OR artist:(${t}) OR label:(${t}) OR catno:(${t})) AND format:vinyl`;
      }
      const d = await getJson(`https://musicbrainz.org/ws/2/release/?query=${encodeURIComponent(query)}&fmt=json&limit=${limit}&offset=${(page - 1) * limit}`, {});
      return { results: (d.releases || []).map(mbRelease), hasMore: (d.count || 0) > page * limit };
    }

    async function detailsMusicBrainz(id) {
      const r = await getJson(`https://musicbrainz.org/ws/2/release/${id}?inc=recordings+labels+artist-credits+release-groups&fmt=json`, {});
      const tracklist = [];
      (r.media || []).forEach((m, i) => (m.tracks || []).forEach(t => tracklist.push({ pos: (r.media.length > 1 ? `${i + 1}-` : '') + (t.number || ''), title: t.title, duration: msToTime(t.length) })));
      const li = (r['label-info'] || [])[0] || {};
      return {
        tracklist, genres: [],
        label: (li.label && li.label.name) || '', catno: li['catalog-number'] || '',
        country: r.country || '', year: (r.date || '').slice(0, 4),
        cover: `https://coverartarchive.org/release/${id}/front-500`,
        url: `https://musicbrainz.org/release/${id}`
      };
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
      const d = await getJson(`https://api.discogs.com/releases/${id}`, discogsAuth(auth) || {});
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
        url: d.uri || `https://www.discogs.com/release/${id}`
      };
    }

    return {
      isBarcode,
      hasDiscogs: auth => !!discogsAuth(auth),
      search: ({ q, source, page = 1, auth }) => source === 'discogs' ? searchDiscogs(q, page, auth) : searchMusicBrainz(q, page),
      details: ({ source, id, auth }) => source === 'discogs' ? detailsDiscogs(id, auth) : detailsMusicBrainz(id)
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
  function ygoCompact(en, fr, sets) {
    const frName = new Map(((fr && fr.data) || []).map(c => [c.id, c.name]));
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
        cm: parseFloat(((c.card_prices || [])[0] || {}).cardmarket_price) || 0
      });
    }
    return { v: 2, at: Date.now(), cards, sets: setList };
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

  // Ligne pour la wishlist Cardmarket : « 2 Dark Magician »
  const cmLine = (qty, name) => `${qty} ${name}`;

  return { PARTS, pickCollections, mergeMaps, mergeCollections, sameCollections, createVinylApi,
    YGO_URLS, ygoImgUrl, ygoCompact, ygoKey, ygoNormCode, ygoCodesInText, ygoIndex, cmLine };
});
