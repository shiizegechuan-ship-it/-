// BGM の楽譜（DOM に依存しない。テストからも読める）。音はすべてビット音（矩形波・三角波・ノイズ）。
//
// 声部の数（エコーは数えない）
//   通常の階：主旋律 1・和音 2・ドラム 1
//   刻守の部屋：主旋律 1・副旋律 1・和音 3・ドラム 1
//
// 書き方
//   chords：1 小節に 1 つのコード（16 小節で 1 周）
//   lead / counter：1 小節ずつ「音名/長さ」を空白で並べる。長さは 16 分音符の数（1 小節 = 16）。r は休符
//   style：和音の刻み方（下の CHORD_STYLES）
//   drum：1 小節 16 文字。k キック・s スネア・h ハイハット・o 開いたハイハット・. 休み。order で小節ごとに選ぶ

export const RANGE = { lead: [60, 84], counter: [55, 76], bass: [45, 69], chord: [55, 72] }; // 高すぎ・低すぎを避ける（MIDI 番号。60 = C4）

export const SONGS = {
  // 下層・市場：夜の市場。少し怪しく、軽やか（イ短調）
  market: {
    name: '夜市の灯', bpm: 132, style: 'offbeat', echo: 3,
    chords: 'Am F C G Am F Dm E F G Em Am Dm G C E',
    lead: [
      'E5/4 A4/2 C5/2 E5/2 D5/2 C5/4', 'F5/6 E5/2 C5/4 A4/4', 'G4/2 C5/2 E5/4 G5/4 E5/2 C5/2', 'D5/6 B4/2 G4/8',
      'A4/2 C5/2 E5/2 A5/4 G5/2 E5/4', 'F5/4 E5/2 F5/2 A5/4 F5/4', 'D5/4 F5/4 A5/4 G5/2 F5/2', 'E5/6 D5/2 B4/4 G#4/4',
      'C5/2 A4/2 C5/2 F5/6 E5/4', 'D5/2 B4/2 D5/2 G5/6 F5/4', 'E5/4 G5/4 B5/4 G5/4', 'A5/8 E5/4 C5/4',
      'F5/2 E5/2 D5/4 A4/4 D5/4', 'B4/2 C5/2 D5/4 G5/4 F5/4', 'E5/4 G5/2 E5/2 C5/4 E5/4', 'B4/8 G#4/4 E4/4',
    ],
    drum: { a: 'k.h.s.h.k.k.s.h.', f: 'k.h.s.h.s.s.ssss' }, order: 'aaaaaaafaaaaaaaf',
  },
  // 中層・歯車回廊：歯車が噛み合うように刻む（ホ短調）
  gears: {
    name: '歯車の回廊', bpm: 144, style: 'motor', echo: 2,
    chords: 'Em C D Bm Em C Am B C D Bm Em Am D G B',
    lead: [
      'B4/2 E5/2 G5/2 E5/2 B4/2 E5/2 F#5/2 G5/2', 'G5/4 E5/2 C5/2 G4/4 C5/4', 'F#5/2 A5/2 F#5/2 D5/2 A4/4 D5/4', 'F#5/4 B4/4 D5/8',
      'E5/2 G5/2 B5/2 G5/2 E5/2 G5/2 A5/2 B5/2', 'C6/6 G5/2 E5/4 C5/4', 'A5/2 G5/2 E5/2 C5/2 E5/4 A4/4', 'F#5/6 D#5/2 B4/8',
      'E5/2 r/2 E5/2 G5/2 C6/4 G5/4', 'F#5/2 r/2 F#5/2 A5/2 F#5/4 D5/4', 'D5/2 F#5/2 B5/4 F#5/2 E5/2 D5/4', 'E5/12 r/4',
      'C5/2 E5/2 A5/4 E5/2 G5/2 A5/4', 'A5/4 F#5/4 D5/4 E5/2 F#5/2', 'G5/2 D5/2 B4/2 D5/2 G5/2 B5/2 A5/4', 'B5/4 F#5/4 D#5/4 B4/4',
    ],
    drum: { a: 'k.hhs.hhk.hhs.hh', f: 'k.hhs.hhs.s.ssss' }, order: 'aaaaaaafaaaaaaaf',
  },
  // 上層・鐘楼：重く、厳かに。長い音と鐘のような高い矩形波（ハ短調）
  belfry: {
    name: '鐘楼へ', bpm: 116, style: 'pad', echo: 4, duty: 0.125,
    chords: 'Cm Ab Bb G Cm Fm Ab G Ab Bb Gm Cm Fm Bb Eb G',
    lead: [
      'G4/4 C5/4 Eb5/8', 'C5/6 Bb4/2 Ab4/8', 'F5/4 D5/4 Bb4/4 C5/2 D5/2', 'D5/12 B4/4',
      'Eb5/4 G5/4 C6/6 Bb5/2', 'Ab5/8 F5/4 C5/4', 'Eb5/6 F5/2 Eb5/4 C5/4', 'D5/8 B4/8',
      'C5/4 Eb5/4 Ab5/8', 'Bb5/6 Ab5/2 F5/8', 'G5/4 F5/2 D5/2 Bb4/4 D5/4', 'C5/16',
      'F5/6 Ab5/2 C6/8', 'Bb5/8 F5/4 D5/4', 'Eb5/4 G5/4 Bb5/6 G5/2', 'B4/4 D5/4 G5/8',
    ],
    drum: { a: 'k...h...s...h...', f: 'k...h...s.s.sss.' }, order: 'aaaaaaafaaaaaaaf',
  },
  // 刻守：速く、激しく。副旋律が下で支える（ニ短調）
  boss: {
    name: '刻守', bpm: 160, style: 'drive', echo: 3, boss: true,
    chords: 'Dm Bb C A Dm Gm Bb A Bb C Am Dm Gm C F A',
    lead: [
      'A4/3 D5/3 F5/2 A5/4 F5/2 D5/2', 'D5/3 F5/3 Bb5/6 F5/2 D5/2', 'E5/3 G5/3 C6/6 G5/2 E5/2', 'E5/4 C#5/4 A4/4 E5/4',
      'F5/2 F5/2 r/2 F5/2 A5/2 G5/2 F5/2 E5/2', 'G5/2 G5/2 r/2 G5/2 Bb5/2 A5/2 G5/2 F5/2', 'Bb5/4 F5/4 D5/4 F5/4', 'A5/6 G5/2 E5/4 C#5/4',
      'D5/6 F5/2 Bb5/4 A5/2 F5/2', 'E5/6 G5/2 C6/4 Bb5/2 G5/2', 'A5/4 E5/4 C5/4 E5/4', 'D5/8 F5/4 A5/4',
      'Bb5/4 A5/2 G5/2 D5/4 G5/4', 'C6/4 Bb5/2 G5/2 E5/4 C5/4', 'A5/6 F5/2 C5/4 F5/4', 'E5/4 A5/4 C#5/8',
    ],
    counter: [
      'F4/8 A4/8', 'F4/8 D4/8', 'E4/8 G4/8', 'E4/8 C#4/8', 'A4/4 F4/4 D4/8', 'Bb4/4 G4/4 D4/8', 'D4/8 F4/8', 'C#5/8 A4/8',
      'F4/4 Bb4/4 D5/8', 'G4/4 C5/4 E5/8', 'C5/8 A4/8', 'F4/8 D4/8', 'D4/8 G4/8', 'E4/8 G4/8', 'C5/8 A4/8', 'A4/8 E4/8',
    ],
    drum: { a: 'k.h.s.hkk.h.s.h.', b: 'k.hks.h.k.hks.hs', f: 'k.s.s.s.ssssssss' }, order: 'abababafabababaf',
  },
  // 白き刻守（最後の形）：悲しく、それでいて前へ進む（ロ短調）
  final: {
    name: '夜明けの楔', bpm: 150, style: 'anthem', echo: 3, boss: true, duty: 0.25,
    chords: 'Bm G D A Bm Em G F# G A F#m Bm Em A D F#',
    lead: [
      'F#5/8 D5/4 B4/4', 'G5/8 D5/4 B4/4', 'D5/4 F#5/2 A5/2 F#5/4 E5/2 F#5/2', 'E5/12 C#5/4',
      'D5/4 B4/2 D5/2 F#5/6 E5/2', 'G5/6 F#5/2 E5/4 B4/4', 'D5/2 E5/2 G5/4 B5/6 A5/2', 'A#5/4 F#5/4 C#5/4 F#5/4',
      'B5/4 A5/2 G5/2 D5/8', 'A5/4 G5/2 E5/2 C#5/8', 'F#5/4 A5/4 F#5/4 C#5/4', 'D5/6 C#5/2 B4/8',
      'G5/4 E5/4 B4/4 G5/4', 'A5/6 G5/2 E5/4 C#5/4', 'F#5/4 A5/4 D5/4 F#5/4', 'C#5/4 F#5/4 A#4/8',
    ],
    counter: [
      'D4/8 F#4/8', 'B4/8 G4/8', 'F#4/8 A4/8', 'E4/8 C#5/8', 'D5/8 B4/8', 'E4/8 G4/8', 'B4/8 D5/8', 'C#5/8 A#4/8',
      'G4/8 B4/8', 'E4/8 A4/8', 'A4/8 C#5/8', 'F#4/8 D4/8', 'B4/8 G4/8', 'C#5/8 A4/8', 'A4/8 F#4/8', 'A#4/8 C#5/8',
    ],
    drum: { a: 'k...s.h.k.k.s.h.', b: 'k.h.s.h.k.hks.h.', f: 'k.s.k.s.s.ssssss' }, order: 'abababafabababaf',
  },
};

