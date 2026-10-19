// 紹介動画（トレーラー）を作る。使い方: node tools/dev/trailer.mjs [出力.mp4]
//   game/ で python3 -m http.server 8080 を動かしておく。BGM は render-bgm.mjs の出力（BGM_DIR、既定 /tmp/wedge-dev/bgm）を使う
//   STILLS=1 なら動画を作らず、場面ごとの代表の 1 枚だけ撮る（確認用）
// 流れ：物語のあらすじ → 操作の手ざわり（斬る・かわす・時を止める・強化）→ 難易度 → 最後に待ち受けるもの → 題字
// 文字（テロップ）は 1 文字ずつ出し、1 文字ごとに同じ高さの電子音を鳴らす。
// 映像はゲームを 1 tick ずつ手で進めて 1 枚ずつ撮る（かくつかない）。戦いは「見せる」ボット（trailer-bot.mjs）が操作し、
// 種（シード）を変えて何度か試し、いちばん見栄えのよい区間を選んで撮る。効果音はゲームが鳴らした音を記録して、あとでまとめて合成する。
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';

const OUT = process.argv[2] || new URL('../../store/trailer.mp4', import.meta.url).pathname;
const BGM = process.env.BGM_DIR || '/tmp/wedge-dev/bgm';
const STILLS = !!process.env.STILLS;
const TMP = (process.env.TMPDIR || '/tmp') + '/wedge-trailer/';
const FPS = 30, W = 1920, H = 1080;

// ───────── 場面の台本 ─────────
const BOONS = "[{id:'edge',tier:2},{id:'orbit',tier:2},{id:'crit',tier:2},{id:'satellites',tier:1}]";
const BUILD = "[{id:'edge',tier:2},{id:'orbit',tier:2},{id:'crit',tier:2},{id:'satellites',tier:2},{id:'starfall',tier:2}]";
// 見栄えの点数（区間の中の効果音の数から）
const sc = {
  fight: (c) => c.kill * 5 + c.hit * 1 + c.heavyHit * 2 + c.perfect * 4 - c.hurt * 25,
  dodge: (c, first) => c.perfect * 12 + c.hit + c.kill * 3 - c.hurt * 30 + (first >= 40 && first <= 110 ? 40 : -40),
  art: (c, first) => c.kill * 6 + c.hit - c.hurt * 30 + (first >= 15 && first <= 75 ? 60 : -100),
  easy: (c) => c.kill * 5 + c.hit - c.hurt * 40,
  boss: (c) => c.perfect * 10 + c.hit * 2 + c.heavyHit * 3 + c.tellBig * 3 - c.hurt * 25,
  white: (c) => c.perfect * 8 + c.tellBig * 6 + c.bossBell * 8 + c.heavySwing * 4 + c.hit - c.hurt * 10,
};
const S = []; // 台本
const card = (dur, text, o = {}) => S.push({ kind: 'card', dur, telop: text && { text, at: o.at ?? 0.4, cps: o.cps ?? 13, style: o.style || 'card', out: o.out }, cues: o.cues || [], ladder: o.ladder, end: o.end, act: o.act });
const foot = (dur, setup, o = {}) => S.push({ kind: 'foot', dur, setup, pick: o.pick, seeds: o.seeds || [1], tpf: o.tpf || 2, skip: o.skip || 0, simSec: o.simSec || 16, telop: o.telop && { at: 0.3, cps: 16, style: 'low', ...o.telop }, cues: o.cues || [], fadeIn: o.fadeIn, flashIn: o.flashIn, fadeOut: o.fadeOut, bars: o.bars ?? true, act: o.act, zoom: o.zoom || 1 });

