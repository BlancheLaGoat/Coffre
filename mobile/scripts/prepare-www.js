// Prépare le dossier www/ de l'appli Android à partir de l'interface du PC.
// L'interface (app.js, styles.css, fm-data.js) est partagée : une modif sur PC arrive aussi sur le téléphone.
const fs = require('fs');
const path = require('path');

const M = path.join(__dirname, '..');
const ROOT = path.join(M, '..');
const R = path.join(ROOT, 'src', 'renderer');
const WWW = path.join(M, 'www');

fs.rmSync(WWW, { recursive: true, force: true });
fs.mkdirSync(path.join(WWW, 'cards'), { recursive: true });

const copy = (from, to) => fs.copyFileSync(from, path.join(WWW, to));
copy(path.join(R, 'app.js'), 'app.js');
copy(path.join(R, 'styles.css'), 'styles.css');
copy(path.join(R, 'fm-data.js'), 'fm-data.js');
copy(path.join(ROOT, 'src', 'shared', 'coffre-core.js'), 'coffre-core.js');
copy(path.join(M, 'node_modules', '@zxing', 'library', 'umd', 'index.min.js'), 'zxing.js');
for (const f of fs.readdirSync(path.join(M, 'src'))) copy(path.join(M, 'src', f), f);

const cards = path.join(ROOT, 'src', 'assets', 'cards');
let n = 0;
for (const f of fs.readdirSync(cards)) if (f.endsWith('.webp')) { fs.copyFileSync(path.join(cards, f), path.join(WWW, 'cards', f)); n++; }

// Version de l'appli = version du PC (package.json à la racine)
const version = process.env.APP_VERSION || require(path.join(ROOT, 'package.json')).version;

let html = fs.readFileSync(path.join(R, 'index.html'), 'utf8');
html = html
  .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/,
    `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' data: blob: https: http:; media-src 'self' blob: mediastream:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' https: http:">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#1b1a1f">`)
  .replace('<link rel="stylesheet" href="styles.css">', '<link rel="stylesheet" href="styles.css">\n  <link rel="stylesheet" href="mobile.css">')
  .replace('<script src="fm-data.js"></script>',
    `<script src="version.js"></script>
  <script src="fm-data.js"></script>
  <script src="coffre-core.js"></script>
  <script src="zxing.js"></script>
  <script src="mobile.js"></script>`)
  .replace('<script src="app.js"></script>', '<script src="app.js"></script>\n  <script src="scan.js"></script>');
if (!html.includes('mobile.js') || !html.includes('scan.js')) throw new Error("index.html n'a pas pu être adapté");
fs.writeFileSync(path.join(WWW, 'index.html'), html);
fs.writeFileSync(path.join(WWW, 'version.js'), `window.COFFRE_VERSION = ${JSON.stringify(version)};\n`);
console.log(`www prêt : ${n} images de cartes, version ${version}`);
