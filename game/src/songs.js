// BGM の楽譜（DOM に依存しない。テストからも読める）。音はすべてビット音（矩形波・三角波・ノイズ）。
//
// 声部の数（エコーは数えない）
//   通常の階・戦いのあと・タイトル：主旋律 1・和音 3（根音＋2 声）・ドラム 1
//   刻守の部屋：主旋律 1・副旋律 1・和音 4（根音＋3 声）・ドラム 1
//
// 書き方
//   chords：1 小節に 1 つのコード（16 小節で 1 周）。'F|E7' は小節の前半と後半、'Am/G' は低音を G に。
//           Am・C7・Fmaj7・Dm7・Bm7b5・Esus4・Cdim7・Caug など
//   lead / counter：1 小節ずつ「音名/長さ」を空白で並べる。長さは 16 分音符の数（1 小節 = 16）。r は休符
//           拍の裏の短い音（16 分）には、コードの音どうしを半音でつなぐ経過音を置く（E→D#→D など。切なさを出す）
//   style：和音の刻み方（下の CHORD_STYLES）
//   drum：1 小節 16 文字。k キック・s スネア・h ハイハット・o 開いたハイハット・. 休み。order で小節ごとに選ぶ

export const RANGE = { lead: [60, 84], counter: [55, 76], bass: [45, 69], chord: [55, 72] }; // 高すぎ・低すぎを避ける（MIDI 番号。60 = C4）

