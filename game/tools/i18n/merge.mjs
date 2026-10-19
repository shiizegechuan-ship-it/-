// 翻訳の結果（tools/i18n/out/<言語>-<n>.json：{ 番号: 訳 }）を、原文をキーにした src/lang/<言語>.js にまとめる。
// 使い方: node tools/i18n/merge.mjs [言語…]（省略で全部）
// ・番号は tools/i18n/work/chunk-*.json の id
// ・すでにある訳は残し、新しい結果で上書きする。原文から消えたキーは捨てる
// ・差し込み（{0} など）・改行の数が合わない訳は採らずに知らせる
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
const here = new URL('./', import.meta.url).pathname;
const keys = JSON.parse(readFileSync(here + 'keys.json', 'utf8')).map((e) => e.key);
// 結果の番号 → 原文は、翻訳に渡した work/chunk-*.json で引く（keys.json の並びはソースの変更でずれるため）
const byId = {};
for (const f of readdirSync(here + 'work').filter((x) => /^chunk-\d+\.json$/.test(x))) for (const it of JSON.parse(readFileSync(here + 'work/' + f, 'utf8'))) byId[it.id] = it.key;
const LANGS = ['en', 'zh-Hans', 'zh-Hant', 'ko', 'ru', 'es', 'pt-BR', 'de', 'fr'];
const want = process.argv.slice(2).length ? process.argv.slice(2) : LANGS;
const holes = (s) => (s.match(/\{\d+\}/g) || []).sort().join(',');
const nl = (s) => (s.match(/\n/g) || []).length;
for (const lang of want) {
  const file = new URL(`../../src/lang/${lang}.js`, import.meta.url).pathname;
  let dict = {};
  if (existsSync(file)) { try { dict = (await import(file + '?t=' + Date.now())).default; } catch { dict = {}; } }
  const pat = new RegExp(`^${lang.replace(/-/g, '\\-')}-\\d+\\.json$`);
  const outs = readdirSync(here + 'out').filter((f) => pat.test(f)).sort();
  const bad = [];
  let added = 0;
  for (const f of outs) {
    let o;
    try { o = JSON.parse(readFileSync(here + 'out/' + f, 'utf8')); } catch (e) { bad.push(`${f}: JSON ${e.message}`); continue; }
    for (const [id, t] of Object.entries(o)) {
      const k = byId[id];
      if (k === undefined || typeof t !== 'string') continue;
      if (holes(t) !== holes(k)) { bad.push(`#${id} 差し込み「${k}」→「${t}」`); continue; }
      if (nl(t) !== nl(k)) { bad.push(`#${id} 改行「${k}」→「${t}」`); continue; }
      dict[k] = t; added++;
    }
  }
  const out = {};
  for (const k of keys) if (k in dict) out[k] = dict[k];
  const missing = keys.filter((k) => !(k in out));
  writeFileSync(file, `// 翻訳（${lang}）。キーは日本語の原文、{0} などは差し込む値。tools/i18n/merge.mjs が書き出す（手で直してもよい）\nexport default ${JSON.stringify(out, null, 1)};\n`);
  console.log(`${lang}: ${Object.keys(out).length}/${keys.length}（今回 ${added}）${missing.length ? ' 足りない ' + missing.length : ''}${bad.length ? '\n  ' + bad.slice(0, 20).join('\n  ') : ''}`);
}
