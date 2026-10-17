// ブラウザ側の起動処理：固定 60Hz 更新 + 描画。
import { DT, VIEW_W, VIEW_H } from './config.js';
import { Input, attachKeyboard, pollGamepad } from './input.js';
import { Game } from './game.js';
import { makeEnemy } from './enemies.js';
import { Sfx } from './audio.js';
import { Music } from './music.js';
import { musicFor } from './songs.js';
import { render } from './render.js';
import { isTouchDevice, setupTouch } from './touch.js';

const SAVE_KEY = 'wedge-of-dawn-save-v1';
const storage = {
  load() { try { return localStorage.getItem(SAVE_KEY); } catch { return null; } },
  save(s) { try { localStorage.setItem(SAVE_KEY, s); } catch { /* 保存できない環境でも遊べる */ } },
  loadSettings() { try { return localStorage.getItem(SAVE_KEY + ':settings'); } catch { return null; } },
  saveSettings(s) { try { localStorage.setItem(SAVE_KEY + ':settings', s); } catch { /* 保存できない環境でも遊べる */ } },
};

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const input = new Input();
const sfx = new Sfx();
const game = new Game({ sfx, storage });
sfx.setVolume(game.settings.volume); // 保存した音量
const music = new Music(sfx);
window.__music = music; // デバッグ・自動テスト用
window.__game = game; // デバッグ・自動テスト用
window.__input = input;
window.__makeEnemy = makeEnemy; // デバッグ用

attachKeyboard(input, window);
window.addEventListener('keydown', () => sfx.unlock(), { once: false });
window.addEventListener('pointerdown', () => sfx.unlock());

// ゲーム画面は #stage の大きさに合わせて 16:9 で最大化する（縦向きのスマホでは下に操作盤が入る）
const stage = document.getElementById('stage') || canvas.parentElement;
function fit() {
  const w = stage.clientWidth || window.innerWidth, h = stage.clientHeight || window.innerHeight;
  const s = Math.max(0.1, Math.min(w / VIEW_W, h / VIEW_H));
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${Math.floor(VIEW_W * s)}px`;
  canvas.style.height = `${Math.floor(VIEW_H * s)}px`;
  // ドット絵がにじまないよう、内部解像度は整数倍にする（拡大は CSS の pixelated）
  const k = Math.max(1, Math.min(3, Math.floor(s * dpr + 0.15)));
  canvas.width = VIEW_W * k;
  canvas.height = VIEW_H * k;
}
window.addEventListener('resize', fit);
if (window.ResizeObserver) new ResizeObserver(fit).observe(stage);

// iPhone：ボタンを素早く 2 回たたくと、ブラウザの「ダブルタップで拡大・移動」が働いて、ページ全体がずれることがある。
// ゲームの画面と操作盤の上では、ブラウザの既定のジェスチャを止め、ずれたスクロールは元へ戻す
function guardGestures() {
  const stop = (e) => { if (e.cancelable) e.preventDefault(); };
  let lastEnd = 0;
  document.addEventListener('touchend', (e) => {
    const now = performance.now();
    if (now - lastEnd < 350) stop(e); // 2 回目のタップの終わり：ダブルタップの拡大にさせない
    lastEnd = now;
  }, { passive: false });
  document.addEventListener('dblclick', stop, { passive: false });
  for (const g of ['gesturestart', 'gesturechange']) document.addEventListener(g, stop, { passive: false }); // ピンチで拡大しない
  const unscroll = () => { if (window.scrollX || window.scrollY) window.scrollTo(0, 0); };
  window.addEventListener('scroll', unscroll, { passive: true });
  if (window.visualViewport) { window.visualViewport.addEventListener('resize', () => { unscroll(); fit(); }); window.visualViewport.addEventListener('scroll', unscroll); }
  canvas.removeAttribute('tabindex'); // 触れた要素へのフォーカスで、画面がスクロールしないように
}

let touchUI = null;
if (isTouchDevice()) {
  document.body.classList.add('touch');
  document.documentElement.classList.add('touch');
  guardGestures();
  game.touch = true;
  touchUI = setupTouch(input, document.body);
}
fit();

// 画面のタップ：メニューの項目や強化カードを直接選ぶ
canvas.addEventListener('pointerdown', (e) => {
  const r = canvas.getBoundingClientRect();
  const x = (e.clientX - r.left) * VIEW_W / r.width, y = (e.clientY - r.top) * VIEW_H / r.height;
  if (game.handleTap(x, y)) { input.set('confirm', true, 'tap'); input.set('confirm', false, 'tap'); return; }
  // タッチ操作：画面をタップした所へ移動する。操作盤やボタンの周り（押し損ねやすい所）は反応しない
  if (touchUI && !nearControls(e.clientX, e.clientY)) game.tapMove(x, y);
});
const DEAD_ZONE = 28; // 操作盤・ボタンの縁から、この幅（CSS の px）はタップ移動にしない
function nearControls(x, y) {
  for (const el of touchUI.querySelectorAll('.t-pad, .t-btn')) {
    const r = el.getBoundingClientRect();
    if (r.width && x > r.left - DEAD_ZONE && x < r.right + DEAD_ZONE && y > r.top - DEAD_ZONE && y < r.bottom + DEAD_ZONE) return true;
  }
  return false;
}
// 別のアプリへ切り替えたら中断する
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { input.clear(); if (game.scene === 'play' && !game.modal && game.player && game.player.state !== 'dead') game.openPause(); }
});

let acc = 0, last = performance.now();
let manual = false; // テストから手動で進めるとき
window.__setManual = (v) => { manual = v; };
window.__step = (n = 1) => { for (let i = 0; i < n; i++) { pollGamepad(input); input.step(); game.tick(input); } draw(); };

function draw() {
  ctx.setTransform(canvas.width / VIEW_W, 0, 0, canvas.height / VIEW_H, 0, 0);
  ctx.save();
  render(ctx, game);
  ctx.restore();
  // BGM：場面に合った曲を流す（メニューを開いている間は小さく）
  if (music.level !== game.settings.bgm) music.setLevel(game.settings.bgm);
  music.update(musicFor(game), { quiet: !!game.modal });
  if (touchUI) touchUI.radar(game.modal ? [] : game.enemyBearings());
}

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!manual) {
    acc += dt;
    let steps = 0;
    while (acc >= DT && steps < 5) {
      pollGamepad(input);
      input.step();
      game.tick(input);
      acc -= DT; steps++;
    }
    if (steps >= 5) acc = 0;
    draw();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