// 和音の刻み方。bass は三角波の根音、chord は矩形波（通常 1 声・刻守 2 声）。[開始, 長さ, 声] の並び（16 分音符単位）
export const CHORD_STYLES = {
  offbeat: { bass: [[0, 2, 'r'], [2, 2, 'o'], [4, 2, 'r'], [6, 2, 'o'], [8, 2, 'r'], [10, 2, 'o'], [12, 2, 'r'], [14, 2, 'o']], chord: [[[2, 1, 3], [6, 1, 5], [10, 1, 3], [14, 1, 5]]] },
  motor: { bass: [0, 2, 4, 6, 8, 10, 12, 14].map((s) => [s, 2, 'r']), chord: [Array.from({ length: 16 }, (_, i) => [i, 1, i % 2 ? 5 : 3])] },
  pad: { bass: [[0, 8, 'r'], [8, 8, 'r']], chord: [[[0, 8, 3], [8, 8, 5]]] },
  drive: { bass: [[0, 2, 'r'], [2, 2, 'o'], [4, 2, 'r'], [6, 2, 'o'], [8, 2, 'r'], [10, 2, 'o'], [12, 2, 'r'], [14, 2, 'o']], chord: [[0, 3, 6, 8, 11, 14].map((s) => [s, 2, 3]), [0, 3, 6, 8, 11, 14].map((s) => [s, 2, 5])] },
  anthem: { bass: [[0, 2, 'r'], [2, 2, 'r'], [4, 2, 'o'], [6, 2, 'r'], [8, 2, 'r'], [10, 2, 'r'], [12, 2, 'o'], [14, 2, 'r']], chord: [[[0, 3, 3], [4, 3, 3], [8, 3, 3], [12, 3, 3]], [[2, 2, 5], [6, 2, 5], [10, 2, 5], [14, 2, 5]]] },
};

