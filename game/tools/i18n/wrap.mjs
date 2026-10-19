// ソースの日本語の文字列を tr('…') / tr`…` で包み、各ファイルに import を足す（何度実行しても同じ結果）。
// 使い方: node tools/i18n/wrap.mjs
// 包まないもの：オブジェクトのキー・import の指定・すでに tr で包んだもの・i18n.js と lang/
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { findStrings, risky } from './scan.mjs';
const dir = new URL('../../src/', import.meta.url).pathname;
const SKIP = new Set(['i18n.js']);
let total = 0;
for (const f of readdirSync(dir).filter((x) => x.endsWith('.js') && !SKIP.has(x)).sort()) {
  let src = readFileSync(dir + f, 'utf8');
  const edits = [];
  for (const s of findStrings(src)) {
    const r = risky(s);
    if (r && r !== 'compare' && !r.startsWith('method:')) continue;
    const p = s.parent;
    if (p && p.type === 'CallExpression' && p.callee.type === 'Identifier' && p.callee.name === 'tr') continue; // 包み済み
    if (s.kind === 'lit') edits.push([s.node.start, 'tr('], [s.node.end, ')']);
    else edits.push([s.node.start, 'tr']);
  }
  if (!edits.length) continue;
  edits.sort((a, b) => b[0] - a[0]);
  for (const [pos, ins] of edits) src = src.slice(0, pos) + ins + src.slice(pos);
  if (!/import \{ tr \} from '\.\/i18n\.js';/.test(src)) {
    // 最初の import の前（無ければ先頭のコメントの後）に足す
    const m = src.match(/^import /m);
    const at = m ? m.index : src.search(/^(?!\/\/)/m);
    src = src.slice(0, at) + "import { tr } from './i18n.js';\n" + src.slice(at);
  }
  writeFileSync(dir + f, src);
  total += edits.length;
  console.log(f, edits.filter((e) => e[1] !== ')').length);
}
console.log('wrapped', total);
