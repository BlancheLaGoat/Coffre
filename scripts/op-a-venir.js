// Tâche GitHub (une fois par jour) : récupère les cartes One Piece à venir sur TCGCSV
// (catalogue de précommandes TCGplayer) pour les extensions qu'optcgapi n'a pas encore,
// et écrit onepiece-a-venir.json. L'appli Coffre lit ce fichier sur GitHub au lieu d'interroger TCGCSV.
// Utilisation : node scripts/op-a-venir.js <fichier de sortie>
const fs = require('fs');
const Core = require('../src/shared/coffre-core.js');
const UA = 'CoffreDataBot/1.0';
async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${url} : ${res.status}`);
  return res.json();
}
(async () => {
  const out = process.argv[2] || 'onepiece-a-venir.json';
  const [sets, decks] = await Promise.all([getJson(Core.OP_URLS.sets).catch(() => []), getJson(Core.OP_URLS.decks).catch(() => [])]);
  const known = Core.opKnownSets(sets, decks);
  const up = await Core.opUpcoming(getJson, known, Date.now(), 150);   // une demande toutes les 150 ms (règles de TCGCSV)
  fs.writeFileSync(out, JSON.stringify({ at: Date.now(), source: 'tcgcsv.com (TCGplayer)', ...up }));
  console.log(`${up.sets.length} extension(s) à venir : ${up.sets.map(s => `${s.set_id} (${s.date})`).join(', ') || 'aucune'} · ${up.recs.length} cartes`);
})().catch(e => { console.error(e.message || e); process.exit(1); });