// 第 1 幕：物語
card(4.2, '鐘が鳴るたび、\n夜は、はじめに巻き戻る。', { at: 0.6, cues: [[0.15, 'bossBell']], act: 'story' });
foot(4.6, "__prep({ level: 3 }); __room('entry'); B.opts = { walk: 'right' }; B.on = true;", { fadeIn: 0.6, telop: { text: '時計塔の町は、同じ夜をくり返している。', at: 0.5 } });
foot(3.0, "__prep({}); g.endRun('bell'); g.cinema = 'clock';", { bars: false, cues: [[0, 'rewind']], fadeIn: 0.25 });
card(4.6, 'それを覚えているのは、\n師から「時の楔」を習った、あなただけ。', { at: 0.3 });
foot(5.2, "__prep({ level: 9 }); __room('boss'); g.comp = null; const b = g.room.boss; g.player.x = b.x - 230; g.player.face = 1; B.each = () => { b.cool = 9; if (b.state !== 'intro') b.state = 'idle'; b.facePlayer && b.facePlayer(g.player); };", { fadeIn: 0.4, zoom: 1.15, telop: { text: '時を戻す鐘は、禁忌の技。\n鳴らすたび、師の命は削られていく。', at: 0.4, cps: 14 } });
card(3.4, '師を止め、夜明けを迎えるために――', { at: 0.3, cps: 12 });
// 第 2 幕：手ざわり
foot(3.4, `__prep({ level: 9, boons: ${BOONS} }); __roomN('combat'); B.on = true;`, { pick: 'fight', zoom: 1.45, seeds: [1, 2, 3, 4, 5, 6, 7, 8], telop: { text: '斬る。', style: 'big', at: 0.15, cps: 20 }, act: 'action' });
foot(3.6, `__prep({ level: 9, boons: ${BOONS} }); __room('elite'); g.reflex = true; B.on = true;`, { pick: 'dodge', zoom: 1.5, seeds: [1, 2, 3, 4, 5, 6], telop: { text: 'かわす。', style: 'big', at: 0.15, cps: 20 } });
foot(3.6, "__prep({ level: 9, boons: [{id:'edge',tier:2},{id:'crit',tier:2},{id:'orbit',tier:1}] }); __roomN('combat'); g.player.gauge = 100; B.opts = { artMin: 3 }; B.on = true; g.reflex = true;", { pick: 'art', zoom: 1.3, seeds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], telop: { text: '時を、止める。', style: 'big', at: 0.15, cps: 20 } });
foot(1.3, `__prep({ level: 6, boons: ${BOONS} }); __room('combat', 2); g.openBoonPick(1, null); g.modal.t = 0;`, { bars: false, telop: { text: '100 種類を超える強化。', at: 0.1, cps: 22 } });
foot(3.4, `__prep({ level: 11, boons: ${BUILD} }); __roomN('combat'); g.reflex = true; B.on = true;`, { pick: 'fight', zoom: 1.35, seeds: [11, 12, 13, 14, 15, 16], telop: { text: '100 種類を超える強化。\n組み合わせで、戦い方は無限に。', at: 0, cps: 22, pre: [...'100 種類を超える強化。'].length } });
// 第 3 幕：難易度
foot(3.2, `__prep({ level: 4, diff: 'veryeasy', boons: [{id:'edge',tier:1}] }); __roomN('combat'); B.on = true;`, { pick: 'easy', zoom: 1.4, seeds: [1, 2, 3, 4, 5, 6], telop: { text: 'はじめての人も――', at: 0.3 }, act: 'difficulty' });
foot(3.6, `__prep({ level: 12, diff: 'nightmare', boons: ${BOONS}, upg: { atk: 12, hp: 12 } }); __room('boss'); g.reflex = true; B.on = true;`, { pick: 'boss', zoom: 1.3, seeds: [1, 2, 3, 4, 5, 6], simSec: 24, telop: { text: '腕に覚えのある人も。', at: 0.3 } });
card(4.2, '5 段階の難易度で、最後まで。', { at: 1.7, cps: 16, ladder: true });
foot(4.2, "__prep({ level: 5 }); g.player.hp = 0; g.player.state = 'dead'; g.run.deathT = 1.6; g.endRun('death');", { bars: false, skip: 12, cues: [[0, 'rewind']], telop: { text: '倒れても、知ったことは次の夜へ。', at: 1.4 }, fadeOut: 0.5 });
// 第 4 幕：最後に待ち受けるもの
card(4.6, 'そして――\n最後に待ち受けるのは。', { at: 0.5, cps: 9, cues: [[0.2, 'tick'], [1.2, 'tick'], [2.2, 'tick'], [3.2, 'tick'], [4.2, 'tick']], act: 'climax' });
const WHITE = "__prep({ level: 12, upg: { atk: 14, hp: 14 }, boons: " + BOONS + ", duel: true }); __room('boss'); g.beginFinalForm(g.room.boss); g.room.boss.hp = g.room.boss.maxHp; g.reflex = true; B.on = true;";
for (let i = 0; i < 3; i++) foot(0.8, WHITE, { pick: 'white', zoom: 1.3, white: i, seeds: [3], simSec: 30, flashIn: 0.7, bars: true });
card(1.0, '', {});
card(3.0, '夜明けは、来るのか。', { at: 0.3, cps: 10 });
foot(6.0, "g.newGame(3); g.scene = 'title'; g.modal = null; g.cinema = 'logo';", { bars: false, fadeIn: 1.2, cues: [[0.05, 'bossBell']], end: true, act: 'title' });
S[S.length - 1].end = true;

