// 言語の切り替え。原文（日本語）をキーにして、選んだ言語の訳を引く。
// ・ソースの日本語の文字列は tr('…') / tr`…${x}…` で包んである（tools/i18n/wrap.mjs）。訳が無ければ原文のまま
// ・言語は読み込みの最初に一度だけ決める（強化の名前などは読み込み時に作るため）。切り替えたら読み込み直す
// ・決め方：保存した設定 → ブラウザの言語 → 日本語（テストでは WEDGE_LANG で指定できる）
import en from './lang/en.js';
import zhHans from './lang/zh-Hans.js';
import zhHant from './lang/zh-Hant.js';
import ko from './lang/ko.js';
import ru from './lang/ru.js';
import es from './lang/es.js';
import ptBR from './lang/pt-BR.js';
import de from './lang/de.js';
import fr from './lang/fr.js';

export const LANGS = [
  { id: 'ja', name: '日本語', dict: null },
  { id: 'en', name: 'English', dict: en },
  { id: 'zh-Hans', name: '简体中文', dict: zhHans },
  { id: 'zh-Hant', name: '繁體中文', dict: zhHant },
  { id: 'ko', name: '한국어', dict: ko },
  { id: 'ru', name: 'Русский', dict: ru },
  { id: 'es', name: 'Español', dict: es },
  { id: 'pt-BR', name: 'Português (Brasil)', dict: ptBR },
  { id: 'de', name: 'Deutsch', dict: de },
  { id: 'fr', name: 'Français', dict: fr },
];
export const SETTINGS_KEY = 'wedge-of-dawn-save-v1:settings';

// ブラウザの言語（'zh-TW' など）を、用意した言語に合わせる
export function matchLang(tag) {
  if (!tag) return null;
  const t = String(tag).toLowerCase();
  if (t.startsWith('zh')) return /hant|tw|hk|mo/.test(t) ? 'zh-Hant' : 'zh-Hans';
  if (t.startsWith('pt')) return 'pt-BR';
  const hit = LANGS.find((l) => t === l.id.toLowerCase() || t.startsWith(l.id.toLowerCase() + '-'));
  return hit ? hit.id : null;
}
function initialLang() {
  try { const v = globalThis.process && globalThis.process.env && globalThis.process.env.WEDGE_LANG; if (v) return matchLang(v) || 'ja'; } catch { /* ブラウザ */ }
  try { const s = JSON.parse(globalThis.localStorage.getItem(SETTINGS_KEY) || 'null'); if (s && s.lang && LANGS.some((l) => l.id === s.lang)) return s.lang; } catch { /* 保存なし */ }
  try { if (typeof window !== 'undefined' && window.navigator) for (const tag of window.navigator.languages || [window.navigator.language]) { const m = matchLang(tag); if (m) return m; } } catch { /* 取れない */ }
  return 'ja';
}
export const LANG = initialLang();
const DICT = (LANGS.find((l) => l.id === LANG) || LANGS[0]).dict;
export const langName = (id = LANG) => (LANGS.find((l) => l.id === id) || LANGS[0]).name;

// tr('原文') / tr`原文${値}` のどちらでも使える。テンプレートのキーは値の所を {0} {1} … にしたもの
export function tr(s, ...vals) {
  if (Array.isArray(s) && s.raw) {
    let t = null;
    if (DICT) { let key = s[0]; for (let i = 1; i < s.length; i++) key += `{${i - 1}}` + s[i]; t = DICT[key]; }
    if (t == null) { let o = s[0]; for (let i = 1; i < s.length; i++) o += vals[i - 1] + s[i]; return o; }
    return t.replace(/\{(\d+)\}/g, (m, n) => (vals[+n] === undefined ? m : vals[+n]));
  }
  if (!DICT) return s;
  const t = DICT[s];
  return t == null ? s : t;
}

// 文字の書体：中国語・韓国語は、ドット文字（日本の字形）を英数字だけに使い、漢字・ハングルは端末の書体で出す
const CJK_FALLBACK = {
  'zh-Hans': `'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', 'Noto Sans SC', 'Source Han Sans SC'`,
  'zh-Hant': `'PingFang TC', 'Microsoft JhengHei', 'Noto Sans CJK TC', 'Noto Sans TC', 'Source Han Sans TC'`,
  ko: `'Apple SD Gothic Neo', 'Malgun Gothic', 'Noto Sans CJK KR', 'Noto Sans KR', 'Source Han Sans KR'`,
};
export const FONT_STACK = CJK_FALLBACK[LANG]
  ? `'DotGothic16 Latin', ${CJK_FALLBACK[LANG]}, sans-serif`
  : `'DotGothic16', 'Hiragino Sans', 'Yu Gothic', 'IPAGothic', sans-serif`;