const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
// 'F#4' → 66
export function noteNum(s) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(s);
  if (!m) throw new Error('bad note ' + s);
  return PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (+m[3] + 1) * 12;
}
// 'F#m' → { root: 6, tones: [6, 9, 1] }（音名の数 0〜11）
export function chordTones(sym) {
  const m = /^([A-G][#b]?)(m?)$/.exec(sym);
  if (!m) throw new Error('bad chord ' + sym);
  const root = (noteNum(m[1] + '4') % 12 + 12) % 12;
  return { root, tones: [root, (root + (m[2] ? 3 : 4)) % 12, (root + 7) % 12] };
}
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
  const chords = song.chords.split(/\s+/).map(chordTones);
  const bars = chords.length;
  const tracks = [];
  const lead = song.lead.flatMap(parseBar);
  tracks.push({ part: 'lead', wave: 'pulse', duty: song.duty || 0.5, notes: lead });
  if (song.counter) tracks.push({ part: 'counter', wave: 'pulse', duty: 0.25, notes: song.counter.flatMap(parseBar) });
  const st = CHORD_STYLES[song.style];
  // 三角波の根音（o は 1 オクターブ上）
  const bass = [];
  let prevB = 50;
  chords.forEach((c, bar) => {
    const r = nearest(c.root, prevB, [RANGE.bass[0], RANGE.bass[0] + 11]); prevB = r;
    for (const [s, len, v] of st.bass) bass.push({ s: bar * 16 + s, len, m: v === 'o' ? r + 12 : r });
  });
  tracks.push({ part: 'bass', wave: 'triangle', notes: bass });
  // 矩形波の和音（3 度・5 度。前の音に近い高さを選ぶ）
  st.chord.forEach((pat) => {
    const notes = [];
    let prev = 64;
    chords.forEach((c, bar) => {
      for (const [s, len, deg] of pat) {
        const pc = c.tones[deg === 3 ? 1 : deg === 5 ? 2 : 0];
        const m = nearest(pc, prev, RANGE.chord); prev = m;
        notes.push({ s: bar * 16 + s, len, m });
      }
    });
    tracks.push({ part: 'chord', wave: 'pulse', duty: 0.25, notes });
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
  return { id, name: song.name, bpm: song.bpm, steps: bars * 16, chords, echo: song.echo, tracks };
}

// その場面で流す曲（null は無音）
export function musicFor(game) {
  if (game.scene !== 'play' || !game.run || !game.room || !game.player) return null;
  if (game.player.state === 'dead') return null;
  const b = game.room.boss;
  if (game.room.desc.type === 'boss' && b) {
    if (b.finalForm) return b.defeated ? null : 'final';
    return b.defeated ? null : 'boss';
  }
  return ['market', 'gears', 'belfry'][Math.min(2, game.run.fi)];
}
