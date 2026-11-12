/* AMEN — story, chop lab and echoes. Glue between the engine, the wheel and the page. */
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const TRACKS = window.AMEN_TRACKS || [];
  const C = window.AMEN_COLORS;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ALL = { kick: 1, snare: 1, ghost: 1, ride: 1, crash: 1 };
  const apple = (t) => 'https://music.apple.com/us/search?term=' + encodeURIComponent(t.artist + ' ' + t.title);
  const srEl = $('#sr'), gt = $('#gtoast');
  const announce = (msg) => { srEl.textContent = ''; setTimeout(() => { srEl.textContent = msg; }, 30); };
  const gtoast = (msg) => { gt.textContent = msg; gt.classList.add('show'); clearTimeout(gt._t); gt._t = setTimeout(() => gt.classList.remove('show'), 3200); };
  let loopPaused = reduce;   // people who prefer reduced motion start with the loop paused
  const youtube = (t) => 'https://www.youtube.com/results?search_query=' + encodeURIComponent(t.artist + ' ' + t.title);

  /* =============================================================== sound state */
  let soundOn = false, storyVisible = true, labPlaying = false, labVisible = false;
  const soundBtn = $('#sound'), startBtn = $('#startSound');

  function paintSound() {
    soundBtn.setAttribute('aria-pressed', soundOn); soundBtn.setAttribute('aria-label', soundOn ? 'Turn sound off' : 'Turn sound on');
    $('.sound-label', soundBtn).textContent = soundOn ? 'Sound on' : 'Sound off';
    startBtn.classList.toggle('on', soundOn); $('#startLabel').textContent = soundOn ? 'Sound on — now scroll' : 'Tap to hear it';
  }
  async function turnOn() {
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* iOS: ignore the silent switch */ }
    try { await Amen.enable(); } catch (e) { console.warn(e); gtoast('Sound isn\u2019t available in this browser. Everything still works silently.'); return false; }
    Amen.unmute(); soundOn = true; paintSound(); syncTransport(); return true;
  }
  function turnOff() { Amen.mute(); Amen.Preview.stopAll(); soundOn = false; paintSound(); }
  const ensureSound = async () => (soundOn ? true : turnOn());
  soundBtn.addEventListener('click', () => (soundOn ? turnOff() : turnOn()));
  startBtn.addEventListener('click', async () => { if (!soundOn) { loopPaused = false; paintPause(); Amen.stop(); await turnOn(); Amen.start({ mode: 'full' }); } else turnOff(); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && Amen.ctx && Amen.ctx.state !== 'running' && soundOn) Amen.ctx.resume();
    if (document.hidden && labPlaying) stopLab();
  });

  const pauseBtn = $('#pause');
  function paintPause() { pauseBtn.setAttribute('aria-pressed', loopPaused); pauseBtn.setAttribute('aria-label', loopPaused ? 'Play the looping animation' : 'Pause the looping animation'); }
  function setPaused(p) { loopPaused = p; paintPause(); if (p) { if (!labPlaying && Amen.T.playing) Amen.stop(); } else syncTransport(); announce(p ? 'Loop paused' : 'Loop playing'); }
  pauseBtn.addEventListener('click', () => setPaused(!loopPaused));

  function syncTransport() {
    if (labPlaying) return;
    if (loopPaused) { if (Amen.T.playing) Amen.stop(); return; }
    if (storyVisible) { if (!Amen.T.playing) Amen.start({ mode: 'full' }); } else if (Amen.T.playing) Amen.stop();
  }

  /* =============================================================== the story wheel */
  const wheel = new Wheel($('#wheel'), {
    onPick(s, w) {
      Amen.audition(s, 2);
      const d = w.describe(s), cap = $('#caption');
      cap.textContent = d.text; cap.style.left = w.cur.cx + 'px'; cap.style.top = (w.cur.cy + w.cur.r + (innerWidth < 860 ? 12 : 22)) + 'px';
      cap.classList.add('show'); clearTimeout(cap._t); cap._t = setTimeout(() => cap.classList.remove('show'), 2400);
    },
  });
  wheel.set({ layers: Amen.T.layers });
  const LAYOUTS = {
    hero: (w, h) => (w < 860 ? { cx: w / 2, cy: h * 0.5, r: Math.min(w * 0.36, h * 0.2) } : { cx: w / 2, cy: h * 0.52, r: Math.min(h * 0.235, w * 0.22) }),
    side: (w, h) => {
      if (w < 860) { // keep the whole record visible above the card
        const top = 62, bottom = Math.max(top + 150, h - cardH - 26), r = Math.min(w * 0.42, (bottom - top) / 2);
        return { cx: w / 2, cy: top + (bottom - top) / 2, r };
      }
      const avail = w * 0.91 - 470; // room left of the 440px card
      return { cx: w * 0.03 + avail / 2, cy: h * 0.52, r: Math.min(h * 0.42, avail * 0.485) };
    },
  };
  const W = '#ffffff';
  const SC = {
    hero: { layout: 'hero', bpm: 136, bar: [1, 1, 1, 1], center: (b) => [Math.round(b), 'BPM'] },
    heard: { layout: 'side', bpm: 136, bar: [1, 1, 1, 1], center: () => ['LISTEN', 'FOR THE DRUMS'] },
    origin: { layout: 'side', bpm: 136, bar: [1, 1, 1, 1], center: () => ['1:26', 'THE BREAK'] },
    funk: { layout: 'side', bpm: 136, bar: [1, 1, 0.28, 0.28], center: () => ['BARS', '1 + 2'] },
    late: { layout: 'side', bpm: 136, bar: [0.25, 0.25, 1, 0.4], center: () => ['BAR', '3'], hl: [{ s: 46, v: 'snare', color: W }], ghosts: [{ s: 44, v: 'snare' }] },
    missing: { layout: 'side', bpm: 136, bar: [0.2, 0.2, 0.35, 1], center: () => ['BAR', '4'],
      hl: [{ s: 49, v: 'ghost', color: W }, { s: 50, v: 'kick', color: W }, { s: 51, v: 'kick', color: W }, { s: 58, v: 'crash', color: W }],
      ghosts: [{ s: 48, v: 'kick' }, { s: 60, v: 'snare' }] },
    djs: { layout: 'side', bpm: 96, bar: [1, 1, 1, 1], center: (b) => [Math.round(b), 'BPM · SLOWED'] },
    escape: { layout: 'side', bpm: 104, bar: [1, 1, 1, 1], center: (b) => [Math.round(b), 'BPM · 1988'] },
    jungle: { layout: 'side', bpm: 168, bar: [1, 1, 1, 1], center: (b) => [Math.round(b), 'BPM · SPED UP'] },
  };
  let scene = 'hero', ab = 'real', storyBpm = 136, cardH = 300;

  function applyScene(name) {
    scene = name; const sc = SC[name];
    const card = document.querySelector('.step[data-scene="' + name + '"] .card'); if (card) cardH = card.offsetHeight;
    wheel.setLayout(LAYOUTS[sc.layout]);
    const abScene = name === 'late' || name === 'missing';
    if (!abScene && ab !== 'real') { ab = 'real'; paintAB(); }
    const exp = abScene && ab === 'exp';
    Amen.T.expected = exp; wheel.s.expected = exp;
    if (name !== 'funk') { Amen.setLayers(ALL); paintLayers(); }
    wheel.s.barAlpha = sc.bar; wheel.s.hl = exp ? [] : sc.hl || []; wheel.s.ghosts = exp ? [] : sc.ghosts || [];
  }
  const sceneIO = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) applyScene(e.target.dataset.scene); }), { rootMargin: '-45% 0px -45% 0px' });
  $$('.step[data-scene]').forEach((s) => sceneIO.observe(s));
  new IntersectionObserver((es) => { storyVisible = es[0].isIntersecting; syncTransport(); }, { threshold: 0 }).observe($('#story'));

  // layer chips
  function paintLayers() { $$('#layerChips .chip').forEach((b) => b.setAttribute('aria-pressed', !!Amen.T.layers[b.dataset.layer])); }
  $('#layerChips').addEventListener('click', (e) => {
    const b = e.target.closest('.chip'); if (!b) return; const k = b.dataset.layer;
    Amen.T.layers[k] = Amen.T.layers[k] ? 0 : 1; paintLayers();
    if (Amen.T.layers[k]) Amen.audition(k === 'crash' ? 58 : 48, 1, { allLayers: false });
  });
  // as-played vs expected
  function paintAB() { $$('.seg [data-ab]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.ab === ab)); }
  $$('.seg').forEach((seg) => seg.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ab]'); if (!b) return; ab = b.dataset.ab; paintAB(); applyScene(scene);
  }));
  // restart the loop from the top
  const breakPlaying = () => soundOn && !loopPaused && Amen.T.playing && !labPlaying;
  $$('[data-act="playBreak"]').forEach((b) => b.addEventListener('click', async () => {
    if (breakPlaying()) { setPaused(true); return; }                       // second click pauses
    loopPaused = false; paintPause(); await ensureSound(); Amen.stop(); Amen.start({ mode: 'full' });
  }));
  let breakWas = null;
  function paintBreak() {
    const on = breakPlaying(); if (on === breakWas) return; breakWas = on;
    $$('[data-act="playBreak"]').forEach((b) => { b.classList.toggle('is-playing', on); $('.bk-label', b).textContent = on ? 'Pause the break' : 'Hear the break'; });
  }

  // record-sleeve catalog line on each card: Side A = the break, Side B = its afterlife
  (function cat() {
    const steps = $$('.step[data-scene]').filter((s) => s.dataset.scene !== 'hero'), side = { djs: 1, escape: 1, jungle: 1 };
    steps.forEach((s, i) => {
      const card = $('.card', s); if (!card) return;
      const el = document.createElement('div'); el.className = 'cat';
      el.innerHTML = '<span>Side ' + (side[s.dataset.scene] ? 'B' : 'A') + '</span><span>' + String(i + 1).padStart(2, '0') + ' / ' + String(steps.length).padStart(2, '0') + '</span>';
      card.insertBefore(el, card.firstChild);
    });
  })();

  /* =============================================================== track lists + previews */
  function findTrack(key) { key = key.toLowerCase(); return TRACKS.find((t) => (t.artist + ' ' + t.title).toLowerCase().includes(key)); }
  $$('ul.tracks[data-tracks]').forEach((ul) => {
    const subs = (ul.dataset.subs || '').split('|');
    ul.innerHTML = ul.dataset.tracks.split('|').map((k, i) => { const t = findTrack(k); return t ? { t, sub: subs[i] } : null; }).filter(Boolean).map(({ t, sub }) => (
      '<li><span class="yr">' + t.year + '</span><span class="tt">' + esc(t.title) + '<span class="aa">' + esc(t.artist) + (sub ? ' \u00b7 ' + esc(sub) : '') + '</span></span>' +
      (t.itunesId ? '<button class="btn btn--sm" data-preview="' + t.itunesId + '" aria-label="Play 30-second preview of ' + esc(t.title) + ' by ' + esc(t.artist) + '"><span class="play-ico"></span><span class="pv-label">30s</span></button>'
        : '<a class="find" target="_blank" rel="noopener" href="' + apple(t) + '">find it &nearr;</a>') + '</li>'
    )).join('');
  });
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-preview]'); if (!b) return;
    if (labPlaying) stopLab();
    Amen.Preview.toggle(b.dataset.preview);
  });
  document.addEventListener('amen:preview', (e) => {
    const { id, state } = e.detail;
    $$('[data-preview="' + id + '"]').forEach((b) => {
      b.classList.toggle('is-playing', state === 'playing'); b.classList.toggle('is-loading', state === 'loading');
      const l = $('.pv-label', b); if (!l) return;
      if (!l.dataset.orig) l.dataset.orig = l.textContent;
      l.textContent = state === 'error' ? 'Unavailable' : state === 'playing' ? 'Playing…' : l.dataset.orig;
      if (state === 'error') setTimeout(() => (l.textContent = l.dataset.orig), 2200);
    });
  });

  /* =============================================================== CHOP LAB */
  const wheel2 = new Wheel($('#wheel2'), {
    onPick(s) { announce(wheel2.describe(s).text); ensureSound().then(() => { if (!labPlaying) Amen.audition(s, 2, { allLayers: true, expected: false }); }); },
  });
  wheel2.setLayout((w, h) => ({ cx: w / 2, cy: h / 2, r: Math.min(w, h) * 0.44 }));
  wheel2.set({ center: ['136', 'BPM · CHOP'] });
  const KEYS = '1234qwerasdfzxcv';
  let seq = Array.from({ length: 16 }, (_, i) => i), sel = 0, labBpm = 136, lastNowSlot = -1, lastNowPad = -1;
  const slotsEl = $('#slots'), padsEl = $('#pads'), bpmEl = $('#bpm');
  const lab = (i) => ((i >> 2) + 1) + '·' + ((i & 3) + 1);

  function glyph(i) {
    let svg = '<svg viewBox="0 0 44 34" aria-hidden="true">';
    const rowY = { ride: 12, snare: 22, kick: 31 };
    for (let k = 0; k < 4; k++) {
      const h = Amen.hits(i * 4 + k, false), x = 7 + k * 10;
      if (h.ride) svg += '<circle cx="' + x + '" cy="' + rowY.ride + '" r="1.7" fill="' + C.ride + '" opacity=".85"/>';
      if (h.crash) svg += '<circle cx="' + x + '" cy="' + rowY.ride + '" r="3.2" fill="' + C.crash + '"/>';
      if (h.snare) svg += '<circle cx="' + x + '" cy="' + rowY.snare + '" r="3.1" fill="' + C.snare + '"/>';
      if (h.ghost) svg += '<circle cx="' + x + '" cy="' + rowY.snare + '" r="1.6" fill="none" stroke="' + C.snare + '" stroke-width="1"/>';
      if (h.kick) svg += '<circle cx="' + x + '" cy="' + rowY.kick + '" r="3.4" fill="' + C.kick + '"/>';
    }
    return svg + '</svg>';
  }
  padsEl.innerHTML = Array.from({ length: 16 }, (_, i) =>
    '<button class="pad' + ((i >> 2) >= 2 ? ' twist' : '') + '" data-pad="' + i + '" aria-label="Slice bar ' + ((i >> 2) + 1) + ' beat ' + ((i & 3) + 1) + '">' +
    '<span class="pl">' + lab(i) + '</span><span class="pk">' + KEYS[i].toUpperCase() + '</span>' + glyph(i) + '</button>').join('');
  function renderSlots() {
    slotsEl.innerHTML = seq.map((p, i) => '<button class="slot' + (p >> 2 >= 2 ? ' twist' : '') + (i === sel ? ' is-sel' : '') + '" data-slot="' + i + '" aria-label="Slot ' + (i + 1) + ', slice ' + lab(p) + '"><small>' + (i + 1) + '</small>' + lab(p) + '</button>').join('');
  }
  renderSlots();
  slotsEl.addEventListener('click', (e) => { const b = e.target.closest('[data-slot]'); if (!b) return; sel = +b.dataset.slot; renderSlots(); });

  let padCount = 0;
  async function padPress(i) {
    await ensureSound();
    const was = sel; seq[sel] = i; sel = (sel + 1) % 16; renderSlots(); Amen.T.seq = seq;
    announce('Slot ' + (was + 1) + ' set to bar ' + ((i >> 2) + 1) + ', beat ' + ((i & 3) + 1));
    if (++padCount === 4) gtoast('You\u2019re re-cutting a 1969 drum break. This is how jungle was made.');
    const pad = padsEl.children[i]; pad.classList.add('is-hit'); setTimeout(() => pad.classList.remove('is-hit'), 130);
    if (!labPlaying) Amen.audition(i * 4, 4, { allLayers: true, expected: false });
  }
  padsEl.addEventListener('pointerdown', (e) => { const b = e.target.closest('[data-pad]'); if (b) { e.preventDefault(); padPress(+b.dataset.pad); } });
  padsEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { const b = e.target.closest('[data-pad]'); if (b) { e.preventDefault(); padPress(+b.dataset.pad); } } });
  document.addEventListener('keydown', (e) => {
    if (!labVisible || e.metaKey || e.ctrlKey || e.altKey || /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
    const i = KEYS.indexOf(e.key.toLowerCase()); if (i >= 0) { e.preventDefault(); padPress(i); }
  });

  function setSeq(a) { seq = a.slice(0, 16); Amen.T.seq = seq; sel = 0; renderSlots(); }
  function setLabBpm(b) { labBpm = Math.max(70, Math.min(190, b)); bpmEl.value = labBpm; $('#bpmOut').textContent = labBpm + ' BPM'; if (labPlaying) Amen.setBpm(labBpm); wheel2.s.center = [String(labBpm), 'BPM · CHOP']; }
  bpmEl.addEventListener('input', () => setLabBpm(+bpmEl.value));
  $('#tempoPresets').addEventListener('click', (e) => { const b = e.target.closest('[data-bpm]'); if (b) setLabBpm(+b.dataset.bpm); });
  $('#seqPresets').addEventListener('click', (e) => {
    const b = e.target.closest('[data-seq]'); if (!b) return; const k = b.dataset.seq;
    const R = [...Array(16).keys()];
    if (k === 'orig') setSeq(R);
    else if (k === 'loop') setSeq(R.slice(0, 8).concat(R.slice(0, 8)));
    else if (k === 'rev') setSeq(R.slice().reverse());
    else if (k === 'stut') setSeq([0, 0, 1, 1, 2, 2, 3, 3, 8, 8, 9, 9, 14, 14, 15, 15]);
    else {
      const out = [Math.random() < 0.5 ? 0 : 4];
      while (out.length < 16) { const p = out[out.length - 1]; out.push(Math.random() < 0.55 ? (p + 1) % 16 : Math.floor(Math.random() * 16)); }
      setSeq(out);
    }
    if (!labPlaying) labToggle();
  });

  async function labToggle() {
    if (labPlaying) { stopLab(); return; }
    if (!(await ensureSound())) return;
    Amen.Preview.stopAll(); labPlaying = true;
    Amen.stop(); Amen.T.layers && Amen.setLayers(ALL); Amen.T.expected = false;
    Amen.setBpm(labBpm); Amen.start({ mode: 'chop', seq, expected: false });
    paintLab();
  }
  function stopLab() {
    labPlaying = false; Amen.stop(); Amen.T.mode = 'full'; Amen.T.seq = null; wheel2.s.focus = null;
    if (storyVisible) { Amen.start({ mode: 'full' }); }
    $$('.slot.is-now').forEach((n) => n.classList.remove('is-now')); $$('.pad.is-now').forEach((n) => n.classList.remove('is-now')); lastNowSlot = lastNowPad = -1;
    paintLab();
  }
  function paintLab() { const b = $('#labPlay'); b.classList.toggle('is-playing', labPlaying); $('#labPlayLabel').textContent = labPlaying ? 'Stop' : 'Loop it'; }
  $('#labPlay').addEventListener('click', labToggle);
  new IntersectionObserver((es) => { labVisible = es[0].isIntersecting; if (!labVisible && labPlaying) stopLab(); }, { threshold: 0.12 }).observe($('#lab'));

  // share / restore
  const SHARE = { title: 'Seven Seconds: the drum break that built a genre', text: 'Four bars from 1969, borrowed by thousands of songs. Hear it, take it apart, chop your own.' };
  const siteUrl = () => location.origin + location.pathname;
  const chopUrl = () => siteUrl() + '#chop=' + seq.map((n) => n.toString(16)).join('') + '&bpm=' + labBpm;
  const chopChanged = () => seq.some((n, i) => n !== i) || labBpm !== 136;
  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); return true; } catch (e) {
      const ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (_) { /* ignore */ } ta.remove(); return ok;
    }
  }
  // a 1080x1350 picture of your chop, made on the fly
  async function chopCard() {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const W = 1080, H = 1400, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
    g.fillStyle = '#07070b'; g.fillRect(0, 0, W, H);
    const gl = g.createRadialGradient(540, 590, 60, 540, 590, 620); gl.addColorStop(0, 'rgba(255,61,127,.28)'); gl.addColorStop(1, 'rgba(255,61,127,0)'); g.fillStyle = gl; g.fillRect(0, 0, W, H);
    g.fillStyle = '#f1ece0'; g.textBaseline = 'alphabetic'; g.font = '900 118px "Big Shoulders Display", Impact, sans-serif'; g.fillText('MY AMEN CHOP', 64, 150);
    g.fillStyle = '#a9a8b5'; g.font = '500 27px "JetBrains Mono", monospace'; g.fillText(labBpm + ' BPM  ·  4 BARS FROM 1969, RE-CUT', 68, 202);
    const box = document.createElement('div'); box.style.cssText = 'position:fixed;left:-9999px;top:0;width:780px;height:780px'; const c = document.createElement('canvas'); box.appendChild(c); document.body.appendChild(box);
    const w = new Wheel(c, { interactive: false, static: true }); w.visible = true; w.lastId = 1e15;
    w.setLayout((ww, hh) => ({ cx: ww / 2, cy: hh / 2, r: Math.min(ww, hh) * 0.46 })); w.cur = Object.assign({}, w.tgt); w.set({ center: [String(labBpm), 'BPM · CHOP'] }); w.draw(performance.now());
    g.drawImage(c, 150, 230, 780, 780); box.remove();
    const cw = 112, ch = 104, gap = 10, x0 = (W - (8 * cw + 7 * gap)) / 2, y0 = 1034;
    seq.forEach((p, i) => {
      const x = x0 + (i % 8) * (cw + gap), y = y0 + Math.floor(i / 8) * (ch + gap), twist = p >> 2 >= 2;
      g.fillStyle = 'rgba(255,255,255,.07)'; g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 2; g.beginPath(); g.roundRect(x, y, cw, ch, 12); g.fill(); g.stroke();
      g.fillStyle = '#a9a8b5'; g.font = '400 18px "JetBrains Mono", monospace'; g.textAlign = 'left'; g.fillText(String(i + 1), x + 12, y + 26);
      g.fillStyle = '#f1ece0'; g.font = '700 32px "JetBrains Mono", monospace'; g.textAlign = 'center'; g.fillText(((p >> 2) + 1) + '·' + ((p & 3) + 1), x + cw / 2, y + 76);
      if (twist) { g.fillStyle = C.kick; g.beginPath(); g.arc(x + cw - 16, y + 18, 6, 0, 7); g.fill(); }
    });
    g.textAlign = 'left'; g.fillStyle = C.snare; g.font = '900 64px "Big Shoulders Display", Impact, sans-serif'; g.fillText('MAKE YOURS', 64, 1350);
    g.fillStyle = '#a9a8b5'; g.font = '500 26px "JetBrains Mono", monospace'; g.textAlign = 'right'; g.fillText(siteUrl().replace(/^https?:\/\//, ''), W - 64, 1348);
    return new Promise((res) => cv.toBlob(res, 'image/png'));
  }
  async function share(kind) {
    if (kind === 'copy') { const ok = await copyText(chopChanged() ? chopUrl() : siteUrl()); gtoast(ok ? 'Link copied' : 'Copy the link from the address bar'); return; }
    if (kind === 'site') {
      if (navigator.share) { try { await navigator.share({ title: SHARE.title, text: SHARE.text, url: siteUrl() }); } catch (e) { /* dismissed */ } return; }
      const ok = await copyText(siteUrl()); gtoast(ok ? 'Link copied. Send it to someone who’s heard these drums.' : 'Copy the link from the address bar'); return;
    }
    gtoast('Making your picture…');
    const blob = await chopCard(); if (!blob) { gtoast('Couldn’t make the picture. The link still works.'); return copyText(chopUrl()); }
    const file = new File([blob], 'my-amen-chop.png', { type: 'image/png' });
    const data = { title: 'My Amen break chop', text: 'I re-cut a 1969 drum break. Make yours:', url: chopUrl(), files: [file] };
    if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share(data); return; } catch (e) { if (e.name === 'AbortError') return; } }
    const u = URL.createObjectURL(blob), el = document.createElement('a'); el.href = u; el.download = 'my-amen-chop.png'; document.body.appendChild(el); el.click(); el.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000);
    const ok = await copyText(chopUrl()); gtoast(ok ? 'Picture saved and link copied' : 'Picture saved');
  }
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-share]'); if (b) share(b.dataset.share); });
  $('#shareTop').addEventListener('click', () => share('site'));

  // the break as text (for screen readers, and for anyone curious how it's counted)
  (function textAlt() {
    const nm = (s) => ((s >> 2) + 1) + ['', ' e', ' &', ' a'][s & 3], list = (arr) => (arr.length ? arr.map(nm).join(', ') : 'none');
    const eighths = [0, 2, 4, 6, 8, 10, 12, 14];
    let rows = '';
    Amen.BARS.forEach((b, i) => {
      const miss = eighths.filter((s) => !b.ride.includes(s));
      rows += '<tr><th scope="row">Bar ' + (i + 1) + '</th><td>' + list(b.kick.map((k) => k[0])) + '</td><td>' + list(b.snare.map((k) => k[0])) + '</td><td>' + list(b.ghost.map((k) => k[0])) + '</td><td>' +
        (miss.length ? 'every eighth note except ' + list(miss) : 'every eighth note') + '</td><td>' + list(b.crash.map((k) => k[0])) + '</td></tr>';
    });
    $('#textalt').innerHTML = '<table><caption>Where each drum lands, as beat counts</caption><thead><tr><th scope="col">Bar</th><th scope="col">Kick</th><th scope="col">Snare</th><th scope="col">Ghost snares</th><th scope="col">Ride cymbal</th><th scope="col">Open cymbal</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<p class="small">Bars 3 and 4 push the second snare from beat 4 to the &ldquo;&amp;&rdquo; of 4, and bar 4 drops the kick on beat 1. That is the whole trick.</p>';
  })();

  (function restore() {
    const m = /chop=([0-9a-f]{16})/.exec(location.hash), b = /bpm=(\d+)/.exec(location.hash);
    if (m) { setSeq(m[1].split('').map((c) => parseInt(c, 16))); if (b) setLabBpm(+b[1]); setTimeout(() => $('#lab').scrollIntoView(), 80); }
  })();

  // oscilloscope
  const scope = $('#scope'), sg = scope.getContext('2d'), sbuf = new Uint8Array(1024);
  function drawScope() {
    const dpr = Math.min(2, devicePixelRatio || 1), w = scope.clientWidth, h = scope.clientHeight;
    if (scope.width !== Math.round(w * dpr)) { scope.width = Math.round(w * dpr); scope.height = Math.round(h * dpr); }
    sg.setTransform(dpr, 0, 0, dpr, 0, 0); sg.clearRect(0, 0, w, h);
    sg.strokeStyle = 'rgba(255,255,255,.08)'; sg.beginPath(); sg.moveTo(0, h / 2); sg.lineTo(w, h / 2); sg.stroke();
    if (!Amen.scope(sbuf)) return;
    sg.lineWidth = 1.6; sg.strokeStyle = C.snare; sg.beginPath();
    for (let i = 0; i < sbuf.length; i++) { const x = (i / (sbuf.length - 1)) * w, y = h / 2 + ((sbuf[i] - 128) / 128) * (h * 0.46); i ? sg.lineTo(x, y) : sg.moveTo(x, y); }
    sg.stroke();
  }
  function updateLabHighlights() {
    const ph = Amen.playhead();
    if (!labPlaying || !ph) return;
    wheel2.s.focus = [Math.floor(ph.src / 4) * 4, 4];
    const slot = Math.floor(ph.ev.tick / 4) % 16, pad = Math.floor(ph.src / 4) % 16;
    if (slot !== lastNowSlot) { const n = slotsEl.children; if (n[lastNowSlot]) n[lastNowSlot].classList.remove('is-now'); if (n[slot]) n[slot].classList.add('is-now'); lastNowSlot = slot; }
    if (pad !== lastNowPad) { const n = padsEl.children; if (n[lastNowPad]) n[lastNowPad].classList.remove('is-now'); if (n[pad]) n[pad].classList.add('is-now'); lastNowPad = pad; }
  }

  /* =============================================================== ECHOES (radial chart synced to a scrolling list) */
  const FAM = [
    { k: 'hiphop', n: 'Hip-hop', c: C.kick }, { k: 'jungle', n: 'Jungle & D&B', c: C.snare }, { k: 'idm', n: 'IDM & breakcore', c: C.ride },
    { k: 'screen', n: 'Screen & game', c: C.crash }, { k: 'pop', n: 'Pop & rock', c: '#b794ff' }, { k: 'bass', n: 'Club & bass', c: '#4dffb5' },
  ];
  const famOf = (k) => FAM.find((f) => f.k === k);
  const Y0 = 1986, Y1 = 2026, CX = 500, CY = 500, R0 = 118, RA = 190, RB = 360;
  const rOf = (y) => RA + ((y - Y0) / (Y1 - Y0)) * (RB - RA);
  const pt = (r, deg) => { const a = ((deg - 90) * Math.PI) / 180; return [CX + r * Math.cos(a), CY + r * Math.sin(a)]; };
  const order = TRACKS.slice().sort((a, b) => a.year - b.year || a.title.localeCompare(b.title));
  $('#nTracks').textContent = order.length;
  const svg = $('#echo'), stageEl = $('#echoStage'), listEl = $('#echoList');
  let dots = [], rows = [], activeIdx = -1, filter = null, echoVisible = false, echoDirty = true, lockUntil = 0, sweepEl = null, sweepR = R0, sweepT = R0, tour = null;
  const pingFreq = (d) => [196, 262, 330, 392, 440, 110][FAM.indexOf(d.f)] * (1 + (d.t.year - Y0) / 70);

  function buildEcho() {
    let s = '';
    FAM.forEach((f, i) => {
      const [x0, y0] = pt(R0, i * 60), [x1, y1] = pt(RB + 28, i * 60);
      s += '<line x1="' + x0 + '" y1="' + y0 + '" x2="' + x1 + '" y2="' + y1 + '" stroke="rgba(255,255,255,.07)"/>';
      const mid = i * 60 + 30, lower = mid > 90 && mid < 270, r = lower ? 438 : 416;
      const [a0x, a0y] = pt(r, i * 60 + 6), [a1x, a1y] = pt(r, (i + 1) * 60 - 6);
      const d = lower ? 'M' + a1x + ' ' + a1y + ' A' + r + ' ' + r + ' 0 0 0 ' + a0x + ' ' + a0y : 'M' + a0x + ' ' + a0y + ' A' + r + ' ' + r + ' 0 0 1 ' + a1x + ' ' + a1y;
      s += '<path id="sp' + i + '" d="' + d + '" fill="none"/><text class="sect-label" fill="' + f.c + '"><textPath href="#sp' + i + '" startOffset="50%" text-anchor="middle">' + esc(f.n) + '</textPath></text>';
    });
    [1990, 2000, 2010, 2020].forEach((y) => {
      s += '<circle cx="' + CX + '" cy="' + CY + '" r="' + rOf(y) + '" fill="none" stroke="rgba(255,255,255,.12)" stroke-dasharray="3 7"/><text class="ring-label" x="' + CX + '" y="' + (CY - rOf(y) - 6) + '" text-anchor="middle">' + y + '</text>';
    });
    s += '<circle cx="' + CX + '" cy="' + CY + '" r="' + rOf(2026) + '" fill="none" stroke="rgba(255,255,255,.18)"/>';
    for (let i = 0; i < 3; i++) s += '<circle class="pulse" cx="' + CX + '" cy="' + CY + '" r="' + R0 + '" style="animation-delay:' + (-i * 1.67) + 's"/>';
    s += '<circle cx="' + CX + '" cy="' + CY + '" r="' + R0 + '" fill="#0d0d14" stroke="rgba(255,255,255,.25)"/>';
    s += '<text x="' + CX + '" y="' + (CY + 14) + '" text-anchor="middle" fill="#f1ece0" style="font:900 62px \'Big Shoulders Display\',Impact,sans-serif">1969</text>';
    s += '<text x="' + CX + '" y="' + (CY + 40) + '" text-anchor="middle" fill="#8b8a96" style="font:500 12px \'JetBrains Mono\',monospace;letter-spacing:.16em">AMEN, BROTHER</text>';
    s += '<path id="gap" d="M' + (CX - 154) + ' ' + CY + ' A154 154 0 0 1 ' + (CX + 154) + ' ' + CY + '" fill="none"/><text fill="#6e6d79" style="font:500 13px \'JetBrains Mono\',monospace;letter-spacing:.2em"><textPath href="#gap" startOffset="50%" text-anchor="middle">17 YEARS OF SILENCE</textPath></text>';
    s += '<circle class="sweep" id="sweep" cx="' + CX + '" cy="' + CY + '" r="' + R0 + '" stroke="#fff"/>';
    dots = [];
    const count = {};
    order.forEach((t) => {
      const fi = FAM.findIndex((f) => f.k === t.bucket), n = (count[t.bucket] = (count[t.bucket] || 0) + 1) - 1;
      const jit = (((n * 0.381966) % 1) - 0.5) * 42, rj = (((n * 0.7548) % 1) - 0.5) * 16;
      const [x, y] = pt(rOf(t.year) + rj, fi * 60 + 30 + jit), f = FAM[fi];
      dots.push({ t, x, y, f });
      s += '<g class="dot is-hidden" data-id="' + t.id + '" tabindex="-1" role="button" aria-label="' + t.year + ', ' + esc(t.artist) + ': ' + esc(t.title) + '">' +
        '<circle class="halo" cx="' + x + '" cy="' + y + '" r="21" fill="' + f.c + '"/><circle class="core" cx="' + x + '" cy="' + y + '" r="10" fill="' + f.c + '"/><circle cx="' + x + '" cy="' + y + '" r="24" fill="transparent"/></g>';
    });
    svg.innerHTML = s; sweepEl = $('#sweep');
    dots.forEach((d) => (d.el = svg.querySelector('[data-id="' + d.t.id + '"]')));
  }
  function buildList() {
    listEl.innerHTML = order.map((t, i) => {
      const f = famOf(t.bucket);
      return '<li class="erow" data-i="' + i + '" data-f="' + t.bucket + '" style="--c:' + f.c + '"><span class="ey">' + t.year + '</span><span class="et"><b>' + esc(t.title) + '</b><em>' + esc(t.artist) + '</em></span>' +
        '<button class="btn btn--sm" data-preview="' + t.itunesId + '" aria-label="Preview ' + esc(t.title) + '"><span class="play-ico"></span><span class="pv-label">30s</span></button>' +
        '<div class="ex"><span class="badge" style="--c:' + f.c + '">' + esc(f.n) + '</span>' + (t.previewNote ? '<span>Preview: ' + esc(t.previewNote.toLowerCase()) + '</span>' : '') +
        '<a target="_blank" rel="noopener" href="' + apple(t) + '">Apple Music &nearr;</a><a target="_blank" rel="noopener" href="' + youtube(t) + '">YouTube &nearr;</a>' +
        (t.mbid ? '<a target="_blank" rel="noopener" href="https://musicbrainz.org/recording/' + t.mbid + '">MusicBrainz &nearr;</a>' : '<a target="_blank" rel="noopener" href="https://en.wikipedia.org/wiki/' + encodeURIComponent((t.wiki || 'Amen break').replace(/ /g, '_')) + '">Wikipedia &nearr;</a>') + '</div></li>';
    }).join('');
    rows = $$('.erow', listEl);
  }
  const refY = () => (innerWidth >= 860 ? innerHeight * 0.5 : stageEl.getBoundingClientRect().bottom + 70);
  function paintEcho() {
    dots.forEach((d, k) => {
      d.el.classList.toggle('is-hidden', k > activeIdx); d.el.classList.toggle('is-sel', k === activeIdx);
      d.el.classList.toggle('is-dim', !!filter && d.t.bucket !== filter);
    });
    rows.forEach((r, k) => { r.classList.toggle('is-active', k === activeIdx); r.classList.toggle('is-past', k < activeIdx); r.setAttribute('aria-current', k === activeIdx ? 'true' : 'false'); });
    const t = order[activeIdx];
    sweepT = t ? rOf(t.year) : R0; sweepEl.setAttribute('stroke', t ? famOf(t.bucket).c : '#fff');
    $('#yearBig').textContent = t ? t.year : 1969;
    $('#countRead').textContent = (activeIdx + 1) + ' of ' + order.length;
  }
  let announceT = 0;
  function setActive(i, quiet) {
    if (i === activeIdx) return; activeIdx = i; paintEcho();
    if (!quiet && i >= 0) Amen.ping(pingFreq(dots[i]), 0, 0.18, 0.045);
    clearTimeout(announceT); announceT = setTimeout(() => { const t = order[activeIdx]; if (t) announce('Now at ' + t.year + ': ' + t.title + ' by ' + t.artist + '. ' + (activeIdx + 1) + ' of ' + order.length + '.'); }, 900);
  }
  function detect() {
    const y = refY(); let best = -1, bd = 1e9, first = -1;
    for (let k = 0; k < rows.length; k++) {
      if (rows[k].hidden) continue; if (first < 0) first = k;
      const b = rows[k].getBoundingClientRect(), d = Math.abs(b.top + b.height / 2 - y);
      if (d < bd) { bd = d; best = k; }
    }
    if (best < 0) return setActive(-1);
    const fb = rows[first].getBoundingClientRect();
    if (first === best && fb.top + fb.height / 2 - y > innerHeight * 0.3) return setActive(-1);   // haven't reached the first track yet
    if (activeIdx >= 0 && !rows[activeIdx].hidden && best !== activeIdx) {                            // hysteresis: the active row grows
      const cb = rows[activeIdx].getBoundingClientRect(); if (bd > Math.abs(cb.top + cb.height / 2 - y) - 26) return;
    }
    setActive(best);
  }
  function jumpTo(k) {
    if (k < 0 || !rows[k] || rows[k].hidden) return;
    lockUntil = performance.now() + 900; setActive(k, true);
    const b = rows[k].getBoundingClientRect(); scrollBy({ top: b.top + b.height / 2 - refY(), behavior: reduce ? 'auto' : 'smooth' });
  }
  function toSvg(e) { const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); }
  svg.addEventListener('pointerdown', (e) => {
    const p = toSvg(e); let best = -1, bd = 56;
    dots.forEach((d, k) => { if (d.el.classList.contains('is-hidden') || d.el.classList.contains('is-dim')) return; const dd = Math.hypot(d.x - p.x, d.y - p.y); if (dd < bd) { bd = dd; best = k; } });
    if (best >= 0) { stopTour(); jumpTo(best); }
  });
  $('#filters').innerHTML = FAM.map((f) => '<button class="chip" data-f="' + f.k + '" aria-pressed="true"><i style="--c:' + f.c + '"></i>' + esc(f.n) + '<em>' + order.filter((t) => t.bucket === f.k).length + '</em></button>').join('');
  $('#filters').addEventListener('click', (e) => {
    const b = e.target.closest('[data-f]'); if (!b) return; filter = filter === b.dataset.f ? null : b.dataset.f;
    $$('#filters .chip').forEach((x) => x.setAttribute('aria-pressed', !filter || x.dataset.f === filter));
    rows.forEach((r) => (r.hidden = !!filter && r.dataset.f !== filter)); paintEcho(); echoDirty = true;
  });

  // playback <-> chart: whatever preview is playing lights up its dot and row
  document.addEventListener('amen:preview', (e) => {
    const { id, state } = e.detail, k = order.findIndex((t) => String(t.itunesId) === id); if (k < 0) return;
    const on = state === 'playing'; dots[k].el.classList.toggle('is-playing', on); rows[k].classList.toggle('is-playing', on);
    if (on && echoVisible && !tour && k !== activeIdx) jumpTo(k);
  });
  // "play along": walk the list, ~10 seconds of each preview
  const TOUR_MS = 10000;
  function paintTour() { const b = $('#tour'); b.classList.toggle('is-playing', !!tour); $('#tourLabel').textContent = tour ? 'Stop' : 'Play along'; }
  function stepTour() {
    if (!tour) return;
    let k = tour.i; while (k < rows.length && rows[k].hidden) k++;
    if (k >= rows.length) return stopTour();
    tour.i = k; jumpTo(k);
    const id = String(order[k].itunesId); if (Amen.Preview.current !== id) Amen.Preview.toggle(id);
    tour.t = setTimeout(() => { Amen.Preview.stopAll(); if (tour) { tour.i = k + 1; stepTour(); } }, TOUR_MS);
  }
  function stopTour() { if (!tour) return; clearTimeout(tour.t); tour = null; Amen.Preview.stopAll(); paintTour(); }
  $('#tour').addEventListener('click', () => { if (tour) return stopTour(); if (labPlaying) stopLab(); tour = { i: Math.max(0, activeIdx), t: null }; paintTour(); stepTour(); });
  ['wheel', 'touchmove'].forEach((ev) => addEventListener(ev, () => { if (tour && performance.now() > lockUntil) stopTour(); }, { passive: true }));

  buildEcho(); buildList(); paintEcho();
  listEl.addEventListener('focusin', (e) => { const r = e.target.closest('.erow'); if (r) { lockUntil = performance.now() + 700; setActive(+r.dataset.i, true); } });
  new IntersectionObserver((es) => { echoVisible = es[0].isIntersecting; if (!echoVisible) stopTour(); else echoDirty = true; }, { threshold: 0 }).observe($('#echoScrolly'));
  addEventListener('scroll', () => { echoDirty = true; }, { passive: true }); addEventListener('resize', () => { echoDirty = true; });

  /* =============================================================== frame loop */
  const progress = $('#progress'), stage = $('#stage');
  function onScroll() { const h = document.documentElement.scrollHeight - innerHeight; progress.style.setProperty('--p', h > 0 ? Math.min(1, scrollY / h).toFixed(4) : 0); }
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  function frame(t) {
    if (!labPlaying) {
      const target = SC[scene].bpm; storyBpm += (target - storyBpm) * (reduce ? 1 : 0.035);
      if (Math.abs(target - storyBpm) < 0.05) storyBpm = target;
      Amen.setBpm(storyBpm);
    }
    wheel.s.center = SC[scene].center(storyBpm);
    paintBreak(); wheel.draw(t);
    if (storyVisible && wheel.cur) {
      document.documentElement.style.setProperty('--pulse', reduce ? 0 : wheel.kickPulse.toFixed(3));
      stage.style.setProperty('--gx', wheel.cur.cx + 'px'); stage.style.setProperty('--gy', wheel.cur.cy + 'px');
    }
    if (echoVisible) {
      if (echoDirty && performance.now() > lockUntil) { echoDirty = false; detect(); }
      sweepR += (sweepT - sweepR) * (reduce ? 1 : 0.12); sweepEl.setAttribute('r', sweepR.toFixed(1));
    }
    if (labVisible) { updateLabHighlights(); wheel2.draw(t); drawScope(); if (!storyVisible) document.documentElement.style.setProperty('--pulse', wheel2.kickPulse.toFixed(3)); }
    requestAnimationFrame(frame);
  }
  applyScene('hero'); paintSound(); paintLab(); setLabBpm(labBpm);
  paintPause(); if (!loopPaused) Amen.start({ mode: 'full' }); // silent, visual-only until the listener opts in
  requestAnimationFrame(frame);
  // let fonts settle, then redraw canvases at the right size
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { wheel.resize(); wheel2.resize(); });
  window.__amen = { wheel, wheel2, applyScene, chopCard, share, get seq() { return seq; } }; // handy for debugging in the console
})();