// ───────── ページの中で使う道具 ─────────
const PAGE = `(async () => {
  const { showInputs, installReflex } = await import('/tools/dev/trailer-bot.mjs');
  const { DIFFICULTY } = await import('/src/config.js');
  const { addWedge, learn } = await import('/src/meta.js');
  const { readyFusions } = await import('/src/boons.js');
  const g = window.__game, input = window.__input, step = input.step.bind(input);
  window.__setManual(true);
  const B = window.B = { on: false, st: {}, opts: {}, each: null, tick: 0, log: [] };
  // 種つきの乱数（ゲームの中の Math.random だけ差し替える。描画の乱数はそのまま）
  let seedState = 1;
  const sim = () => { seedState |= 0; seedState = seedState + 0x6D2B79F5 | 0; let t = Math.imul(seedState ^ seedState >>> 15, 1 | seedState); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const tick = g.tick.bind(g), R = Math.random;
  // 戦いの撮影中は、レベルアップの選択などの画面を開かない（開いたらすぐ閉じる）
  g.tick = (inp) => { Math.random = sim; try { if (B.each) B.each(g); tick(inp); if (B.on && g.scene === 'play' && g.modal) g.modal = null; } finally { Math.random = R; } B.tick++; };
  input.step = () => {
    if (B.on && g.scene === 'play' && !g.modal) { const held = showInputs(g, B.st, B.opts); for (const a of Object.keys(input.raw)) input.set(a, held.includes(a)); }
    else for (const a of Object.keys(input.raw)) input.set(a, false);
    step();
  };
  // 鳴った効果音を記録する（見栄えの点数と、あとで合成する音に使う）
  const play = g.sfx.play.bind(g.sfx);
  g.sfx.play = (name) => { B.log.push([B.tick, name]); return play(name); };
  const dp = g.damagePlayer.bind(g);
  g.damagePlayer = (dmg, o = {}) => { if (g.player.state !== 'dead') B.log.push([B.tick, 'hurtX']); return dp(dmg, o); };
  window.__prep = (o = {}) => {
    g.newGame(o.seed || B.seed || 11); g.modal = null;
    g.meta.difficulty = o.diff || 'normal'; g.meta.loop = o.loop || 2; g.meta.slots = 3;
    g.settings.difficulty = g.meta.difficulty;
    Object.assign(g.meta.upgrades, o.upg || { atk: 6, hp: 6 });
    if (o.duel) { g.meta.loop = 3; addWedge(g.meta, { target: 'lira' }); addWedge(g.meta, { target: 'brake' }); learn(g.meta, 'lira_message'); learn(g.meta, 'master_reason'); }
    g.startLoop(); g.modal = null;
    if (o.boons) g.player.setBoons([...g.player.boons, ...o.boons]);
    g.run.fusionDeclined = readyFusions(g.player.boons).map((f) => f.to); // 合成の確認の画面を出さない
    if (o.level) { g.run.level = o.level; g.player.baseMaxHp += 6 * (o.level - 1); g.player.setBoons(g.player.boons); g.player.hp = g.player.maxHp; }
    installReflex(g); g.reflex = false; g.cinema = true; g.settings.calmFlash = true; // 画面全体の白い光は弱く
  };
  const enter = (fi, ri) => { g.enterRoom(fi, ri); g.modal = null; g.fx.banner = null; g.nightNote = null; };
  window.__room = (type, n = 0) => { const fl = g.run.plan.floors; let k = 0; for (let fi = 0; fi < fl.length; fi++) for (let ri = 0; ri < fl[fi].length; ri++) if (fl[fi][ri].type === type && k++ === n) return enter(fi, ri); };
  // 種ごとに違う戦闘部屋（場所も敵も変わる）
  window.__roomN = (type) => { const fl = g.run.plan.floors, all = []; for (let fi = 0; fi < fl.length; fi++) for (let ri = 0; ri < fl[fi].length; ri++) if (fl[fi][ri].type === type) all.push([fi, ri]); const [fi, ri] = all[B.seed % all.length]; enter(fi, ri); };
  window.__begin = (setup, seed) => {
    B.on = false; B.st = {}; B.opts = {}; B.each = null; B.tick = 0; B.log = []; B.seed = seed; seedState = seed * 7919;
    g.cinema = false; g.reflex = false; g.titleSettings = null;
    Math.random = sim; try { eval(setup); } finally { Math.random = R; }
    g.fx.banner = null; g.nightNote = null; B.log = []; B.tick = 0;
  };
  window.__sim = (n) => { for (let i = 0; i < n; i++) { input.step(); g.tick(input); if (g.modal && g.scene === 'play' && B.on) g.modal = null; g.fx.banner = null; } return B.log; };
  // 寄り：主人公を中心に画面を拡大する（なめらかに追う）。z=1 なら元のまま
  let zx = 0.5, zy = 0.6;
  window.__zoom = (z, snap) => {
    const cv = document.querySelector('canvas');
    if (!cv) return;
    if (z <= 1 || g.scene !== 'play' || !g.player) { cv.style.transform = ''; return; }
    const p = g.player, sx = ((p.x + p.w / 2) / 2 - Math.round(g.cam.x / 2)) * 3 / 960, sy = ((p.y + p.h / 2) / 2 - Math.round(g.cam.y / 2)) * 3 / 540;
    const k = snap ? 1 : 0.12; zx += (sx - zx) * k; zy += (Math.min(0.75, sy) - zy) * k;
    cv.style.transformOrigin = (zx * 100).toFixed(2) + '% ' + (zy * 100).toFixed(2) + '%'; cv.style.transform = 'scale(' + z + ')';
  };
  window.__shotState = () => ({ x: g.player ? Math.round(g.player.x) : 0, hp: g.player ? Math.round(g.player.hp) : 0 });
  // 重ねる層（テロップ・黒い札・白い光・暗転・映画の帯）
  const css = document.createElement('style');
  css.textContent = \`
    #tr { position: fixed; inset: 0; pointer-events: none; z-index: 99; font-family: 'DotGothic16', monospace; }
    #tr > div { position: absolute; inset: 0; }
    #tr .bars::before, #tr .bars::after { content: ''; position: absolute; left: 0; right: 0; height: 64px; background: #000; }
    #tr .bars::before { top: 0 } #tr .bars::after { bottom: 0 }
    #tr .card { background: #000; }
    #tr .tl { display: flex; align-items: center; justify-content: center; text-align: center; white-space: pre; }
    #tr .tl.card { color: #f3e7cf; font-size: 60px; line-height: 1.9; letter-spacing: 0.08em; text-shadow: 0 0 22px rgba(255, 205, 130, 0.35); background: none; }
    #tr .tl.low { align-items: flex-end; padding-bottom: 120px; color: #fff; font-size: 52px; line-height: 1.6; letter-spacing: 0.06em;
      text-shadow: 0 0 6px #000, 0 0 3px #000, 3px 3px 0 #000, -3px 3px 0 #000, 3px -3px 0 #000, -3px -3px 0 #000;
      background: linear-gradient(to top, rgba(0,0,0,0.72) 0, rgba(0,0,0,0.45) 260px, rgba(0,0,0,0) 420px); }
    #tr .tl.big { align-items: flex-start; padding-top: 150px; color: #fff8e6; font-size: 150px; letter-spacing: 0.12em; text-shadow: 0 0 30px rgba(255, 200, 110, 0.9), 0 0 6px #000, 5px 5px 0 #000, -5px 5px 0 #000, 5px -5px 0 #000, -5px -5px 0 #000; }
    #tr .ladder { display: flex; align-items: center; justify-content: center; gap: 46px; padding-bottom: 170px; font-size: 54px; }
    #tr .ladder span { transition: none; }
    #tr .end { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; padding-bottom: 92px; color: #f3e7cf; }
    #tr .end b { font-weight: normal; font-size: 46px; letter-spacing: 0.4em; text-shadow: 0 0 18px rgba(255, 205, 130, 0.6); }
    #tr .end i { font-style: normal; font-size: 22px; letter-spacing: 0.5em; color: #c9a052; margin-top: 14px; }
  \`;
  document.head.appendChild(css);
  const root = document.createElement('div'); root.id = 'tr'; document.body.appendChild(root);
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const DIFF = ['veryeasy', 'easy', 'normal', 'hard', 'nightmare'].map((id) => ({ id, name: DIFFICULTY[id].name, color: DIFFICULTY[id].color }));
  window.__ov = (o) => {
    let h = '';
    if (o.bars) h += '<div class="bars"></div>';
    if (o.card) h += '<div class="card"></div>';
    if (o.ladder != null) h += '<div class="ladder">' + DIFF.map((d, i) => '<span style="color:' + (i < o.ladder ? d.color : '#2a2630') + ';text-shadow:' + (i < o.ladder ? '0 0 18px ' + d.color : 'none') + '">' + esc(d.name) + '</span>').join('') + '</div>';
    if (o.telop) { const t = o.telop; const shown = [...t.text].slice(0, t.n).join(''), rest = [...t.text].slice(t.n).join('');
      h += '<div class="tl ' + t.style + '" style="opacity:' + (t.a ?? 1) + (t.scale ? ';transform:scale(' + t.scale + ')' : '') + '"><span>' + esc(shown) + '<span style="visibility:hidden">' + esc(rest) + '</span></span></div>'; }
    if (o.end) h += '<div class="end" style="opacity:' + o.end + '"><b>近日公開</b><i>COMING SOON</i></div>';
    if (o.flash) h += '<div style="background:#fff;opacity:' + o.flash + '"></div>';
    if (o.fade) h += '<div style="background:#000;opacity:' + o.fade + '"></div>';
    root.innerHTML = h;
  };
  // 効果音と文字の音をまとめて合成（オフライン）し、WAV（base64）で返す
  window.__renderAudio = async (events, dur) => {
    const { Sfx } = await import('/src/audio.js');
    const rate = 44100, off = new OfflineAudioContext(1, Math.ceil(rate * dur), rate);
    let now = 0;
    const ctx = new Proxy(off, { get: (t, k) => (k === 'currentTime' ? now : k === 'state' ? 'running' : typeof t[k] === 'function' ? t[k].bind(t) : t[k]) });
    const s = new Sfx(); s.ctx = ctx;
    s.master = off.createGain(); s.master.gain.value = 0.6;
    s.hicut = off.createBiquadFilter(); s.hicut.type = 'lowpass'; s.hicut.frequency.value = 7000; s.hicut.Q.value = 0.5;
    s.master.connect(s.hicut); s.hicut.connect(off.destination);
    const len = rate * 0.5; s.noise = off.createBuffer(1, len, rate); const nd = s.noise.getChannelData(0); for (let i = 0; i < len; i++) nd[i] = Math.random() * 2 - 1;
    // 文字の音：同じ高さの短い電子音（矩形波＋少しだけ三角波、角を丸める）
    const blipBus = off.createBiquadFilter(); blipBus.type = 'lowpass'; blipBus.frequency.value = 3600; blipBus.connect(off.destination);
    const blip = (t) => { for (const [type, gain] of [['square', 0.05], ['triangle', 0.08]]) { const o = off.createOscillator(), gg = off.createGain(); o.type = type; o.frequency.value = 880; gg.gain.setValueAtTime(0, t); gg.gain.linearRampToValueAtTime(gain, t + 0.004); gg.gain.setValueAtTime(gain, t + 0.026); gg.gain.linearRampToValueAtTime(0, t + 0.042); o.connect(gg); gg.connect(blipBus); o.start(t); o.stop(t + 0.05); } };
    events.sort((a, b) => a.t - b.t);
    for (const e of events) { now = e.t; if (e.blip) blip(e.t); else { try { s.play(e.name); } catch (err) { /* 鳴らせない音は飛ばす */ } } }
    const buf = await off.startRendering(), d = buf.getChannelData(0);
    const n = d.length, out = new DataView(new ArrayBuffer(44 + n * 2));
    const str = (o, x) => [...x].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
    str(0, 'RIFF'); out.setUint32(4, 36 + n * 2, true); str(8, 'WAVEfmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true);
    out.setUint32(24, rate, true); out.setUint32(28, rate * 2, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true); str(36, 'data'); out.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, d[i])) * 32767, true);
    let bin = ''; const u8 = new Uint8Array(out.buffer); for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(bin);
  };
  return DIFF.map((d) => d.name).join(' ');
})()`;

