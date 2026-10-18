// ストアページ用の画面写真（1920×1080）と短い動画。使い方: node tools/dev/store.mjs [shots|video]（game/ で python3 -m http.server 8080 を動かしておく）
// ボット（tests/bot.mjs）に操作させて、戦っている場面を撮る
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
const what = process.argv[2] || 'shots';
const OUT = new URL('../../store/', import.meta.url).pathname;
const W = 1920, H = 1080;

// ページの中で使う道具：ボットを入力につなぐ・部屋に入る・選択画面を自動で閉じる
const SETUP = `(async () => {
  const { botInputs } = await import('/tests/bot.mjs');
  const g = window.__game, input = window.__input, step = input.step.bind(input);
  window.__bot = { on: false, f: 0, skill: 'good', autoModal: true };
  input.step = () => {
    const B = window.__bot;
    if (B.on && g.scene === 'play') {
      if (g.modal && B.autoModal) { if (g.modal.type === 'boon' || g.modal.type === 'fusion') { g.modal.t = 9; g.modal.sel = 0; input.set('confirm', B.f % 2 === 0); } else if (g.modal.choices) { g.modal.idx = g.modal.lines.length - 1; g.modal.sel = 0; input.set('confirm', B.f % 2 === 0); } else g.modal = null; }
      else if (!g.modal) { const held = g.room ? botInputs(g, B.f, B.skill) : []; for (const a of Object.keys(input.raw)) input.set(a, held.includes(a)); }
      B.f++;
    }
    step();
  };
  window.__prep = (o = {}) => {
    g.newGame(o.seed || 11); g.modal = null; g.fx.banner = null; g.nightNote = null;
    g.meta.difficulty = 'normal'; g.meta.loop = o.loop || 2; g.meta.slots = 3;
    Object.assign(g.meta.upgrades, o.upg || { atk: 6, hp: 6 });
    if (o.wedges) for (const w of o.wedges) g.meta.wedges.push(w);
    g.startLoop(); g.modal = null; g.fx.banner = null; g.nightNote = null;
    if (o.boons) g.player.setBoons([...g.player.boons, ...o.boons]);
    if (o.level) { g.run.level = o.level; g.player.baseMaxHp += 6 * (o.level - 1); g.player.setBoons(g.player.boons); g.player.hp = g.player.maxHp; }
  };
  window.__room = (type, n = 0) => { const fl = g.run.plan.floors; let k = 0; for (let fi = 0; fi < fl.length; fi++) for (let ri = 0; ri < fl[fi].length; ri++) if (fl[fi][ri].type === type && k++ === n) { g.enterRoom(fi, ri); g.modal = null; g.fx.banner = null; return fi + '-' + ri; } return null; };
  return true;
})()`;

const BOONS = "[{id:'edge',tier:2},{id:'orbit',tier:2},{id:'crit',tier:1},{id:'satellites',tier:1},{id:'heavyart',tier:1}]";
const SCENES = [
  // [ファイル名, 準備, 待つ秒（ボットが戦う時間）]
  ['01-title', "g.newGame(3); g.scene='title'; g.modal=null;", 1.5],
  ['02-combat', `__prep({ boons: ${BOONS}, level: 5 }); __room('combat', 1); __bot.on = true;`, 5.5],
  ['03-boss', `__prep({ boons: ${BOONS}, level: 9, upg: { atk: 10, hp: 10 } }); __room('boss'); __bot.on = true;`, 9],
  ['04-boon', `__prep({ boons: ${BOONS}, level: 4 }); __room('combat', 2); g.openBoonPick(1, null); g.modal.t = 5;`, 1],
  ['05-elite', `__prep({ boons: ${BOONS}, level: 7 }); __room('elite'); __bot.on = true;`, 6],
  ['06-golden', `__prep({ boons: ${BOONS}, level: 6 }); g.enterRoom(g.run.fi, g.run.ri, { type: 'golden', layout: 'vault' }); g.modal = null; g.fx.banner = null;`, 1.5],
  ['07-combat2', `__prep({ boons: ${BOONS}, level: 7, seed: 29 }); __room('combat', 4); __bot.on = true;`, 6],
  ['08-dawn', "g.newGame(5); g.meta.flags.ending = true; g.meta.flags.endings = { true: true }; g.scene='title'; g.modal=null;", 1.5],
];

