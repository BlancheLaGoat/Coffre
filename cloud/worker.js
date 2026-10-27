// Coffre — serveur de synchro en ligne (Cloudflare Worker + base D1 liée sous le nom « DB »).
//
// Il ne fait que garder une sauvegarde par « code de synchro ». Tout est chiffré sur l'appareil
// avant l'envoi : le serveur (et donc la personne qui l'héberge) ne peut pas lire les collections.
// L'appareil envoie un identifiant tiré du code ; le serveur ne garde qu'une empreinte de cet identifiant.
//
//   GET    /v1/s/<id>   → { ver, data, at }   (404 si rien n'est encore enregistré)
//   PUT    /v1/s/<id>   ← { ver, data }       (ver = version lue avant ; 409 si quelqu'un a écrit entre-temps)
//   DELETE /v1/s/<id>   → supprime la sauvegarde

const MAX_BYTES = 1900000; // limite d'une ligne D1 (2 Mo), largement assez pour une collection compressée
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Coffre',
  'Access-Control-Max-Age': '86400'
};
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...CORS } });

let tableReady = false;
async function ensureTable(env) {
  if (tableReady) return;
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS sync (k TEXT PRIMARY KEY, ver INTEGER NOT NULL, data TEXT NOT NULL, at INTEGER NOT NULL)').run();
  tableReady = true;
}
async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const url = new URL(req.url);
    if (url.pathname === '/' || url.pathname === '/v1') return json({ ok: true, app: 'coffre-sync', v: 1, db: !!env.DB });
    const m = url.pathname.match(/^\/v1\/s\/([a-f0-9]{64})$/);
    if (!m) return json({ error: 'introuvable' }, 404);
    if (req.headers.get('X-Coffre') !== '1') return json({ error: 'client inconnu' }, 400);
    if (!env.DB) return json({ error: 'base D1 non liée (nom attendu : DB)' }, 500);
    await ensureTable(env);
    const key = await sha256Hex('coffre-sync:' + m[1]);

    if (req.method === 'GET') {
      const row = await env.DB.prepare('SELECT ver, data, at FROM sync WHERE k = ?').bind(key).first();
      if (!row) return json({ error: 'vide' }, 404);
      return json({ ver: row.ver, data: row.data, at: row.at });
    }

    if (req.method === 'PUT') {
      if (Number(req.headers.get('Content-Length') || 0) > MAX_BYTES) return json({ error: 'trop gros' }, 413);
      const body = await req.text();
      if (body.length > MAX_BYTES) return json({ error: 'trop gros' }, 413);
      let o;
      try { o = JSON.parse(body); } catch (e) { return json({ error: 'JSON invalide' }, 400); }
      if (!o || typeof o.data !== 'string' || !o.data || !Number.isInteger(o.ver) || o.ver < 0) return json({ error: 'requête invalide' }, 400);
      const now = Date.now();
      const res = o.ver === 0
        ? await env.DB.prepare('INSERT INTO sync (k, ver, data, at) VALUES (?, 1, ?, ?) ON CONFLICT(k) DO NOTHING').bind(key, o.data, now).run()
        : await env.DB.prepare('UPDATE sync SET ver = ver + 1, data = ?, at = ? WHERE k = ? AND ver = ?').bind(o.data, now, key, o.ver).run();
      if (!res.meta || !res.meta.changes) return json({ error: 'conflit' }, 409);
      return json({ ver: o.ver + 1, at: now });
    }

    if (req.method === 'DELETE') {
      await env.DB.prepare('DELETE FROM sync WHERE k = ?').bind(key).run();
      return json({ ok: true });
    }
    return json({ error: 'méthode non prise en charge' }, 405);
  }
};
