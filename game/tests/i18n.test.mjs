import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tr, LANG, LANGS, matchLang } from '../src/i18n.js';
import { newGame, Driver } from './helpers.mjs';

const KEYS = JSON.parse(readFileSync(new URL('../tools/i18n/keys.json', import.meta.url), 'utf8')).map((e) => e.key);
const holes = (s) => (s.match(/\{\d+\}/g) || []).sort().join(',');

test('言語：テストでは日本語（原文のまま）。テンプレートは値を差し込む。ブラウザの言語を用意した言語に合わせる', () => {
  assert.equal(LANG, 'ja');
  assert.equal(tr('ゲームについて'), 'ゲームについて');
  const n = 3;
  assert.equal(tr`第 ${n} 夜`, '第 3 夜');
  assert.equal(tr`a\nb${1}`, 'a\nb1', 'escapes are cooked');
  assert.equal(matchLang('en-US'), 'en');
  assert.equal(matchLang('zh-CN'), 'zh-Hans');
  assert.equal(matchLang('zh-TW'), 'zh-Hant');
  assert.equal(matchLang('zh-Hant-HK'), 'zh-Hant');
  assert.equal(matchLang('pt-PT'), 'pt-BR');
  assert.equal(matchLang('ko-KR'), 'ko');
  assert.equal(matchLang('it-IT'), null);
});

test('言語：どの言語も、原文のすべてに訳があり、差し込みの {0} などが原文とそろっている', () => {
  for (const l of LANGS) {
    if (!l.dict) continue;
    const missing = KEYS.filter((k) => !(k in l.dict));
    assert.equal(missing.length, 0, `${l.id}: 訳がない ${missing.length} 件（例：${missing.slice(0, 3).join(' / ')}）`);
    for (const k of KEYS) assert.equal(holes(l.dict[k]), holes(k), `${l.id}: 差し込みが合わない「${k}」→「${l.dict[k]}」`);
    // 訳の中に日本語のかなが残っていない（中国語は漢字を使うので、かなだけを見る）
    const kana = KEYS.filter((k) => /[\u3040-\u30ff]{2}/.test(l.dict[k]));
    assert.ok(kana.length <= 3, `${l.id}: かなが残っている ${kana.length} 件（例：${kana.slice(0, 3).map((k) => l.dict[k]).join(' / ')}）`);
  }
});

test('言語：設定に「言語 / Language」。開くと言語の一覧、選ぶと保存して読み込み直す（onLangChange）。戻るで設定の一覧へ', () => {
  const g = newGame(5); g.scene = 'title'; g.titleSel = -1;
  let saved = null; g.storage.saveSettings = (s) => { saved = JSON.parse(s); };
  const d = new Driver(g);
  d.frame(1, ['confirm']); d.frame(1);
  assert.ok(g.titleSettings);
  const so = g.settingsOptions();
  const li = so.findIndex((o) => o.id === 'lang');
  assert.ok(li >= 0 && so[li].label.startsWith('言語 / Language'), so.map((o) => o.label).join('|'));
  g.titleSettings.sel = li; d.frame(1, ['confirm']); d.frame(1);
  assert.ok(g.titleSettings.lang, 'language list opens');
  assert.deepEqual(g.settingsOptions().map((o) => o.label), LANGS.map((l) => l.name));
  assert.equal(g.titleSettings.sel, 0, 'cursor on the current language');
  d.frame(1, ['back']); d.frame(1);
  assert.ok(g.titleSettings && !g.titleSettings.lang && g.settingsOptions()[g.titleSettings.sel].id === 'lang', 'back returns to the settings list');
  d.frame(1, ['confirm']); d.frame(1);
  let changed = null; g.onLangChange = (id) => { changed = id; };
  g.titleSettings.sel = LANGS.findIndex((l) => l.id === 'en'); d.frame(1, ['confirm']); d.frame(1);
  assert.equal(changed, 'en'); assert.equal(saved.lang, 'en'); assert.equal(g.settings.lang, 'en');
});

test('言語：英語で読み込むと、強化の名前・説明や画面の文字が英語になる（別のプロセスで WEDGE_LANG=en）', () => {
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', `
    const { BOONS } = await import('${new URL('../src/boons.js', import.meta.url).href}');
    const { Game } = await import('${new URL('../src/game.js', import.meta.url).href}');
    const g = new Game({ deterministicFx: true }); g.newGame(3); g.scene = 'title';
    console.log(JSON.stringify({ name: BOONS.edge.name, desc: BOONS.lag.desc(2), opts: g.settingsOptions().map((o) => o.label) }));
  `], { env: { ...process.env, WEDGE_LANG: 'en' } }).toString();
  const r = JSON.parse(out);
  const en = LANGS.find((l) => l.id === 'en').dict;
  assert.equal(r.name, en['研ぎ澄まし']);
  assert.ok(!/[぀-ヿ]/.test(r.desc), r.desc);
  assert.ok(r.opts.some((o) => o === en['ゲームについて']), r.opts.join('|'));
});
