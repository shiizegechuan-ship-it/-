// 1ファイル版（サーバー不要・Artifact 用）を作る： node tools/build-single.mjs [出力先]
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(process.argv[2] || resolve(root, 'dist/wedge-of-dawn.html'));
const tmp = resolve(root, 'dist/bundle.js');
mkdirSync(dirname(tmp), { recursive: true });
mkdirSync(dirname(out), { recursive: true });
execFileSync('npx', ['--yes', 'esbuild@0.24.0', resolve(root, 'src/main.js'), '--bundle', '--format=iife', '--minify-syntax', `--outfile=${tmp}`], { stdio: 'inherit' });
const js = readFileSync(tmp, 'utf8');
if (js.includes('</script')) throw new Error('bundle contains </script');

const html = `<title>夜明けの楔</title>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DotGothic16&display=swap">
<style>
/* 1画面のゲーム。夜の時計塔に合わせた暗い単一テーマ */
:root { --night: #050408; --stage: #0d0b14; --ink: #efe6d2; --gold: #f2c14e; --veil: rgba(5,4,8,0.82); color-scheme: dark; }
html, body { height: 100%; margin: 0; }
[hidden] { display: none !important; }
body { background: var(--night); color: var(--ink); overflow: hidden; overscroll-behavior: none;
  padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); padding-block: 0;
  font-family: 'DotGothic16', 'Hiragino Sans', 'Yu Gothic', sans-serif; }
#stage { position: fixed; top: 8px; bottom: 8px; left: max(16px, env(safe-area-inset-left, 0px)); right: max(16px, env(safe-area-inset-right, 0px));
  display: flex; align-items: center; justify-content: center; }
body.touch { touch-action: none; user-select: none; -webkit-user-select: none; }
body.touch-portrait #stage { bottom: 280px; align-items: flex-end; }
#game { display: block; image-rendering: pixelated; background: var(--stage); max-width: 100%; outline: none; touch-action: none; }
#game:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }
#focus { position: fixed; inset: 0; z-index: 10; display: flex; flex-direction: column; gap: 8px; align-items: center; justify-content: center;
  background: var(--veil); cursor: pointer; text-align: center; padding-inline: 24px; }
#focus strong { font-size: 26px; color: var(--gold); }
#focus span { font-size: 13px; }
</style>
<div id="stage"><canvas id="game" width="960" height="540" tabindex="0" aria-label="夜明けの楔 ゲーム画面"></canvas></div>
<div id="focus" role="button" tabindex="0"><strong>タップ／クリックして遊ぶ</strong><span id="focus-hint">キーボード：Z ジャンプ・X 攻撃・C 回避・V 時歪・↑ 調べる</span></div>
<script>
${js}
</script>
<script>
(function () {
  var c = document.getElementById('game'), f = document.getElementById('focus');
  if (document.body.classList.contains('touch')) document.getElementById('focus-hint').textContent = '画面の下のスティックとボタンで操作します。横向きがおすすめです';
  function go() { f.hidden = true; c.focus(); }
  f.addEventListener('click', go);
  f.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') go(); });
  c.addEventListener('pointerdown', function () { c.focus(); });
  window.addEventListener('blur', function () { if (!document.body.classList.contains('touch')) f.hidden = false; });
})();
</script>
`;
writeFileSync(out, html);
console.log('wrote', out, `${(html.length / 1024).toFixed(0)}KB`);