// ───────── 準備 ─────────
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: W, height: H } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://localhost:8080/index.html'); await page.waitForTimeout(1200);
console.log('難易度:', await page.evaluate(PAGE));

// 区間の中の効果音を数える
const count = (log, a, z) => { const c = { kill: 0, hit: 0, heavyHit: 0, perfect: 0, hurt: 0, tellBig: 0, bossBell: 0, heavySwing: 0, timeStop: 0, skill: 0 }; let first = { perfect: -1, skill: -1 }; for (const [t, n] of log) if (t >= a && t < z) { const k = n === 'hurtX' ? 'hurt' : n; if (k in c) c[k]++; if (k in first && first[k] < 0) first[k] = t - a; } return [c, first]; };
// いちばん見栄えのよい（種, 始まり）を選ぶ
async function choose(s) {
  const len = Math.round(s.dur * FPS * s.tpf), simN = Math.round(s.simSec * 60);
  let best = { score: -1e9 };
  for (const seed of s.seeds) {
    await page.evaluate(([setup, seed]) => window.__begin(setup, seed), [s.setup, seed]);
    const log = await page.evaluate((n) => window.__sim(n), simN);
    const cands = [];
    for (let a = 30; a + len <= simN; a += 6) {
      const [c, first] = count(log, a, a + len);
      const fn = sc[s.pick];
      const score = s.pick === 'dodge' ? fn(c, first.perfect) : s.pick === 'art' ? fn(c, first.skill) : fn(c);
      cands.push({ seed, start: a, score, c });
    }
    if (s.pick === 'white') {
      // 重ならない 3 区間を選んでおく（3 つの白き刻守のカットで使う）
      cands.sort((x, y) => y.score - x.score);
      const pick = [];
      for (const c of cands) if (pick.every((p) => Math.abs(p.start - c.start) > len * 2.5)) { pick.push(c); if (pick.length === 3) break; }
      pick.sort((x, y) => x.start - y.start);
      return pick;
    }
    for (const c of cands) if (c.score > best.score) best = c;
  }
  return best;
}

