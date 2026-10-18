// Écrit les notes d'une version (tirées de src/renderer/changelog.js) pour la page GitHub de la release.
// Utilisation : node scripts/release-notes.js v1.10.1
global.window = {};
const log = require('../src/renderer/changelog.js');
const v = String(process.argv[2] || '').replace(/^v/, '');
const e = log.find(x => x.v === v);
if (!e) { console.log(`Version ${v}`); process.exit(0); }
console.log(`## Nouveautés de la version ${e.v} (${e.date})\n`);
for (const it of e.items) console.log(`- ${it}`);
console.log('\n**Installer :** `Coffre-Setup-' + e.v + '.exe` sur Windows, `Coffre-Android.apk` sur le téléphone. Les deux se mettent aussi à jour tout seuls.');
