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
// Prix du marché TCGplayer par produit (le moins cher entre normal et foil quand les deux existent)
async function tcgPrices() {
  const map = new Map();
  const cats = await getJson('https://tcgcsv.com/tcgplayer/categories');
  const cat = ((cats && cats.results) || []).find(c => /riftbound/i.test(`${c.name} ${c.displayName}`));
  if (!cat) { console.log('TCGCSV : catégorie Riftbound introuvable, pas de prix'); return map; }
  const base = `https://tcgcsv.com/tcgplayer/${cat.categoryId}/`;
  const groups = (await getJson(base + 'groups')).results || [];
  for (const g of groups) {
    await pause(150);   // règles de TCGCSV : pas de rafale
    let pr;
    try { pr = await getJson(base + g.groupId + '/prices'); } catch (e) { continue; }
    for (const r of (pr && pr.results) || []) {
      const v = r.marketPrice || r.midPrice || r.lowPrice || 0;
      if (!v) continue;
      const k = String(r.productId), cur = map.get(k);
      if (!cur || (r.subTypeName === 'Normal') || v < cur) map.set(k, v);
    }
  }
  console.log(`TCGCSV : catégorie ${cat.categoryId}, ${groups.length} extensions, ${map.size} prix`);
  return map;
}
(async () => {
  const out = process.argv[2] || 'riftbound.json';
  const sets = await allPages('/sets');
  const cards = await allPages('/cards');
  let prices = new Map();
  try { prices = await tcgPrices(); } catch (e) { console.log('Prix indisponibles : ' + (e.message || e)); }
  const db = Core.rbCompact(sets, cards, prices);
  if (db.cards.length < 100) throw new Error(`Base trop petite (${db.cards.length} cartes) : rien n'est publié.`);
  fs.writeFileSync(out, JSON.stringify(db));
  const prints = db.cards.reduce((a, c) => a + c.p.length, 0);
  console.log(`${sets.length} extensions, ${cards.length} fiches → ${db.cards.length} cartes, ${prints} versions · ${Math.round(fs.statSync(out).size / 1024)} Ko`);
  console.log('Extensions : ' + db.sets.map(x => `${x[1]} (${x[4] || '?'})`).join(', '));
})().catch(e => { console.error(e.message || e); process.exit(1); });