export const SONGS = {
  // 下層・市場：夜の市場。少し怪しく、軽やか（イ短調）
  market: {
    name: '夜市の灯', bpm: 132, style: 'offbeat', echo: 3,
    // 短調の ii–V（Bm7♭5→E7）、後半の王道進行（Fmaj7→G7→Em7→Am7）、宙づりの Esus4
    chords: 'Am Fmaj7 C G7 Am7 Dm7 Bm7b5 E7 Fmaj7 G7 Em7 Am7 Dm7 G7 Cmaj7|Fmaj7 Esus4|E7',
    lead: [
      'E5/4 A4/2 C5/2 E5/2 D5/2 C5/4', 'F5/6 E5/2 C5/4 A4/4', 'G4/2 C5/2 E5/4 G5/4 E5/2 C5/2', 'D5/6 C#5/1 C5/1 B4/4 G4/4',
      'A4/2 C5/2 E5/2 A5/4 G5/2 E5/4', 'F5/4 E5/2 F5/2 A5/4 F5/4', 'D5/4 F5/4 A5/4 G5/2 F5/2', 'E5/6 D#5/1 D5/1 B4/4 G#4/4',
      'C5/2 A4/2 C5/2 F5/6 E5/4', 'D5/2 B4/2 D5/2 G5/6 F5/4', 'E5/4 G5/4 B5/4 G5/4', 'A5/8 E5/4 C5/4',
      'F5/2 E5/2 D5/4 A4/4 D5/4', 'B4/2 C5/2 D5/4 G5/4 F5/4', 'E5/4 G5/2 E5/2 C5/4 E5/4', 'B4/8 G#4/4 E4/4',
    ],
    drum: { a: 'k.h.s.h.k.k.s.h.', f: 'k.h.s.h.s.s.ssss' }, order: 'aaaaaaafaaaaaaaf',
  },
  // 中層・歯車回廊：歯車が噛み合うように刻む（ホ短調）
  gears: {
    name: '歯車の回廊', bpm: 144, style: 'motor', echo: 2,
    // 7 の和音の陰り、Em→Em/D の下がる低音、D7→G（平行調への寄り道）、最後は Cmaj7 の上で #11 が鳴ってから B7
    chords: 'Em Cmaj7 D Bm7 Em C Am7 B7 Cmaj7 D Bm7 Em|Em/D Am7 D7 G Cmaj7|B7',
    lead: [
      'B4/2 E5/2 G5/2 E5/2 B4/2 E5/2 F#5/2 A5/2', 'G5/4 E5/2 C5/2 G4/4 C5/4', 'F#5/2 A5/2 F#5/2 D5/2 A4/4 D5/4', 'F#5/4 B4/4 D5/8',
      'E5/2 G5/2 B5/2 G5/2 E5/2 G5/2 A5/2 B5/2', 'C6/6 G5/2 E5/4 C5/4', 'A5/2 G5/2 E5/2 C5/2 E5/4 A4/4', 'F#5/6 F5/1 E5/1 D#5/4 B4/4',
      'E5/2 r/2 B4/2 G5/2 C6/4 G5/4', 'F#5/2 r/2 D5/2 A5/2 F#5/4 A4/4', 'D5/2 F#5/2 B5/4 F#5/2 E5/2 D5/4', 'E5/12 r/4',
      'C5/2 E5/2 A5/4 E5/2 G5/2 C6/4', 'A5/4 F#5/4 D5/4 E5/2 F#5/2', 'G5/2 D5/2 B4/2 D5/2 G5/2 B5/2 A5/4', 'B5/4 F#5/4 D#5/4 B4/4',
    ],
    drum: { a: 'k.hhs.hhk.hhs.hh', f: 'k.hhs.hhs.s.ssss' }, order: 'aaaaaaafaaaaaaaf',
  },
  // 上層・鐘楼：重く、厳かに。長い音と鐘のような高い音（ハ短調）
  belfry: {
    name: '鐘楼へ', bpm: 116, style: 'pad', echo: 4,
    // 下がっていく低音（C→C/B♭→A♭maj7）、宙づりの Gsus4、Fm へ向かう C7
    chords: 'Cm Cm/Bb|Abmaj7 Bb G7 Cm7 Fm7 Abmaj7 Gsus4|G7 Abmaj7 Bb7 Gm7 Cm|C7 Fm7 Bb7 Ebmaj7 G7',
    lead: [
      'G4/4 C5/4 Eb5/8', 'C5/6 Bb4/2 Ab4/8', 'F5/4 D5/4 Bb4/4 C5/2 Eb5/2', 'D5/10 C#5/1 C5/1 B4/4',
      'Eb5/4 G5/4 C6/6 Bb5/2', 'Ab5/8 F5/4 C5/4', 'Eb5/6 F5/2 Eb5/4 C5/4', 'D5/8 B4/8',
      'C5/4 Eb5/4 Ab5/8', 'Bb5/6 Ab5/2 F5/8', 'G5/4 F5/2 D5/2 Bb4/4 D5/4', 'C5/16',
      'F5/6 Ab5/2 C6/8', 'Bb5/8 F5/4 D5/4', 'Eb5/4 G5/4 Bb5/6 G5/2', 'B4/4 D5/4 G5/8',
    ],
    drum: { a: 'k...h...s...h...', f: 'k...h...s.s.sss.' }, order: 'aaaaaaafaaaaaaaf',
  },
  // 上層・鐘楼の戦闘部屋：鐘を打ち鳴らすように速く刻む（ヘ短調）。「鐘楼へ」の重さは残して、前へ駆ける
  bellfight: {
    name: '鐘楼の剣戟', bpm: 150, style: 'gallop', echo: 2,
    // 下がる低音（Fm→Fm/E♭→D♭maj7）、宙づりの Csus4 から C7、短調の ii–V（Gm7♭5→C7）、平行調の E♭7→A♭maj7
    chords: 'Fm Dbmaj7 Bbm7 C7 Fm Fm/Eb Dbmaj7 Csus4|C7 Bbm7 Eb7 Abmaj7 Dbmaj7 Gm7b5 C7 Fm Csus4|C7',
    lead: [
      'C5/2 F5/2 Ab5/2 F5/2 C6/4 Ab5/2 F5/2', 'Ab5/4 F5/2 Db5/2 C5/2 Db5/2 F5/4', 'Bb4/2 Db5/2 F5/2 Ab5/2 Bb5/4 Ab5/2 F5/2', 'E5/2 G5/2 Bb5/2 G5/2 E5/2 G5/2 Bb5/3 A5/1',
      'Ab5/2 F5/2 C5/2 F5/2 Ab5/2 Bb5/2 C6/4', 'Ab5/4 Eb5/2 F5/2 C5/2 Eb5/2 F5/4', 'Ab5/2 F5/2 Db5/2 F5/2 Ab5/4 C6/4', 'G5/4 F5/2 C5/2 E5/2 G5/2 Bb5/2 G5/2',
      'F5/2 Db5/2 Bb4/2 Db5/2 F5/4 Ab5/4', 'G5/2 Eb5/2 Bb4/2 Eb5/2 G5/4 Bb5/4', 'C6/4 Ab5/2 Eb5/2 G5/4 Eb5/2 C5/2', 'F5/2 Db5/2 C5/2 F5/2 Ab5/2 C6/2 Ab5/4',
      'Db5/2 F5/2 G5/2 Bb5/2 G5/2 F5/2 Db5/4', 'C5/2 E5/2 G5/2 Bb5/2 C6/4 Bb5/2 G5/2', 'Ab5/2 C6/2 Ab5/2 F5/2 C5/4 F5/2 Ab5/2', 'G5/4 C6/2 G5/2 E5/4 G5/2 Bb4/2',
    ],
    drum: { a: 'k.hhs.hkk.hhs.hh', f: 'k.hhs.hks.s.ssss' }, order: 'aaaaaaafaaaaaaaf',
  },
  // 刻守：速く、激しく。副旋律が下で支える（ニ短調）
  boss: {
    name: '刻守', bpm: 160, style: 'drive', echo: 3, boss: true,
    // 7 の和音、B♭→Gm7 の半小節の交代、C7（平行調の属七）、下がる低音（Dm→Dm/C）、宙づりの Asus4
    chords: 'Dm Bbmaj7 C A7 Dm Gm7 Bb|Gm7 A7 Bbmaj7 C7 Am7 Dm|Dm/C Gm7 C7 F Asus4|A7',
    lead: [
      'A4/3 D5/3 F5/2 A5/4 F5/2 E5/2', 'D5/3 F5/3 Bb5/6 F5/2 D5/2', 'E5/3 G5/3 C6/6 G5/2 F5/2', 'E5/6 D#5/1 D5/1 C#5/4 A4/4',
      'F5/2 C5/2 r/2 F5/2 A5/2 G5/2 F5/2 E5/2', 'G5/2 D5/2 r/2 G5/2 Bb5/2 A5/2 G5/2 F5/2', 'Bb5/4 F5/4 D5/4 F5/4', 'A5/6 G5/2 E5/4 C#5/4',
      'D5/6 F5/2 Bb5/4 A5/2 F5/2', 'E5/6 G5/2 C6/4 Bb5/2 G5/2', 'A5/4 E5/4 C5/4 E5/4', 'D5/8 F5/4 A5/4',
      'Bb5/4 A5/2 G5/2 D5/4 G5/4', 'C6/4 Bb5/2 G5/2 E5/4 C5/4', 'A5/6 F5/2 C5/4 F5/4', 'E5/4 A5/4 C#5/8',
    ],
    counter: [
      'F4/8 A4/8', 'F4/8 D4/8', 'E4/8 G4/8', 'E4/8 C#4/8', 'A4/4 F4/4 D4/8', 'Bb4/4 D4/4 G4/8', 'D4/8 F4/8', 'C#5/8 A4/8',
      'F4/4 Bb4/4 D5/8', 'G4/4 C5/4 E5/8', 'C5/8 A4/8', 'F4/8 A4/8', 'D4/8 G4/8', 'E4/8 G4/8', 'A4/8 C5/8', 'A4/8 E4/8',
    ],
    drum: { a: 'k.h.s.hkk.h.s.h.', b: 'k.hks.h.k.hks.hs', f: 'k.s.s.s.ssssssss' }, order: 'abababafabababaf',
  },
  // 白き刻守（最後の形）：悲しく、それでいて前へ進む（ロ短調）
  final: {
    name: '夜明けの楔', bpm: 150, style: 'anthem', echo: 3, boss: true,
    // 宙づりの Asus4、ナポリの和音（Cmaj7）から A7→D、下がる低音（D→Dmaj7/C#）、最後に F#sus4→F#7
    chords: 'Bm Gmaj7 D Asus4|A Bm Em7 Gmaj7 F#7 Gmaj7 A7 F#m7 Bm Cmaj7 A7 D|Dmaj7/C# F#sus4|F#7',
    lead: [
      'F#5/8 D5/4 B4/4', 'G5/8 D5/4 B4/4', 'D5/4 F#5/2 A5/2 F#5/4 E5/2 F#5/2', 'E5/10 D#5/1 D5/1 C#5/4',
      'D5/4 B4/2 D5/2 F#5/6 E5/2', 'G5/6 F#5/2 E5/4 B4/4', 'D5/2 E5/2 G5/4 B5/6 A5/2', 'A#5/4 F#5/4 C#5/4 F#5/4',
      'B5/4 A5/2 G5/2 D5/8', 'A5/4 G5/2 E5/2 C#5/8', 'F#5/4 A5/4 F#5/4 C#5/4', 'D5/6 C#5/2 B4/8',
      'G5/4 E5/4 B4/4 G5/4', 'A5/6 G5/2 E5/4 C#5/4', 'F#5/4 A5/4 D5/4 F#5/4', 'C#5/4 F#5/4 A#4/8',
    ],
    counter: [
      'D4/8 F#4/8', 'B4/8 G4/8', 'F#4/8 A4/8', 'E4/8 C#5/8', 'D5/8 B4/8', 'E4/8 G4/8', 'B4/8 D5/8', 'C#5/8 A#4/8',
      'G4/8 B4/8', 'A4/8 E4/8', 'A4/8 C#5/8', 'F#4/8 D4/8', 'B4/8 G4/8', 'A4/8 C#5/8', 'A4/8 F#4/8', 'B4/8 A#4/8',
    ],
    drum: { a: 'k...s.h.k.k.s.h.', b: 'k.h.s.h.k.hks.h.', f: 'k.s.k.s.s.ssssss' }, order: 'abababafabababaf',
  },
  // タイトル・戦いの無い部屋：夜明けを待つ時計塔。ゆっくり、オルゴールのように（ト短調）
  title: {
    name: '夜明けを待つ塔', bpm: 80, style: 'arp', echo: 4,
    // 宙づりの Dsus4 から D7、下がる低音（Gm→Gm/F→E♭maj7）、短調の ii–V（Am7♭5→D7）、平行調の B♭maj7・F7
    chords: 'Gm Ebmaj7 Cm7 Dsus4|D7 Gm Gm/F Ebmaj7 Am7b5|D7 Bbmaj7 F7 Ebmaj7 Cm7|D7 Gm Cm7 Am7b5 D7',
    lead: [
      'D5/6 Bb4/2 G4/8', 'Bb4/4 Eb5/4 G5/8', 'Eb5/6 C5/2 G4/8', 'A4/4 D5/4 C5/2 B4/1 Bb4/1 A4/4',
      'D5/4 G5/4 Bb5/6 A5/2', 'G5/6 Eb5/2 D5/8', 'Eb5/6 D5/2 Bb4/8', 'C5/4 Eb5/4 D5/4 F#4/4',
      'A4/4 D5/4 F5/8', 'Eb5/6 C5/2 A4/8', 'Bb4/4 G4/4 Eb5/8', 'G5/4 Eb5/4 D5/4 C5/4',
      'Bb4/6 A4/2 G4/8', 'C5/4 Eb5/4 G5/8', 'Eb5/4 C5/4 A4/4 C5/4', 'D5/6 C5/2 A4/4 F#4/4',
    ],
    drum: { a: 'k.......h.......', f: 'k.......h...h.h.' }, order: 'aaaaaaafaaaaaaaf',
  },
  // 戦いのあと：部屋を制圧したあとの静けさ。ゆっくり、やわらかく（ヘ長調）
  calm: {
    name: '静けさの間', bpm: 96, style: 'arp', echo: 4,
    // 下がっていくメジャー 7 の連なり（Fmaj7→Em7→Dm7→Cmaj7→B♭maj7…）、Gm7→C7 の ii–V、宙づりの Csus4
    chords: 'Fmaj7 Em7 Dm7 Cmaj7 Bbmaj7 Am7 Gm7 C7 Fmaj7 Am7 Bbmaj7 Gm7|C7 Am7 Dm7 Gm7 Csus4|C7',
    lead: [
      'A4/4 C5/4 E5/8', 'D5/6 B4/2 G4/8', 'A4/4 F4/4 C5/8', 'B4/6 G4/2 E4/8',
      'F4/4 A4/4 D5/8', 'C5/6 E5/2 G5/8', 'F5/4 D5/4 Bb4/8', 'E5/6 G5/2 C5/6 B4/1 Bb4/1',
      'A4/4 C5/4 F5/8', 'E5/6 C5/2 A4/8', 'D5/4 F5/4 A5/8', 'G5/6 E5/2 Bb4/8',
      'C5/4 E5/4 G5/8', 'F5/6 E5/2 D5/8', 'Bb4/4 D5/4 G5/8', 'F5/8 E5/8',
    ],
    drum: { a: 'k...h...h...h...', f: 'k...h...h.h.hhh.' }, order: 'aaaaaaafaaaaaaaf',
  },
};

