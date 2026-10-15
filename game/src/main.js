// ブラウザ側の起動処理：固定 60Hz 更新 + 描画。
import { DT, VIEW_W, VIEW_H } from './config.js';
import { Input, attachKeyboard, pollGamepad } from './input.js';
import { Game } from './game.js';
import { Sfx } from './audio.js';
import { render } from './render.js';

const SAVE_KEY = 'wedge-of-dawn-save-v1';
const storage = {
  load() { try { return localStorage.getItem(SAVE_KEY); } catch { return null; } },
  save(s) { try { localStorage.setItem(SAVE_KEY, s); } catch { /* 保存できない環境でも遊べる */ } },
};

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const input = new Input();
const sfx = new Sfx();
const game = new Game({ sfx, storage });
window.__game = game; // デバッグ・自動テスト用
window.__input = input;

attachKeyboard(input, window);
window.addEventListener('keydown', () => sfx.unlock(), { once: false });
window.addEventListener('pointerdown', () => sfx.unlock());

function fit() {
  const s = Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H);
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${Math.floor(VIEW_W * s)}px`;
  canvas.style.height = `${Math.floor(VIEW_H * s)}px`;
  canvas.width = Math.floor(VIEW_W * Math.max(1, Math.min(2, s * dpr)));
  canvas.height = Math.floor(VIEW_H * Math.max(1, Math.min(2, s * dpr)));
}
window.addEventListener('resize', fit);
fit();

let acc = 0, last = performance.now();
let manual = false; // テストから手動で進めるとき
window.__setManual = (v) => { manual = v; };
window.__step = (n = 1) => { for (let i = 0; i < n; i++) { pollGamepad(input); input.step(); game.tick(input); } draw(); };

function draw() {
  ctx.setTransform(canvas.width / VIEW_W, 0, 0, canvas.height / VIEW_H, 0, 0);
  ctx.save();
  render(ctx, game);
  ctx.restore();
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