const b = await chromium.launch();
const errs = [];
async function page(opts = {}) {
  const ctx = await b.newContext({ viewport: { width: W, height: H }, ...opts });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://localhost:8080/index.html'); await p.waitForTimeout(900);
  await p.evaluate(SETUP);
  return [ctx, p];
}

if (what === 'shots') {
  mkdirSync(OUT + 'screenshots', { recursive: true });
  const [ctx, p] = await page();
  for (const [name, js, wait] of SCENES) {
    await p.evaluate((js) => { window.__bot.on = false; window.__bot.f = 0; const g = window.__game; eval(js); }, js);
    await p.waitForTimeout(wait * 1000);
    await p.evaluate(() => { const g = window.__game; if (g.fx) g.fx.banner = null; });
    await p.screenshot({ path: `${OUT}screenshots/${name}.png` });
    console.log(name, await p.evaluate(() => { const g = window.__game; return g.scene + (g.player ? ` hp ${Math.round(g.player.hp)}/${g.player.maxHp}` : '') + (g.room && g.room.boss ? ` boss ${Math.round(g.room.boss.hp / g.room.boss.maxHp * 100)}%` : ''); }));
  }
  await ctx.close();
} else {
  // 動画：タイトル → 戦い → 強化を選ぶ → 歯車回廊 → 精鋭 → 刻守 → 夜明けのタイトル（約 40 秒・30fps）
  // 実時間で録ると重い場面でかくつくので、ゲームを手動で 2 tick ずつ進めて 1 枚ずつ撮る。音は BGM の WAV（render-bgm.mjs の出力）を場面ごとにつなぐ
  const BGM = process.env.BGM_DIR || '/tmp/wedge-dev/bgm';
  const dir = OUT + 'video-tmp/';
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  const [ctx, p] = await page();
  await p.evaluate(() => window.__setManual(true));
  const cut = [
    ["g.newGame(3); g.scene='title'; g.modal=null;", 4, 'title'],
    [`__prep({ boons: ${BOONS}, level: 5 }); __room('combat', 1); __bot.on = true;`, 7, 'market'],
    [`__bot.on = false; g.openBoonPick(1, null); g.modal.t = 5;`, 2.5, 'market'],
    [`__prep({ boons: ${BOONS}, level: 6, seed: 29 }); __room('combat', 4); __bot.on = true;`, 6, 'gears'],
    [`__prep({ boons: ${BOONS}, level: 7 }); __room('elite'); __bot.on = true;`, 6, 'bellfight'],
    [`__prep({ boons: ${BOONS}, level: 9, upg: { atk: 10, hp: 10 } }); __room('boss'); __bot.on = true;`, 10, 'boss'],
    ["__bot.on = false; g.newGame(5); g.meta.flags.ending = true; g.meta.flags.endings = { true: true }; g.scene='title'; g.modal=null;", 5, 'title'],
  ];
  let n = 0;
  for (const [js, sec] of cut) {
    await p.evaluate((js) => { window.__bot.f = 0; const g = window.__game; eval(js); }, js);
    for (let i = 0; i < sec * 30; i++) {
      await p.evaluate(() => { window.__step(2); const g = window.__game; if (g.fx) g.fx.banner = null; });
      await p.screenshot({ path: `${dir}${String(n++).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 92 });
    }
  }
  await ctx.close();
  const args = ['-y', '-loglevel', 'error', '-framerate', '30', '-i', dir + '%05d.jpg'];
  const parts = [];
  if (existsSync(BGM)) {
    cut.forEach(([, sec, song], i) => { args.push('-stream_loop', '-1', '-i', `${BGM}/${song}.wav`); parts.push(`[${i + 1}:a]atrim=0:${sec},asetpts=PTS-STARTPTS,afade=t=in:d=0.25,afade=t=out:st=${sec - 0.4}:d=0.4[a${i}]`); });
    args.push('-filter_complex', parts.join(';') + ';' + cut.map((_, i) => `[a${i}]`).join('') + `concat=n=${cut.length}:v=0:a=1[aout]`, '-map', '0:v', '-map', '[aout]', '-c:a', 'aac', '-b:a', '160k');
  }
  args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-shortest', OUT + 'trailer.mp4');
  execFileSync('ffmpeg', args);
  rmSync(dir, { recursive: true, force: true });
  rmSync(OUT + 'trailer.webm', { force: true });
  console.log('frames', n);
}
console.log('errors', errs);
await b.close();
