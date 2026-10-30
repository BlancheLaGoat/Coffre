// Ajuste le projet Android généré par Capacitor : appareil photo, réseau local, version, icône.
const fs = require('fs');
const path = require('path');

const M = path.join(__dirname, '..');
const A = path.join(M, 'android', 'app');
const version = process.env.APP_VERSION || require(path.join(M, '..', 'package.json')).version;
const [maj, min, pat] = version.split('.').map(n => parseInt(n, 10) || 0);
const versionCode = maj * 10000 + min * 100 + pat;

// 1. Autorisations : appareil photo + connexion au PC en HTTP sur le Wi-Fi
const mf = path.join(A, 'src', 'main', 'AndroidManifest.xml');
let xml = fs.readFileSync(mf, 'utf8');
if (!xml.includes('android.permission.CAMERA')) {
  xml = xml.replace('<uses-permission android:name="android.permission.INTERNET" />',
    '<uses-permission android:name="android.permission.INTERNET" />\n    <uses-permission android:name="android.permission.CAMERA" />\n    <uses-feature android:name="android.hardware.camera" android:required="false" />');
}
if (!xml.includes('usesCleartextTraffic')) xml = xml.replace('<application', '<application\n        android:usesCleartextTraffic="true"');
// Android 11+ : pour savoir si Obtainium est installé (mises à jour de Coffre par Obtainium)
if (!xml.includes('dev.imranr.obtainium')) {
  xml = xml.replace('<application', '<queries>\n        <package android:name="dev.imranr.obtainium" />\n        <package android:name="dev.imranr.obtainium.fdroid" />\n        <intent>\n            <action android:name="android.intent.action.VIEW" />\n            <data android:scheme="obtainium" />\n        </intent>\n    </queries>\n\n    <application');
  if (!xml.includes('dev.imranr.obtainium')) throw new Error('AndroidManifest.xml : <queries> non ajouté');
}
if (!xml.includes('android.permission.CAMERA') || !xml.includes('usesCleartextTraffic')) throw new Error('AndroidManifest.xml : modification impossible');
fs.writeFileSync(mf, xml);

// 2. Numéro de version (le même que l'appli PC)
const bg = path.join(A, 'build.gradle');
let gradle = fs.readFileSync(bg, 'utf8');
gradle = gradle.replace(/versionCode \d+/, `versionCode ${versionCode}`).replace(/versionName "[^"]*"/, `versionName "${version}"`);
if (!gradle.includes(`versionName "${version}"`)) throw new Error('build.gradle : version introuvable');
fs.writeFileSync(bg, gradle);

// 3. Module maison de lecture du texte des pochettes (ML Kit, sur le téléphone)
const javaDir = path.join(A, 'src', 'main', 'java', 'com', 'blanchelagoat', 'coffre');
for (const f of fs.readdirSync(path.join(M, 'native-android'))) fs.copyFileSync(path.join(M, 'native-android', f), path.join(javaDir, f));
let g2 = fs.readFileSync(bg, 'utf8');
if (!g2.includes('mlkit:text-recognition')) {
  g2 = g2.replace("implementation project(':capacitor-android')", "implementation project(':capacitor-android')\n    implementation 'com.google.mlkit:text-recognition:16.0.1'");
  if (!g2.includes('mlkit:text-recognition')) throw new Error('build.gradle : dépendance ML Kit non ajoutée');
  fs.writeFileSync(bg, g2);
}

// 4. Icône et écran de démarrage
const copyDir = (from, to) => {
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, e.name), d = path.join(to, e.name);
    if (e.isDirectory()) { fs.mkdirSync(d, { recursive: true }); copyDir(s, d); } else fs.copyFileSync(s, d);
  }
};
copyDir(path.join(M, 'res-android'), path.join(A, 'src', 'main', 'res'));

console.log(`Projet Android prêt : version ${version} (code ${versionCode})`);
