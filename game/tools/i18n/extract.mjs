// tr('…') / tr`…` の原文を集めて tools/i18n/keys.json に書く（翻訳の元）。使い方: node tools/i18n/extract.mjs
// テンプレートのキーは、差し込む値の所を {0} {1} … にしたもの（i18n.js の tr と同じ作り方）
import { parse } from '/opt/node-tools/node_modules/acorn/dist/acorn.mjs';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { walk, JP } from './scan.mjs';
const dir = new URL('../../src/', import.meta.url).pathname;
const keys = new Map();
const add = (k, where, src, node) => {
  if (!keys.has(k)) keys.set(k, { key: k, where: [], code: '' });
  const e = keys.get(k);
  if (e.where.length < 4) e.where.push(where);
  if (!e.code) { const ls = src.lastIndexOf('\n', node.start) + 1, le = src.indexOf('\n', node.end); e.code = src.slice(ls, le < 0 ? undefined : le).trim().slice(0, 300); }
};
const leftovers = [];
for (const f of readdirSync(dir).filter((x) => x.endsWith('.js') && x !== 'i18n.js').sort()) {
  const src = readFileSync(dir + f, 'utf8');
  const ast = parse(src, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
  const seen = new Set();
  walk(ast, (n) => {
    if (n.type === 'TaggedTemplateExpression' && n.tag.type === 'Identifier' && n.tag.name === 'tr') {
      const q = n.quasi.quasis.map((x) => x.value.cooked);
      let k = q[0]; for (let i = 1; i < q.length; i++) k += `{${i - 1}}` + q[i];
      add(k, `${f}:${n.loc.start.line}`, src, n); seen.add(n.quasi);
    }
    if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 'tr' && n.arguments[0] && n.arguments[0].type === 'Literal') {
      add(n.arguments[0].value, `${f}:${n.loc.start.line}`, src, n); seen.add(n.arguments[0]);
    }
  });
  walk(ast, (n) => {
    if (seen.has(n)) return;
    if (n.type === 'Literal' && typeof n.value === 'string' && JP.test(n.value)) leftovers.push(`${f}:${n.loc.start.line} ${n.raw.slice(0, 60)}`);
    if (n.type === 'TemplateLiteral' && n.quasis.some((q) => JP.test(q.value.cooked))) leftovers.push(`${f}:${n.loc.start.line} \`${n.quasis[0].value.cooked.slice(0, 50)}`);
  });
}
const list = [...keys.values()];
writeFileSync(new URL('./keys.json', import.meta.url), JSON.stringify(list, null, 1));
console.log('keys', list.length, 'chars', list.reduce((a, e) => a + e.key.length, 0));
if (leftovers.length) console.log('包んでいない日本語:\n' + leftovers.join('\n'));