// 和音の刻み方。bass は三角波の根音（o は 1 オクターブ上）、chord は和音の声部（通常 2 声・刻守 3 声）。
// [開始, 長さ, 度]（16 分音符単位）。度：3 = 3 度、5 = 5 度、7 = 7 度（三和音なら 5 度）、X = 7 度（三和音なら根音）
const OFF = [2, 6, 10, 14], SYNC = [0, 3, 6, 8, 11, 14], EIGHTS = [0, 2, 4, 6, 8, 10, 12, 14];
const BASS8 = EIGHTS.map((s, i) => [s, 2, i % 2 ? 'o' : 'r']);
export const CHORD_STYLES = {
  offbeat: { bass: BASS8, chord: [OFF.map((s) => [s, 1, 3]), OFF.map((s) => [s, 1, 7])] },
  motor: { bass: EIGHTS.map((s) => [s, 2, 'r']), chord: [Array.from({ length: 16 }, (_, i) => [i, 1, i % 2 ? 5 : 3]), [0, 4, 8, 12].map((s) => [s, 3, 'X'])] },
  pad: { bass: [[0, 8, 'r'], [8, 8, 'r']], chord: [[[0, 8, 3], [8, 8, 5]], [[0, 8, 7], [8, 8, 7]]] },
  drive: { bass: BASS8, chord: [SYNC.map((s) => [s, 2, 3]), SYNC.map((s) => [s, 2, 5]), SYNC.map((s) => [s, 2, 'X'])] },
  anthem: { bass: [[0, 2, 'r'], [2, 2, 'r'], [4, 2, 'o'], [6, 2, 'r'], [8, 2, 'r'], [10, 2, 'r'], [12, 2, 'o'], [14, 2, 'r']], chord: [[0, 4, 8, 12].map((s) => [s, 3, 3]), OFF.map((s) => [s, 2, 5]), [[0, 8, 'X'], [8, 8, 'X']]] },
  // 駆け足：低音は付点で跳ね、和音は 3 度と 7 度をシンコペーションで刻む（2 声）
  gallop: { bass: [[0, 2, 'r'], [3, 1, 'r'], [4, 2, 'o'], [6, 2, 'r'], [8, 2, 'r'], [11, 1, 'r'], [12, 2, 'o'], [14, 2, 'r']], chord: [SYNC.map((s) => [s, 2, 3]), SYNC.map((s) => [s, 2, 'X'])] },
  arp: { bass: [[0, 8, 'r'], [8, 8, 'r']], chord: [EIGHTS.map((s, i) => [s, 2, i % 2 ? 5 : 3]), [[0, 8, 7], [8, 8, 7]]] },
};