// ───────── 撮影 ─────────
rmSync(TMP, { recursive: true, force: true }); mkdirSync(TMP + 'f', { recursive: true });
const audio = []; // { t, name } / { t, blip }
const music = []; // { file, start, dur, vol, fadeIn, fadeOut, offset }
let frame = 0, t0 = 0, whites = null, whiteN = 0;
const acts = {};
const isQuiet = (ch) => /[\s、。「」―？！…,.・]/.test(ch);
const smooth = (x) => Math.max(0, Math.min(1, x));
for (const [si, s] of S.entries()) {
  const nFrames = Math.round(s.dur * FPS);
  if (s.act) acts[s.act] = t0;
  // 映像の用意
  let chosen = null;
  if (s.kind === 'foot') {
    if (s.pick === 'white') { if (!whites) whites = await choose(s); chosen = whites[whiteN++] || whites[0]; }
    else if (s.pick) chosen = await choose(s);
    else chosen = { seed: s.seeds[0], start: s.skip };
    await page.evaluate(([setup, seed]) => window.__begin(setup, seed), [s.setup, chosen.seed]);
    if (chosen.start) await page.evaluate((n) => window.__sim(n), chosen.start);
    await page.evaluate(() => { window.B.log = []; window.B.tick = 0; });
    console.log(`#${si} ${s.pick || ''} seed ${chosen.seed} start ${chosen.start}${chosen.c ? ' ' + JSON.stringify(chosen.c) : ''}`);
  }
  for (const [at, name] of s.cues) audio.push({ t: t0 + at, name });
  let lastN = 0;
  for (let i = 0; i < nFrames; i++) {
    const t = i / FPS;
    const ov = { bars: s.kind === 'foot' && s.bars, card: s.kind === 'card' };
    if (s.telop) {
      const tp = s.telop, pre = tp.pre || 0, total = [...tp.text].length;
      const n = Math.min(total, pre + Math.max(0, Math.floor((t - tp.at) * tp.cps)));
      if (t >= tp.at || pre) {
        ov.telop = { text: tp.text, n, style: tp.style };
        // 新しく出た文字ごとに音（句読点・空白・改行は鳴らさない）
        for (let k = Math.max(lastN, pre); k < n; k++) if (!isQuiet([...tp.text][k])) audio.push({ blip: true, t: t0 + tp.at + (k - pre) / tp.cps });
        lastN = n;
        if (tp.style === 'big') { const since = t - tp.at; ov.telop.scale = (1 + 0.18 * Math.max(0, 1 - since / 0.18)).toFixed(3); ov.telop.a = smooth(since / 0.08) * smooth((s.dur - t) / 0.35); }
        else if (s.kind === 'foot') ov.telop.a = smooth((s.dur - t) / 0.3);
      }
    }
    if (s.ladder) ov.ladder = Math.min(5, Math.floor(t / 0.28) + 1);
    if (s.end) ov.end = smooth((t - 2.2) / 0.8);
    if (s.fadeIn) ov.fade = smooth(1 - t / s.fadeIn);
    if (s.fadeOut) ov.fade = Math.max(ov.fade || 0, smooth(1 - (s.dur - t) / s.fadeOut));
    if (s.end) ov.fade = Math.max(ov.fade || 0, smooth(1 - (s.dur - t) / 0.8));
    if (s.flashIn) ov.flash = (s.flashIn * smooth(1 - t / 0.22)).toFixed(3);
    if (s.kind === 'foot') await page.evaluate(([ov, tpf, z, snap]) => { window.__step(tpf); window.__game.fx.banner = null; window.__zoom(z, snap); window.__ov(ov); }, [ov, s.tpf, s.zoom, i === 0]);
    else await page.evaluate((ov) => { window.__zoom(1); window.__ov(ov); }, ov);
    if (!STILLS || i === Math.floor(nFrames * 0.6)) await page.screenshot({ path: STILLS ? `${TMP}still-${String(si).padStart(2, '0')}.jpg` : `${TMP}f/${String(frame).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 90 });
    frame++;
  }
  if (s.kind === 'foot') {
    const log = await page.evaluate(() => window.B.log);
    for (const [tk, name] of log) if (name !== 'hurtX') audio.push({ t: t0 + tk / (s.tpf * FPS), name });
  }
  t0 += nFrames / FPS;
}
const total = t0;
console.log('長さ', total.toFixed(1), '秒', 'acts', JSON.stringify(acts));
if (STILLS) { console.log('errors', errs); await b.close(); process.exit(0); }

// ───────── 音 ─────────
const sfxB64 = await page.evaluate(([ev, d]) => window.__renderAudio(ev, d), [audio, total]);
writeFileSync(TMP + 'sfx.wav', Buffer.from(sfxB64, 'base64'));
await b.close();
// BGM の割り当て（物語は静かな題字の曲、手ざわり〜難易度は戦いの曲、最後の札は無音、白き刻守は決戦の曲、題字でまた題字の曲）
const climax = acts.climax, white = climax + 4.6;
music.push({ file: 'title', start: 0.2, dur: acts.action - 0.2, vol: 0.55, fadeIn: 2, fadeOut: 1.4 });
music.push({ file: 'bellfight', start: acts.action, dur: climax - acts.action, vol: 0.85, fadeIn: 0.05, fadeOut: 1.2 });
music.push({ file: 'final', start: white, dur: 2.4, vol: 0.95, fadeIn: 0.02, fadeOut: 0.06, offset: 2 });
music.push({ file: 'title', start: acts.title, dur: total - acts.title, vol: 0.6, fadeIn: 0.8, fadeOut: 1.6 });
const args = ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', TMP + 'f/%05d.jpg', '-i', TMP + 'sfx.wav'];
const parts = [], labels = ['[1:a]'];
music.forEach((m, i) => {
  if (!existsSync(`${BGM}/${m.file}.wav`)) return;
  args.push('-stream_loop', '-1', '-i', `${BGM}/${m.file}.wav`);
  const k = i + 2, ms = Math.round(m.start * 1000);
  parts.push(`[${k}:a]atrim=${m.offset || 0}:${(m.offset || 0) + m.dur},asetpts=PTS-STARTPTS,volume=${m.vol},afade=t=in:d=${m.fadeIn},afade=t=out:st=${Math.max(0, m.dur - m.fadeOut)}:d=${m.fadeOut},adelay=${ms}:all=1[m${i}]`);
  labels.push(`[m${i}]`);
});
args.push('-filter_complex', parts.join(';') + (parts.length ? ';' : '') + `${labels.join('')}amix=inputs=${labels.length}:normalize=0:duration=first,loudnorm=I=-15:TP=-1.5:LRA=14,aresample=44100[aout]`);
args.push('-map', '0:v', '-map', '[aout]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '19', '-preset', 'slow', '-c:a', 'aac', '-b:a', '192k', '-t', total.toFixed(2), OUT);
execFileSync('ffmpeg', args);
console.log('wrote', OUT, 'errors', errs);
