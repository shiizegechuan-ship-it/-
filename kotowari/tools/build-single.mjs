// 1 ファイル版（この会話の画面・itch.io などで、ファイル 1 つで遊べる形）を作る
// 使い方：npm run build && node tools/build-single.mjs [出力先.html] [--fragment]
//   --fragment：<html>・<head>・<body> を付けない（公開の仕組みが外枠を付ける場合）
// 文字は、ゲームで使う文字だけに絞った書体を埋め込む（pyftsubset が無ければ全部入り）
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const args = process.argv.slice(2);
const fragment = args.includes('--fragment');
const out = args.find((a) => !a.startsWith('--')) ?? path.join(ROOT, 'out', 'kotowari.html');
const dist = path.join(ROOT, 'dist');
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const jsFile = html.match(/src="\.\/(assets\/[^"]+\.js)"/)[1];
const cssFile = html.match(/href="\.\/(assets\/[^"]+\.css)"/)[1];
let js = fs.readFileSync(path.join(dist, jsFile), 'utf8');
let css = fs.readFileSync(path.join(dist, cssFile), 'utf8');

// 使う文字を集める（ソースの全文字＋英数字・記号）
const chars = new Set();
const walk = (d) => {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|css|html)$/.test(f)) for (const c of fs.readFileSync(p, 'utf8')) chars.add(c);
  }
};
walk(path.join(ROOT, 'src'));
for (let i = 0x20; i < 0x7f; i++) chars.add(String.fromCharCode(i));
for (const c of '０１２３４５６７８９、。・「」『』（）！？…ー〜') chars.add(c);
const fontRef = css.match(/url\(([^)]+\.ttf)\)/);
if (fontRef) {
  const ttf = path.join(dist, 'assets', path.basename(fontRef[1]));
  let data = fs.readFileSync(ttf);
  let mime = 'font/ttf';
  try {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kfont-'));
    const txt = path.join(tmp, 'chars.txt');
    fs.writeFileSync(txt, [...chars].join(''));
    const sub = path.join(tmp, 'sub.woff');
    execFileSync('pyftsubset', [ttf, `--text-file=${txt}`, `--output-file=${sub}`, '--flavor=woff', '--no-hinting'], { stdio: 'pipe' });
    data = fs.readFileSync(sub);
    mime = 'font/woff';
  } catch (e) {
    console.warn('書体を絞れなかったので全部入りで埋め込む：', e.message.split('\n')[0]);
  }
  css = css.replace(fontRef[0], `url(data:${mime};base64,${data.toString('base64')})`).replace("format('truetype')", mime === 'font/woff' ? "format('woff')" : "format('truetype')");
}
js = js.replace(/<\/script/gi, '<\\/script');
const head = `<title>ことわり質屋</title>
<meta name="description" content="神楽の舞手が、自分の舞を狐の質屋に質入れすると、その力は世界の理になる。和風 3D ドット・アクション探索。">
<meta name="theme-color" content="#0d0c18">
<style>${css}</style>`;
const body = `<div id="stage"><canvas id="screen"></canvas></div>
<div id="ui"></div>
<script type="module">${js}</script>`;
const page = fragment
  ? `${head}\n${body}\n`
  : `<!doctype html>\n<html lang="ja">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">\n${head}\n</head>\n<body>\n${body}\n</body>\n</html>\n`;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, page);
console.log(`${out}  ${(page.length / 1024 / 1024).toFixed(2)} MB（文字 ${chars.size} 種）`);