const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
// 'F#4' → 66
export function noteNum(s) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(s);
  if (!m) throw new Error('bad note ' + s);
  return PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (+m[3] + 1) * 12;
}
// コードの種類：根音からの距離（3 度・5 度・7 度の順。sus4 は 3 度の代わりに 4 度）
const QUALITY = { '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], m7b5: [0, 3, 6, 10], dim: [0, 3, 6], dim7: [0, 3, 6, 9], aug: [0, 4, 8], sus4: [0, 5, 7] };
const pcOf = (name) => (noteNum(name + '4') % 12 + 12) % 12;
// 'Am7/G' → { root: 9, bass: 7, tones: [9, 0, 4, 7] }（音名の数 0〜11。tones は根音・3 度・5 度・7 度）
export function chordTones(sym) {
  const m = /^([A-G][#b]?)(maj7|m7b5|m7|m|7|sus4|dim7|dim|aug)?(?:\/([A-G][#b]?))?$/.exec(sym);
  if (!m) throw new Error('bad chord ' + sym);
  const root = pcOf(m[1]);
  const tones = QUALITY[m[2] || ''].map((d) => (root + d) % 12);
  return { root, bass: m[3] ? pcOf(m[3]) : root, tones, sym };
}
// 旋律がその時に使える音：コードの音と、低音（分数コードの低音）
export const harmonyTones = (c) => (c.tones.includes(c.bass) ? c.tones : [...c.tones, c.bass]);
// 1 小節ぶんの旋律を [{ s, len, m }] に（s は曲の頭からの位置）
function parseBar(str, bar) {
  const out = [];
  let s = 0;
  for (const tok of str.trim().split(/\s+/)) {
    const [n, l] = tok.split('/'), len = +l;
    if (n !== 'r') out.push({ s: bar * 16 + s, len, m: noteNum(n) });
    s += len;
  }
  if (s !== 16) throw new Error(`bar ${bar + 1} has ${s} steps: ${str}`);
  return out;
}
// 範囲の中で、前の音にいちばん近い高さを選ぶ（滑らかな声部の進行）
function nearest(pc, prev, [lo, hi]) {
  let best = null;
  for (let m = lo; m <= hi; m++) if (m % 12 === pc && (best === null || Math.abs(m - prev) < Math.abs(best - prev))) best = m;
  return best;
}

// 曲を、声部ごとの音の並びに組み立てる
export function buildSong(id) {
  const song = SONGS[id];
  // 小節ごとに [前半, 後半] のコード
  const chords = song.chords.split(/\s+/).map((b) => { const [a, c] = b.split('|').map(chordTones); return [a, c || a]; });
  const bars = chords.length;
  const chordAt = (step) => chords[Math.floor(step / 16) % bars][step % 16 < 8 ? 0 : 1];
  const tracks = [];
  const lead = song.lead.flatMap(parseBar);
  // 音色：主旋律は「リード」、副旋律は「うつろ」（どちらも 4 ビットの波形表）。和音は矩形波（声ごとにデューティ比を変える）
  tracks.push({ part: 'lead', wave: 'reed', notes: lead });
  if (song.counter) tracks.push({ part: 'counter', wave: 'hollow', notes: song.counter.flatMap(parseBar) });
  const st = CHORD_STYLES[song.style];
  // 三角波の根音（o は 1 オクターブ上）
  const bass = [];
  let prevB = 50;
  for (let bar = 0; bar < bars; bar++) for (const [s, len, v] of st.bass) {
    const c = chordAt(bar * 16 + s);
    const r = nearest(v === 'o' ? c.root : c.bass, prevB, [RANGE.bass[0], RANGE.bass[0] + 11]); prevB = r;
    bass.push({ s: bar * 16 + s, len, m: v === 'o' ? r + 12 : r });
  }
  tracks.push({ part: 'bass', wave: 'triangle', notes: bass });
  // 矩形波の和音（3 度と、5 度か 7 度。7 の和音では 3 度と 7 度で響きの色を出す）。前の音に近い高さを選ぶ
  st.chord.forEach((pat, vi) => {
    const notes = [];
    let prev = 64;
    for (let bar = 0; bar < bars; bar++) for (const [s, len, deg] of pat) {
      const c = chordAt(bar * 16 + s);
      const pc = deg === 3 ? c.tones[1] : deg === 5 ? c.tones[2] : deg === 7 ? c.tones[3] ?? c.tones[2] : c.tones[3] ?? c.tones[0];
      const m = nearest(pc, prev, RANGE.chord); prev = m;
      notes.push({ s: bar * 16 + s, len, m });
    }
    tracks.push({ part: 'chord', wave: 'pulse', duty: [0.375, 0.25, 0.375][vi], notes });
  });
  // ドラム
  const drum = [];
  for (let bar = 0; bar < bars; bar++) {
    const pat = song.drum[song.order[bar % song.order.length]];
    [...pat].forEach((ch, i) => { if (ch !== '.') drum.push({ s: bar * 16 + i, len: 1, hit: ch }); });
  }
  // ドラムの音は次の打音までに切る（ドラムも同時に 1 音）
  drum.forEach((n, i) => { const next = i + 1 < drum.length ? drum[i + 1].s : bars * 16 + drum[0].s; n.len = next - n.s; });
  tracks.push({ part: 'drum', wave: 'noise', notes: drum });
  return { id, name: song.name, bpm: song.bpm, steps: bars * 16, chords, chordAt, echo: song.echo, tracks };
}

// その場面で流す曲（null は無音）
export function musicFor(game) {
  if (game.scene === 'title') return 'title';
  if (game.scene !== 'play' || !game.run || !game.room || !game.player) return null;
  if (game.player.state === 'dead') return null;
  const b = game.room.boss;
  if (game.room.desc.type === 'boss' && b) {
    if (b.finalForm) return b.defeated ? null : 'final';
    return b.defeated ? null : 'boss';
  }
  // 戦いを終えた部屋（制圧したあと）は、静かな曲に替わる
  const fight = ['combat', 'trial', 'elite', 'elite2'].includes(game.room.desc.type);
  if (game.room.cleared && fight) return 'calm';
  // 戦いの無い部屋（書庫・書斎・店・祠・鍛冶場・入口など）は、タイトルと同じ曲（敵が出ている間は階の曲）
  if (!fight && !game.room.enemies.some((e) => e.alive)) return 'title';
  // 上層の戦闘部屋は速い「鐘楼の剣戟」（「鐘楼へ」は戦いの無い部屋に敵が出た時の階の曲として残す）
  if (fight && game.run.fi >= 2) return 'bellfight';
  return ['market', 'gears', 'belfry'][Math.min(2, game.run.fi)];
}
