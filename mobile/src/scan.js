// Coffre Android — appareil photo : reconnaissance des cartes FM par l'illustration,
// lecture du code-barres des vinyles et du QR code d'appairage. Chargé après app.js.
(function () {
  'use strict';
  const App = window.CoffreApp;
  const $ = id => document.getElementById(id);
  const esc = App.esc;

  // ============================================================
  //  RECONNAISSANCE DES CARTES
  //  On regarde seulement l'illustration (pas le texte ni le code),
  //  donc une vieille carte japonaise est reconnue comme une carte récente.
  // ============================================================
  const ART = [0.12, 0.185, 0.88, 0.70];   // zone de l'illustration dans la carte (x0, y0, x1, y1)
  const CARD_RATIO = 421 / 614;            // largeur / hauteur d'une carte
  const G = 12, DIM = G * G * 3;
  const DESC_VERSION = 'v1';

  const cA = document.createElement('canvas'); cA.width = cA.height = 192;
  const cB = document.createElement('canvas'); cB.width = cB.height = 48;
  const xA = cA.getContext('2d', { willReadFrequently: true });
  const xB = cB.getContext('2d', { willReadFrequently: true });
  xA.imageSmoothingQuality = 'high'; xB.imageSmoothingQuality = 'high';

  const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const LIN = new Float32Array(256); for (let i = 0; i < 256; i++) LIN[i] = lin(i);
  const f = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;

  // Empreinte d'une zone d'image : grille 12×12 en couleurs LAB, normalisée
  // (insensible à la luminosité et à la balance des blancs).
  function describe(src, sx, sy, sw, sh) {
    xA.clearRect(0, 0, 192, 192);
    xA.drawImage(src, sx, sy, sw, sh, 0, 0, 192, 192);
    xB.drawImage(cA, 0, 0, 48, 48);
    const px = xB.getImageData(0, 0, 48, 48).data;
    const L = new Float32Array(G * G), A = new Float32Array(G * G), B = new Float32Array(G * G);
    for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) {
      let r = 0, g = 0, b = 0;
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        const i = ((gy * 4 + y) * 48 + gx * 4 + x) * 4;
        r += px[i]; g += px[i + 1]; b += px[i + 2];
      }
      const R = LIN[Math.round(r / 16)], Gc = LIN[Math.round(g / 16)], Bc = LIN[Math.round(b / 16)];
      const X = (0.4124 * R + 0.3576 * Gc + 0.1805 * Bc) / 0.95047;
      const Y = 0.2126 * R + 0.7152 * Gc + 0.0722 * Bc;
      const Z = (0.0193 * R + 0.1192 * Gc + 0.9505 * Bc) / 1.08883;
      const fx = f(X), fy = f(Y), fz = f(Z);
      const k = gy * G + gx;
      L[k] = 116 * fy - 16; A[k] = 500 * (fx - fy); B[k] = 200 * (fy - fz);
    }
    const out = new Float32Array(DIM);
    [[L, 0.6], [A, 1], [B, 1]].forEach(([ch, w], c) => {
      let m = 0; for (const v of ch) m += v; m /= ch.length;
      let s = 0; for (const v of ch) s += (v - m) * (v - m); s = Math.sqrt(s / ch.length) + 1e-3;
      for (let i = 0; i < ch.length; i++) out[c * G * G + i] = (ch[i] - m) / s * w;
    });
    let n = 0; for (const v of out) n += v * v; n = Math.sqrt(n) || 1;
    for (let i = 0; i < DIM; i++) out[i] /= n;
    return out;
  }

  // Empreinte de l'illustration d'une carte occupant le rectangle (x, y, w, h) de l'image source
  function describeCard(src, x, y, w, h) {
    return describe(src, x + ART[0] * w, y + ART[1] * h, (ART[2] - ART[0]) * w, (ART[3] - ART[1]) * h);
  }

  // ---------- Empreintes de référence (calculées une fois sur le téléphone) ----------
  const REF = { ids: [], mat: null, ready: null };
  function loadImg(url) {
    return new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = url; });
  }
  function b64ToF32(b64) { const s = atob(b64); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return new Float32Array(u.buffer); }
  function f32ToB64(a) { const u = new Uint8Array(a.buffer); let s = ''; for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768)); return btoa(s); }

  function prepareRefs(onProgress) {
    if (REF.ready) return REF.ready;
    REF.ready = (async () => {
      const ids = [...App.HAS_IMG].sort();
      const key = `empreintes-${DESC_VERSION}-${ids.length}.bin`;
      const FS = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Filesystem;
      try {
        const c = FS ? (await FS.readFile({ path: key, directory: 'DATA' })).data : null;
        if (c) { const m = b64ToF32(c); if (m.length === ids.length * DIM) { REF.ids = ids; REF.mat = m; return; } }
      } catch (e) { /* pas encore calculées */ }
      const mat = new Float32Array(ids.length * DIM);
      for (let i = 0; i < ids.length; i++) {
        try {
          const img = await loadImg(App.cardImg(ids[i]));
          mat.set(describeCard(img, 0, 0, img.naturalWidth, img.naturalHeight), i * DIM);
        } catch (e) { /* image manquante : empreinte nulle, jamais proposée */ }
        if (onProgress && i % 25 === 0) { onProgress(i / ids.length); await new Promise(r => setTimeout(r, 0)); }
      }
      REF.ids = ids; REF.mat = mat;
      try { if (FS) await FS.writeFile({ path: key, directory: 'DATA', data: f32ToB64(mat) }); } catch (e) { /* on recalculera la prochaine fois */ }
    })();
    return REF.ready;
  }

  // Compare plusieurs cadrages légèrement décalés et garde, pour chaque carte, le meilleur score.
  const CROPS = [[0, 0, 1], [0, 0, 0.95], [0, 0, 1.05], [-0.03, 0, 1], [0.03, 0, 1], [0, -0.025, 1], [0, 0.025, 1]];
  function scoreRect(src, x, y, w, h) {
    const n = REF.ids.length, mat = REF.mat;
    const best = new Float32Array(n).fill(-2);
    for (const [dx, dy, s] of CROPS) {
      const cw = w * s, ch = h * s;
      const q = describeCard(src, x + (w - cw) / 2 + dx * w, y + (h - ch) / 2 + dy * h, cw, ch);
      for (let i = 0; i < n; i++) {
        let d = 0; const o = i * DIM;
        for (let j = 0; j < DIM; j++) d += mat[o + j] * q[j];
        if (d > best[i]) best[i] = d;
      }
    }
    return best;
  }
  function topK(scores, k) {
    const idx = Array.from(scores.keys()).sort((a, b) => scores[b] - scores[a]).slice(0, k);
    return idx.map(i => ({ n: REF.ids[i], score: scores[i] }));
  }

  // ============================================================
  //  APPAREIL PHOTO
  // ============================================================
  let stream = null, loopTimer = null, mode = '', qrResolve = null;
  const cam = { smooth: null, lead: '', leadCount: 0, armed: true, pauseUntil: 0, added: [] };
  // Réglages de l'ajout automatique (score de ressemblance entre -1 et 1)
  const AUTO = { score: 0.68, margin: 0.15, frames: 4, rearm: 0.55, rearmFrames: 3 };

  function buildOverlay() {
    if ($('scanView')) return;
    const el = document.createElement('div');
    el.id = 'scanView'; el.className = 'scan'; el.hidden = true;
    el.innerHTML = `
      <video id="scanVideo" playsinline muted autoplay></video>
      <div class="scan-frame" id="scanFrame"><i></i></div>
      <div class="scan-top">
        <button class="scan-close" data-scan="close" aria-label="Fermer">✕</button>
        <div class="scan-title" id="scanTitle"></div>
        <label class="scan-auto" id="scanAutoWrap"><input type="checkbox" id="scanAuto"> Ajout auto</label>
      </div>
      <div class="scan-bottom">
        <p class="scan-msg" id="scanMsg"></p>
        <div class="scan-cands" id="scanCands"></div>
        <div class="scan-actions" id="scanActions"></div>
      </div>`;
    document.body.appendChild(el);
    el.addEventListener('click', onClick);
    const cands = el.querySelector('#scanCands');
    const hold = () => { cam.pauseUntil = Date.now() + 1500; };
    cands.addEventListener('touchstart', hold, { passive: true });
    cands.addEventListener('pointerdown', hold);
    el.querySelector('#scanAuto').addEventListener('change', e => {
      App.data.settings.scanAuto = e.target.checked; App.scheduleSave();
      cam.armed = true; cam.leadCount = 0;
    });
  }

  async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("L'appareil photo n'est pas disponible.");
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }
    });
    const v = $('scanVideo');
    v.srcObject = stream;
    await v.play().catch(() => {});
    await new Promise(r => { if (v.videoWidth) r(); else v.onloadedmetadata = () => r(); });
    // Mise au point continue si le téléphone la propose
    try {
      const track = stream.getVideoTracks()[0];
      const caps = track.getCapabilities ? track.getCapabilities() : {};
      if (caps.focusMode && caps.focusMode.includes('continuous')) await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
    } catch (e) { /* pas grave */ }
  }

  function stopCamera() {
    clearTimeout(loopTimer); loopTimer = null;
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = null;
    const v = $('scanVideo'); if (v) v.srcObject = null;
  }

  async function open(m) {
    buildOverlay();
    mode = m;
    const view = $('scanView');
    view.dataset.mode = m;
    view.hidden = false;
    $('scanCands').innerHTML = ''; $('scanActions').innerHTML = '';
    $('scanAutoWrap').hidden = m !== 'card';
    $('scanAuto').checked = App.data.settings.scanAuto !== false;
    $('scanTitle').textContent = m === 'card' ? 'Scanner des cartes' : m === 'vinyl' ? 'Scanner un vinyle' : 'QR code du PC';
    if (m === 'vinyl') $('scanActions').innerHTML = `<button class="scan-shot" data-scan="cover">📸 Reconnaître la pochette</button>`;
    cam.smooth = null; cam.lead = ''; cam.leadCount = 0; cam.armed = true; cam.lastAuto = ''; cam.added = [];
    msg(m === 'card' ? 'Place la carte dans le cadre, bien à plat.' : m === 'vinyl' ? "Cadre la pochette et touche le bouton, ou vise un code-barres s'il y en a un." : 'Vise le QR code affiché dans les réglages de Coffre sur le PC.');
    layoutFrame();
    try {
      if (m === 'card') {
        await prepareRefs(p => msg(`Préparation de la reconnaissance… ${Math.round(p * 100)} %`));
        if (mode !== m || view.hidden) return;
        msg('Place la carte dans le cadre, bien à plat.');
      }
      await startCamera();
      if (view.hidden) return stopCamera();
      layoutFrame();
      loop();
    } catch (e) {
      msg(e && e.name === 'NotAllowedError'
        ? "Coffre n'a pas accès à l'appareil photo. Autorise-le dans les paramètres Android (Applis → Coffre → Autorisations)."
        : "Impossible d'ouvrir l'appareil photo : " + (e.message || e));
    }
  }

  function close() {
    stopCamera();
    const view = $('scanView'); if (view) view.hidden = true;
    if (qrResolve) { qrResolve(''); qrResolve = null; }
    if (mode === 'card' && cam.added.length) App.toast(`${cam.added.length} carte${cam.added.length > 1 ? 's' : ''} ajoutée${cam.added.length > 1 ? 's' : ''}`);
    mode = '';
  }

  const msg = t => { const m = $('scanMsg'); if (m) m.textContent = t; };

  // Cadre de visée : carte (portrait) ou bande large (code-barres / QR)
  function layoutFrame() {
    const fr = $('scanFrame'); if (!fr) return;
    const W = window.innerWidth, H = window.innerHeight;
    let w, h;
    if (mode === 'card') {
      const maxH = H * 0.56, maxW = W * 0.78;
      h = Math.min(maxH, maxW / CARD_RATIO); w = h * CARD_RATIO;
    } else if (mode === 'vinyl') { w = Math.min(W * 0.86, H * 0.48); h = w; }
    else { w = Math.min(W * 0.7, H * 0.45); h = w; }
    fr.style.width = w + 'px'; fr.style.height = h + 'px';
    fr.style.left = (W - w) / 2 + 'px'; fr.style.top = Math.max(64, H * 0.40 - h / 2) + 'px';
  }
  window.addEventListener('resize', layoutFrame);

  // Rectangle du cadre converti en pixels de la vidéo (la vidéo remplit l'écran en « cover »)
  function frameInVideo() {
    const v = $('scanVideo'), fr = $('scanFrame');
    const vw = v.videoWidth, vh = v.videoHeight;
    if (!vw || !vh) return null;
    const vr = v.getBoundingClientRect(), r = fr.getBoundingClientRect();
    const s = Math.max(vr.width / vw, vr.height / vh);
    const ox = vr.left + (vr.width - vw * s) / 2, oy = vr.top + (vr.height - vh * s) / 2;
    return { x: (r.left - ox) / s, y: (r.top - oy) / s, w: r.width / s, h: r.height / s, vw, vh };
  }

  function loop() {
    clearTimeout(loopTimer);
    if (!stream || !mode) return;
    const t0 = performance.now();
    try {
      if (mode === 'card') tickCard();
      else tickCode();
    } catch (e) { /* image pas prête */ }
    if (!stream) return;
    const spent = performance.now() - t0;
    loopTimer = setTimeout(loop, Math.max(120, (mode === 'card' ? 380 : 220) - spent));
  }

  // ---------- Cartes ----------
  function tickCard() {
    const r = frameInVideo(); if (!r) return;
    const raw = scoreRect($('scanVideo'), r.x, r.y, r.w, r.h);
    // Lissage sur quelques images pour éviter que les propositions sautent
    if (!cam.smooth) cam.smooth = raw;
    else for (let i = 0; i < raw.length; i++) cam.smooth[i] = cam.smooth[i] * 0.45 + raw[i] * 0.55;
    const top = topK(cam.smooth, 6);
    if (Date.now() >= cam.pauseUntil) renderCands(top);

    // Ajout automatique : la même carte en tête plusieurs fois de suite, nettement devant la 2e
    const [a, b] = top;
    const sure = a.score >= AUTO.score && a.score - b.score >= AUTO.margin;
    if (a.n === cam.lead && sure) cam.leadCount++; else { cam.lead = a.n; cam.leadCount = sure ? 1 : 0; }
    cam.lowCount = a.score < AUTO.rearm ? (cam.lowCount || 0) + 1 : 0;
    if (cam.lowCount >= AUTO.rearmFrames) cam.armed = true;   // carte retirée du cadre
    if (cam.armed === false && cam.lastAuto && a.n !== cam.lastAuto && sure && cam.leadCount >= AUTO.frames) cam.armed = true; // autre carte
    if ($('scanAuto').checked && cam.armed && cam.leadCount >= AUTO.frames) {
      cam.armed = false; cam.lastAuto = a.n;
      addCard(a.n, true);
    }
  }

  function renderCands(top) {
    const box = $('scanCands');
    box.innerHTML = top.map((c, i) => {
      const card = App.CARDS[Number(c.n) - 1];
      return `<button class="cand${i === 0 ? ' first' : ''}" data-scan="add" data-n="${c.n}">
        <img src="${App.cardImg(c.n)}" alt="">
        <span class="nm">${esc(card.name)}</span>
        <span class="sc">${Math.max(0, Math.round(c.score * 100))} %</span></button>`;
    }).join('');
    const own = n => (App.data.fm[n] && App.data.fm[n].qty) || 0;
    $('scanActions').innerHTML = cam.added.length
      ? `<span>Ajoutées : <b>${cam.added.length}</b> · dernière : ${esc(App.CARDS[Number(cam.added[cam.added.length - 1]) - 1].name)} (×${own(cam.added[cam.added.length - 1])})</span><button data-scan="undo">Annuler</button>`
      : `<span>Touche une carte pour l'ajouter${$('scanAuto').checked ? ', ou laisse-la dans le cadre pour l\'ajout auto' : ''}.</span>`;
  }

  function addCard(n, auto) {
    const q = App.changeQty(n, +1);
    cam.added.push(n);
    App.renderFm();
    if (navigator.vibrate) navigator.vibrate(auto ? [30, 40, 30] : 30);
    const card = App.CARDS[Number(n) - 1];
    App.toast(`${card.name} ajoutée (×${q})`);
    const fr = $('scanFrame'); fr.classList.remove('ok'); void fr.offsetWidth; fr.classList.add('ok');
    cam.pauseUntil = 0;
    if (cam.smooth) renderCands(topK(cam.smooth, 6));
  }

  // ---------- Codes-barres et QR codes ----------
  const cC = document.createElement('canvas');
  const xC = cC.getContext('2d', { willReadFrequently: true });
  let detector = null, zx = null, busyDetect = false;

  function getDetector() {
    const formats = mode === 'qr' ? ['qr_code'] : ['ean_13', 'ean_8', 'upc_a', 'upc_e'];
    try {
      if ('BarcodeDetector' in window) return { kind: 'native', mode, d: new window.BarcodeDetector({ formats }) };
    } catch (e) { /* non disponible */ }
    return null;
  }
  function getZxing() {
    const Z = window.ZXing;
    const hints = new Map();
    hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, mode === 'qr' ? [Z.BarcodeFormat.QR_CODE] : [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E]);
    hints.set(Z.DecodeHintType.TRY_HARDER, true);
    const r = new Z.MultiFormatReader(); r.setHints(hints);
    return { mode, r };
  }

  function tickCode() {
    if (busyDetect) return;
    const v = $('scanVideo'), r = frameInVideo(); if (!r) return;
    // Zone visée un peu élargie, à la résolution de la vidéo
    const pad = 0.25;
    const x = Math.max(0, r.x - r.w * pad), y = Math.max(0, r.y - r.h * pad);
    const w = Math.min(r.vw - x, r.w * (1 + 2 * pad)), h = Math.min(r.vh - y, r.h * (1 + 2 * pad));
    const k = Math.min(1, 1280 / w);
    cC.width = Math.round(w * k); cC.height = Math.round(h * k);
    xC.drawImage(v, x, y, w, h, 0, 0, cC.width, cC.height);
    if (!detector || detector.mode !== mode) detector = getDetector() || { kind: 'none', mode };
    if (detector.kind === 'native') {
      busyDetect = true;
      detector.d.detect(cC).then(list => { busyDetect = false; if (list && list[0]) found(list[0].rawValue); else tryZxing(); })
        .catch(() => { busyDetect = false; detector = { kind: 'none', mode }; });
      return;
    }
    tryZxing();
  }
  function tryZxing() {
    if (!window.ZXing || !mode) return;
    if (!zx || zx.mode !== mode) zx = getZxing();
    try {
      const Z = window.ZXing;
      const bmp = new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(cC)));
      const res = zx.r.decode(bmp);
      if (res) found(res.getText());
    } catch (e) { /* rien trouvé sur cette image */ }
  }

  function found(text) {
    if (!text || !mode) return;
    const m = mode;
    if (navigator.vibrate) navigator.vibrate(40);
    if (m === 'qr') {
      const res = qrResolve; qrResolve = null;
      close();
      if (res) res(text);
      return;
    }
    if (m === 'vinyl') {
      const code = String(text).replace(/\D/g, '');
      close();
      App.showTab('vin');
      App.searchFor(code);
    }
  }


  // ============================================================
  //  VINYLES SANS CODE-BARRES : photo de la pochette
  //  1. on lit le texte de la pochette (artiste, titre, référence) sur le téléphone, sans internet ;
  //  2. on cherche avec ces mots ;
  //  3. on classe les résultats selon la ressemblance de leur pochette avec la photo.
  // ============================================================
  // Lecture du texte par le module Android (ML Kit) : rapide et sans internet.
  const TextReader = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.TextReader;
  const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('trop long')), ms))]);

  // Lignes de texte lisibles, classées : gros texte d'abord (souvent l'artiste et le titre)
  const JUNK = /^(stereo|mono|records?|recordings?|vinyl|vinyle|lp|ep|side|face|rpm|made|in|feat|ft|presents?|edition|remaster(ed)?|digital|music|inc|ltd|all|rights|reserved|the|and|et|de|la|le|les|of)$/i;
  function cleanLine(text) {
    return String(text || '').split(/\s+/)
      .map(w => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
      .filter(w => w.length >= 2 && /\p{L}{2}|\p{N}{2}/u.test(w))
      .join(' ');
  }
  function linesFrom(raw) {
    const seen = new Set();
    return (raw || [])
      .map(l => ({ t: cleanLine(l.text), h: l.h || 10 }))
      .filter(l => l.t && l.t.length <= 48 && l.t.split(' ').some(w => !JUNK.test(w)))
      .sort((a, b) => b.h - a.h)
      .filter(l => { const k = l.t.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  }
  // Plusieurs recherches courtes plutôt qu'une longue : un mot mal lu ne fait plus tout rater
  function buildQueries(lines) {
    const strip = t => t.split(' ').filter(w => !JUNK.test(w)).join(' ');
    const big = lines.slice(0, 4).map(l => strip(l.t)).filter(Boolean);
    const qs = [];
    if (big[0] && big[1]) qs.push(big[0] + ' ' + big[1]);
    big.slice(0, 3).forEach(t => qs.push(t));
    if (big[0] && big[2]) qs.push(big[0] + ' ' + big[2]);
    // Référence catalogue (ex. « SHVL 804 », « 7243 8 49606 »), très précise si elle est lue
    for (const l of lines) {
      const m = l.t.match(/\b[A-Z]{1,6}[ .-]?\d{2,6}(?:[ .-]?\d{1,4})?\b/);
      if (m) { qs.push(m[0]); break; }
    }
    return [...new Set(qs.map(q => q.trim()).filter(q => q.replace(/[^\p{L}\p{N}]/gu, '').length >= 3))].slice(0, 5);
  }

  const snapCanvas = document.createElement('canvas');
  let reading = false;
  async function recognizeCover() {
    const v = $('scanVideo'), r = frameInVideo();
    if (!r || !stream || reading) return;
    reading = true;
    // Photo carrée de la pochette ; on arrête la recherche de code-barres pendant la lecture
    clearTimeout(loopTimer); loopTimer = null;
    const k = Math.min(1, 1200 / r.w);
    snapCanvas.width = Math.round(r.w * k); snapCanvas.height = Math.round(r.h * k);
    snapCanvas.getContext('2d').drawImage(v, r.x, r.y, r.w, r.h, 0, 0, snapCanvas.width, snapCanvas.height);
    v.pause();
    if (navigator.vibrate) navigator.vibrate(30);
    const btn = $('scanView').querySelector('[data-scan=cover]'); if (btn) btn.disabled = true;
    const photo = describe(snapCanvas, 0, 0, snapCanvas.width, snapCanvas.height);
    let words = [];
    if (TextReader) {
      try {
        msg('Lecture du texte de la pochette…');
        const b64 = snapCanvas.toDataURL('image/jpeg', 0.9).split(',')[1];
        const res = await withTimeout(TextReader.read({ image: b64 }), 15000);
        words = linesFrom(res.lines);
      } catch (e) { words = []; }
    }
    reading = false;
    if (mode !== 'vinyl') return;
    close();
    App.showTab('vin');
    openCoverSearch(words, photo);
  }

  // Lignes lues sur la photo : touche une ligne pour chercher avec elle seule
  let coverLines = [];
  const coverHint = () => coverLines.length
    ? `<span>Texte lu sur la pochette (touche une ligne pour chercher avec) :</span>` + coverLines.slice(0, 12).map(l => `<button type="button" class="chip" data-ocr="${esc(l.t)}">${esc(l.t)}</button>`).join('')
    : `<span>Aucun texte lisible sur cette pochette : tape l'artiste ou l'album. Les résultats seront classés selon leur ressemblance avec ta photo.</span>`;

  const wait = ms => new Promise(r => setTimeout(r, ms));
  async function openCoverSearch(lines, photo) {
    coverLines = lines;
    const queries = buildQueries(lines);
    App.presetSearch({ q: queries[0] || '', hint: coverHint(), rerank: list => rerankByCover(list, photo) });
    if (!queries.length) { App.setResults([], { done: true }); return; }
    // MusicBrainz accepte une requête par seconde ; Discogs est plus souple
    const gap = App.searchSource === 'discogs' ? 300 : 1100;
    const merged = []; const ids = new Set(); let lastErr = '';
    for (let i = 0; i < queries.length; i++) {
      if (i) await wait(gap);
      try {
        const r = await App.searchRaw(queries[i]);
        for (const x of r.results || []) {
          const k = x.source + ':' + x.id;
          if (!ids.has(k)) { ids.add(k); merged.push(x); }
        }
      } catch (e) { lastErr = String(e.message || e); }
      App.setResults(merged.slice(), { loading: i < queries.length - 1 });
    }
    App.setResults(merged, { done: true, error: merged.length ? '' : lastErr });
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('#sHint [data-ocr]'); if (!b) return;
    App.rerunSearch(b.dataset.ocr);
  });

  // Ressemblance entre la photo et la pochette de chaque résultat
  const thumbCache = new Map();
  async function thumbDescriptor(url) {
    if (thumbCache.has(url)) return thumbCache.get(url);
    const p = (async () => {
      const b64 = await window.CoffreNet.getImageB64(url);
      if (!b64) return null;
      const img = new Image(); img.src = 'data:image/jpeg;base64,' + b64; await img.decode();
      return describe(img, 0, 0, img.naturalWidth, img.naturalHeight);
    })().catch(() => null);
    thumbCache.set(url, p);
    return p;
  }
  async function rerankByCover(list, photo) {
    const N = Math.min(list.length, 40);
    const head = list.slice(0, N), tail = list.slice(N);
    const scores = new Map();
    let i = 0;
    const work = async () => {
      while (i < head.length) {
        const r = head[i++];
        if (!r.thumb) continue;
        const d = await thumbDescriptor(r.thumb);
        if (d) { let s = 0; for (let j = 0; j < DIM; j++) s += d[j] * photo[j]; scores.set(r, s); }
      }
    };
    await Promise.all([work(), work(), work(), work(), work(), work()]);
    const sorted = head.map((r, idx) => ({ r, idx, s: scores.has(r) ? scores.get(r) : -1 }))
      .sort((a, b) => (b.s - a.s) || (a.idx - b.idx))
      .map(({ r, s }) => ({ ...r, match: s >= 0.75 ? 'Même pochette' : s >= 0.6 ? 'Pochette ressemblante' : '' }));
    return sorted.concat(tail);
  }

  // ---------- Boutons ----------
  function onClick(e) {
    const b = e.target.closest('[data-scan]'); if (!b) return;
    const act = b.dataset.scan;
    if (act === 'close') return close();
    if (act === 'cover') return recognizeCover();
    if (act === 'add') return addCard(b.dataset.n, false);
    if (act === 'undo') {
      const n = cam.added.pop(); if (!n) return;
      App.changeQty(n, -1); App.renderFm();
      App.toast(`${App.CARDS[Number(n) - 1].name} retirée`);
      if (cam.smooth) renderCands(topK(cam.smooth, 6));
    }
  }

  // Boutons « Scanner » ajoutés aux barres d'outils
  function addButtons() {
    const fmTools = document.querySelector('.shelf.fm .tools');
    const vinTools = document.querySelector('.shelf.vin .tools');
    if (fmTools && !$('scanCardBtn')) {
      const b = document.createElement('button');
      b.id = 'scanCardBtn'; b.className = 'primary scan-btn'; b.textContent = '📷 Scanner des cartes';
      b.addEventListener('click', () => open('card'));
      fmTools.prepend(b);
    }
    if (vinTools && !$('scanVinBtn')) {
      const b = document.createElement('button');
      b.id = 'scanVinBtn'; b.className = 'primary scan-btn'; b.textContent = '📷 Scanner un vinyle';
      b.addEventListener('click', () => open('vinyl'));
      vinTools.prepend(b);
    }
    // Bouton rond qui reste visible quand l'en-tête est replié
    if (!$('scanFab')) {
      const f = document.createElement('button');
      f.id = 'scanFab'; f.className = 'scan-fab'; f.textContent = '📷'; f.setAttribute('aria-label', 'Scanner');
      f.addEventListener('click', () => open($('shelves').dataset.tab === 'vin' ? 'vinyl' : 'card'));
      document.body.appendChild(f);
    }
  }
  addButtons();
  // Prépare la reconnaissance en arrière-plan pour que le premier scan soit immédiat
  setTimeout(() => prepareRefs(), 5000);

  window.CoffreScan = {
    openCards: () => open('card'),
    openBarcode: () => open('vinyl'),
    scanQr() { return new Promise(resolve => { if (qrResolve) qrResolve(''); qrResolve = resolve; open('qr'); }); },
    isOpen: () => !!$('scanView') && !$('scanView').hidden,
    close,
    // pour les tests
    _describeCard: describeCard, _scoreRect: scoreRect, _topK: topK, _prepareRefs: prepareRefs, _ref: REF
  };
})();
