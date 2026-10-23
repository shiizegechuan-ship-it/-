/** 和の 34 色。後処理でこの色へ量子化する（発光色は対象外）。 */
export const PALETTE: Record<string, string> = {
  sumi: '#15111c', // 墨
  kachi: '#1c2138', // 褐色（かちいろ：濃い紺）
  koiai: '#243058', // 濃藍
  ai: '#33467a', // 藍
  gunjo: '#4a64a6', // 群青
  hanada: '#5f8fbf', // 縹
  asagi: '#79b8c4', // 浅葱
  byakugun: '#a9d4d3', // 白群
  geppaku: '#e4ebe8', // 月白
  gofun: '#f6f0e1', // 胡粉
  shu: '#d0482f', // 朱
  beni: '#a3223a', // 紅
  enji: '#5e1c2c', // 臙脂
  kaki: '#e5793b', // 柿
  yamabuki: '#f2b13c', // 山吹
  kin: '#c99a45', // 金茶
  ukon: '#efd27a', // 鬱金
  wakatake: '#6fa35e', // 若竹
  matsuba: '#3f6e48', // 松葉
  tokiwa: '#26473d', // 常磐
  koke: '#646b3b', // 苔
  kuri: '#5d3a28', // 栗
  hiwada: '#86553a', // 檜皮
  kuchiba: '#ae8352', // 朽葉
  suna: '#cdb88d', // 砂
  nezumi: '#5f5b66', // 鼠
  hai: '#8e8a96', // 灰
  ginnezu: '#bdb9c3', // 銀鼠
  sakura: '#eab6c0', // 桜
  murasaki: '#5a3a78', // 紫
  fuji: '#9283c8', // 藤
  yoru: '#0d0c18', // 夜
  kogecha: '#3b2621', // 焦茶
  sabiai: '#3c4f5c', // 錆藍
};

export const PALETTE_LIST: string[] = Object.values(PALETTE);

export const hexToRgb = (h: string): [number, number, number] => {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

/** 量子化しない発光色（攻撃の予兆・狐火・銭・調べられる物） */
export const GLOW = {
  telegraph: '#ff3b5c',
  foxfire: '#7ff7ff',
  zeni: '#ffe36b',
  interact: '#fff3b0',
  perfect: '#ffffff',
};
