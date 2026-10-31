// Tâche GitHub (une fois par jour) : assemble la base de cartes Riftbound pour Coffre.
//  - cartes et extensions : Riftcodex (api.riftcodex.com, gratuit, sans clé), y compris les extensions à venir déjà révélées ;
//  - prix : TCGplayer, via TCGCSV (qui demande à être lu par un script, pas par les applis).
// Écrit riftbound.json, que l'appli lit dans la branche « donnees ».
// Utilisation : node scripts/riftbound.js <fichier de sortie>
const fs = require('fs');
const Core = require('../src/shared/coffre-core.js');
const UA = 'CoffreDataBot/1.0 (+https://github.com/BlancheLaGoat/Coffre)';
const pause = ms => new Promise(r => setTimeout(r, ms));
async function getJson(url, tries = 3) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
      if (!res.ok) throw new Error(`${url} : ${res.status}`);
      return await res.json();
    } catch (e) { if (i >= tries) throw e; await pause(2000 * i); }
  }
}
// Toutes les fiches d'une liste, en plusieurs ordres de tri si besoin : sans tri stable, les pages de Riftcodex
// se chevauchent (des cartes reviennent deux fois et d'autres jamais). On réunit les passes jusqu'à tout avoir.
const itemKey = it => `${it.riftbound_id || ''}|${it.name || ''}|${it.tcgplayer_id || ''}`;
async function allCards(filter, expected) {
  const seen = new Map();
  const orders = ['sort=public_code&dir=1', 'sort=collector_number&dir=1', 'sort=name&dir=1', 'sort=name&dir=-1', 'sort=public_code&dir=-1'];
  for (const o of orders) {
    for (const it of await allPages(`/cards?${filter ? filter + '&' : ''}${o}`)) if (!seen.has(itemKey(it))) seen.set(itemKey(it), it);
    if (expected && seen.size >= expected) break;
  }
  return [...seen.values()];
}
async function allPages(path) {
  const out = [];
  for (let page = 1; page <= 200; page++) {
    const sep = path.includes('?') ? '&' : '?';
    const r = await getJson(`${Core.RB_API}${path}${sep}size=100&page=${page}`);
    const items = (r && r.items) || [];
    out.push(...items);
    if (!items.length || page >= (r.pages || 1)) break;
    await pause(250);
  }
  return out;
}
// TCGplayer via TCGCSV : prix de toutes les cartes, et cartes des extensions que Riftcodex n'a pas encore (ex. Radiance)
async function fromTcg(knownSets) {
  const prices = new Map(), extra = { sets: [], items: [] };
  const cats = await getJson('https://tcgcsv.com/tcgplayer/categories');
  const cat = ((cats && cats.results) || []).find(c => /riftbound/i.test(`${c.name} ${c.displayName}`));
  if (!cat) { console.log('TCGCSV : catégorie Riftbound introuvable, pas de prix'); return { prices, extra }; }
  const base = `https://tcgcsv.com/tcgplayer/${cat.categoryId}/`;
  const groups = (await getJson(base + 'groups')).results || [];
  for (const g of groups) {
    await pause(150);   // règles de TCGCSV : pas de rafale
    let pr;
    try { pr = await getJson(base + g.groupId + '/prices'); } catch (e) { continue; }
    // Une ligne par finition : « Normal » et/ou « Foil » (même sans prix, la ligne dit que la finition existe)
    for (const r of (pr && pr.results) || []) {
      const v = r.marketPrice || r.midPrice || r.lowPrice || 0;
      const k = String(r.productId), cur = map(prices, k) || { n: 0, f: 0, hn: false, hf: false };
      if (/foil/i.test(r.subTypeName || '')) { cur.hf = true; if (v && (!cur.f || v < cur.f)) cur.f = v; }
      else { cur.hn = true; if (v && (!cur.n || v < cur.n)) cur.n = v; }
      prices.set(k, cur);
    }
    // Extension absente de Riftcodex (récente ou à venir) : on prend ses cartes chez TCGplayer
    const ab = String(g.abbreviation || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const recent = (Date.parse(g.publishedOn) || 0) > Date.now() - 200 * 864e5;
    const nm = String(g.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (ab && recent && !knownSets.has(ab) && !knownSets.has('name:' + nm) && ![...knownSets].some(k => k.startsWith('name:') && nm.includes(k.slice(5))) && !/promo|sealed|bundle|deck|box/i.test(g.name || '')) {
      await pause(150);
      try {
        const prods = await getJson(base + g.groupId + '/products');
        const r = Core.rbFromTcg(g, prods);
        if (r.items.length >= 10) { extra.sets.push(r.set); extra.items.push(...r.items); console.log(`TCGCSV : ${g.name} (${ab}) ajoutée, ${r.items.length} cartes`); }
      } catch (e) { console.log(`TCGCSV : ${g.name} illisible (${e.message || e})`); }
    }
  }
  console.log(`TCGCSV : catégorie ${cat.categoryId}, ${groups.length} groupes, ${prices.size} prix`);
  return { prices, extra };
}
const map = (m, k) => m.get(k);
(async () => {
  const out = process.argv[2] || 'riftbound.json';
  const sets = await allPages('/sets');
  // extension par extension (le nombre de cartes annoncé permet de vérifier qu'on les a toutes), puis une passe globale
  const byKey = new Map();
  for (const x of sets) {
    const got = await allCards('set_id=' + encodeURIComponent(String(x.set_id || '').toLowerCase()), x.card_count || 0);
    for (const it of got) byKey.set(itemKey(it), it);
    const ids = new Set(got.map(it => it.riftbound_id));
    console.log(`${x.set_id} : ${got.length} fiches reçues (${ids.size} codes différents) pour ${x.card_count || '?'} annoncées`);
  }
  for (const it of await allCards('', 1)) byKey.set(itemKey(it), it);
  const cards = [...byKey.values()];
  const known = new Set(sets.map(x => String(x.set_id || '').toUpperCase().replace(/[^A-Z0-9]/g, '')));
  for (const x of sets) { const n = String(x.name || '').toLowerCase().replace(/[^a-z0-9]/g, ''); if (n.length >= 4) known.add('name:' + n); }
  let tcg = { prices: new Map(), extra: { sets: [], items: [] } };
  try { tcg = await fromTcg(known); } catch (e) { console.log('TCGCSV indisponible : ' + (e.message || e)); }
  const db = Core.rbCompact([...sets, ...tcg.extra.sets], [...cards, ...tcg.extra.items], tcg.prices);
  if (db.cards.length < 100) throw new Error(`Base trop petite (${db.cards.length} cartes) : rien n'est publié.`);
  fs.writeFileSync(out, JSON.stringify(db));
  const prints = db.cards.reduce((a, c) => a + c.p.length, 0);
  console.log(`${sets.length} extensions, ${cards.length} fiches Riftcodex + ${tcg.extra.items.length} TCGplayer → ${db.cards.length} cartes, ${prints} versions · ${Math.round(fs.statSync(out).size / 1024)} Ko`);
  console.log('Extensions : ' + db.sets.map(x => `${x[1]} (${x[4] || '?'})`).join(', '));
})().catch(e => { console.error(e.message || e); process.exit(1); });
