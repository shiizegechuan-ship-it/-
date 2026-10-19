// 日本語の文字列リテラルを構文木で探す。node tools/i18n/scan.mjs [--risky]
// --risky：比較・switch・キー・メソッド呼び出しの引数など、訳すと動きが変わりうる位置にあるものだけを出す
import { parse } from '/opt/node-tools/node_modules/acorn/dist/acorn.mjs';
import { readFileSync, readdirSync } from 'node:fs';
export const JP = /[぀-ヿ㐀-鿿！-｠　-〿]/;
export function walk(node, fn, parent = null, key = null) {
  if (!node || typeof node.type !== 'string') return;
  fn(node, parent, key);
  for (const k of Object.keys(node)) {
    if (k === 'parent') continue;
    const v = node[k];
    if (Array.isArray(v)) v.forEach((c) => c && typeof c.type === 'string' && walk(c, fn, node, k));
    else if (v && typeof v.type === 'string') walk(v, fn, node, k);
  }
}
export function findStrings(src) {
  const ast = parse(src, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
  const out = [];
  walk(ast, (n, p, k) => {
    if (n.type === 'Literal' && typeof n.value === 'string' && JP.test(n.value)) out.push({ node: n, parent: p, key: k, kind: 'lit' });
    if (n.type === 'TemplateLiteral' && n.quasis.some((q) => JP.test(q.value.cooked))) out.push({ node: n, parent: p, key: k, kind: 'tpl' });
  });
  return out;
}
export function risky({ node, parent, key }) {
  if (!parent) return null;
  if (parent.type === 'BinaryExpression' && ['===', '!==', '==', '!='].includes(parent.operator)) return 'compare';
  if (parent.type === 'SwitchCase' && key === 'test') return 'case';
  if (parent.type === 'Property' && key === 'key') return 'propKey';
  if (parent.type === 'MemberExpression' && key === 'property') return 'member';
  if (parent.type === 'ImportDeclaration' || parent.type === 'ExportNamedDeclaration') return 'module';
  if (parent.type === 'CallExpression' && key === 'arguments' && parent.callee.type === 'MemberExpression') {
    const m = parent.callee.property.name;
    if (['includes', 'startsWith', 'endsWith', 'indexOf', 'split', 'replace', 'has', 'get', 'set', 'delete'].includes(m)) return 'method:' + m;
  }
  if (parent.type === 'TaggedTemplateExpression') return 'tagged';
  return null;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = new URL('../../src/', import.meta.url).pathname;
  const onlyRisky = process.argv.includes('--risky');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.js')).sort()) {
    const src = readFileSync(dir + f, 'utf8');
    for (const s of findStrings(src)) {
      const r = risky(s);
      if (onlyRisky && !r) continue;
      const line = s.node.loc.start.line;
      console.log(`${f}:${line} ${r || ''} ${src.slice(s.node.start, Math.min(s.node.end, s.node.start + 70)).replace(/\n/g, '⏎')}`);
    }
  }
}
