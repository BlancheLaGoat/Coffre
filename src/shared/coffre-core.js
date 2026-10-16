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

  function mergeCollections(base, inc) {
    return { fm: mergeMaps(base.fm, inc.fm), vinyls: mergeMaps(base.vinyls, inc.vinyls) };
  }

  function sameCollections(a, b) {
    return JSON.stringify(a.fm || {}) === JSON.stringify(b.fm || {}) && JSON.stringify(a.vinyls || {}) === JSON.stringify(b.vinyls || {});
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

  return { mergeMaps, mergeCollections, sameCollections, createVinylApi };
});
