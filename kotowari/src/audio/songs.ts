/** BGM の譜面。度数は都節音階（0=D 1=E♭ 2=G 3=A 4=B♭、5 で 1 オクターブ上）。1 歩 = 16 分音符 */
export type Inst = 'koto' | 'shaku' | 'taiko' | 'kane' | 'drone';
export type Note = [step: number, degree: number, len: number, vel?: number];
export interface Track {
  inst: Inst;
  oct?: number;
  gain?: number;
  notes: Note[];
}
export interface Song {
  bpm: number;
  length: number;
  tracks: Track[];
}

/** 「度数 長さ」を並べた旋律を Note[] に（'r' は休み） */
function seq(start: number, items: (string | number)[][]): Note[] {
  const out: Note[] = [];
  let s = start;
  for (const it of items) {
    const [d, len, vel] = it as [string | number, number, number?];
    if (d !== 'r') out.push([s, Number(d), len, vel]);
    s += len;
  }
  return out;
}
const every = (n: number, len: number, deg: number, from = 0, to = 9999, vel = 1): Note[] => {
  const out: Note[] = [];
  for (let s = from; s < Math.min(to, 9999); s += n) out.push([s, deg, len, vel]);
  return out;
};

export const SONGS: Record<string, Song> = {
  // 明けずの夜（タイトル）
  title: {
    bpm: 66,
    length: 128,
    tracks: [
      { inst: 'drone', oct: -1, notes: [[0, 0, 64], [64, 0, 32], [96, -2, 32]] },
      {
        inst: 'koto',
        notes: [
          ...seq(0, [[0, 2], [2, 2], [3, 2], [5, 2], [4, 4], [3, 4]]),
          ...seq(16, [[0, 2], [2, 2], [3, 2], [2, 2], [1, 8]]),
          ...seq(32, [[-1, 2], [0, 2], [2, 2], [3, 2], [4, 4], [5, 4]]),
          ...seq(48, [[4, 2], [3, 2], [2, 4], [0, 8]]),
          ...seq(64, [[5, 2], [7, 2], [8, 2], [7, 2], [5, 4], [4, 4]]),
          ...seq(80, [[3, 2], [4, 2], [3, 2], [2, 2], [1, 8]]),
          ...seq(96, [[0, 2], [1, 2], [2, 2], [3, 2], [2, 4], [0, 4]]),
          ...seq(112, [[-1, 4], [0, 12]]),
        ],
      },
      { inst: 'shaku', notes: seq(0, [['r', 32], [7, 12], [5, 4], [8, 16], ['r', 16], [7, 8], [5, 8], [3, 16], [5, 16]]) },
      { inst: 'kane', oct: 1, gain: 0.7, notes: [[0, 0, 1], [64, 2, 1]] },
    ],
  },
  // 夜祭り（序章）
  festival: {
    bpm: 100,
    length: 64,
    tracks: [
      {
        inst: 'taiko',
        notes: [
          ...every(16, 1, 0, 0),
          ...every(16, 1, 0, 6, 9999, 0.6),
          ...every(16, 1, 1, 10, 9999, 0.5),
          ...every(16, 1, 1, 12, 9999, 0.35),
          ...every(16, 1, 1, 14, 9999, 0.5),
        ],
      },
      { inst: 'kane', oct: 1, gain: 0.8, notes: [...every(8, 1, 7, 4, 9999, 0.6)] },
      {
        inst: 'shaku',
        oct: 1,
        gain: 0.8,
        notes: seq(0, [[2, 2], [3, 2], [5, 4], [3, 2], [2, 2], [0, 4], [2, 2], [3, 2], [4, 2], [3, 2], [2, 8], [5, 2], [7, 2], [8, 4], [7, 2], [5, 2], [3, 4], [4, 2], [3, 2], [2, 2], [0, 2], [2, 8]]),
      },
      { inst: 'koto', notes: [...every(16, 2, 0, 0), ...every(16, 2, 2, 8), ...every(32, 2, 3, 4), ...every(32, 2, -1, 20)] },
      { inst: 'drone', oct: -1, gain: 0.7, notes: [[0, 0, 32], [32, -3, 32]] },
    ],
  },
  // 千段石段（一の章）
  cedar: {
    bpm: 84,
    length: 128,
    tracks: [
      { inst: 'drone', oct: -1, notes: [[0, 0, 64], [64, -2, 64]] },
      {
        inst: 'koto',
        gain: 0.9,
        notes: [
          ...[0, 32, 64, 96].flatMap((b) =>
            seq(b, [[0, 2], [3, 2], [5, 2], [3, 2], [2, 2], [5, 2], [7, 2], [5, 2], [1, 2], [3, 2], [5, 2], [3, 2], [2, 2], [3, 2], [4, 2], [3, 2]]).map(
              (n): Note => (b >= 64 ? [n[0], n[1] - 2, n[2], 0.9] : n),
            ),
          ),
        ],
      },
      {
        inst: 'shaku',
        notes: seq(0, [['r', 16], [7, 8], [8, 4], [7, 4], [5, 12], [3, 4], [4, 16], ['r', 16], [5, 8], [3, 4], [4, 4], [2, 8], [0, 8], [1, 16]]),
      },
      { inst: 'taiko', gain: 0.7, notes: [...every(32, 1, 0, 0), ...every(32, 1, 0, 20, 9999, 0.5), ...every(64, 1, 1, 28, 9999, 0.4)] },
    ],
  },
  // 風鳴りの竹林（二の章）：尺八が主、箏は跳ねる刻み
  bamboo: {
    bpm: 92,
    length: 128,
    tracks: [
      { inst: 'drone', oct: -1, notes: [[0, 2, 64], [64, 0, 64]] },
      {
        inst: 'koto',
        gain: 0.8,
        notes: [0, 16, 32, 48, 64, 80, 96, 112].flatMap((b, i) =>
          seq(b, [[i < 4 ? 2 : 0, 2], [5, 1], [7, 1], [i < 4 ? 3 : 2, 2], [5, 2], [7, 2], [8, 2], [7, 2], [5, 2]]),
        ),
      },
      {
        inst: 'shaku',
        gain: 1.1,
        notes: seq(0, [[7, 6], [8, 2], [10, 8], [8, 4], [7, 4], [5, 8], ['r', 8], [7, 4], [5, 4], [3, 8], [2, 8], [3, 4], [5, 4], [7, 16], ['r', 8], [10, 4], [12, 4], [10, 8], [8, 8]]),
      },
      { inst: 'taiko', gain: 0.6, notes: [...every(16, 1, 1, 0), ...every(32, 1, 0, 8), ...every(16, 1, 1, 14, 9999, 0.4)] },
      { inst: 'kane', oct: 1, gain: 0.5, notes: every(32, 1, 5, 24) },
    ],
  },
  // 影灯籠の宿場（三の章）：静かで不穏。箏の低いオスティナートと、間を空けた鉦
  town: {
    bpm: 76,
    length: 128,
    tracks: [
      { inst: 'drone', oct: -1, notes: [[0, 1, 32], [32, 0, 32], [64, 1, 32], [96, -2, 32]] },
      {
        inst: 'koto',
        oct: -1,
        gain: 0.9,
        notes: [0, 16, 32, 48, 64, 80, 96, 112].flatMap((b) => seq(b, [[0, 3], [1, 3], [3, 2], [1, 4], [0, 4]])),
      },
      {
        inst: 'koto',
        gain: 0.7,
        notes: seq(8, [[6, 8], [5, 8], [8, 16], [7, 8], [6, 24], [10, 8], [8, 8], [6, 16], [5, 24]]),
      },
      { inst: 'kane', oct: 0, gain: 0.6, notes: [[0, 1, 1], [40, 3, 1], [72, 1, 1], [104, 0, 1]] },
      { inst: 'shaku', gain: 0.7, notes: seq(64, [[3, 12], [1, 4], [0, 16], ['r', 8], [1, 8], [3, 8], [4, 16]]) },
    ],
  },
  // 狐の質屋（質屋の画面）
  okon: {
    bpm: 96,
    length: 64,
    tracks: [
      {
        inst: 'koto',
        notes: seq(0, [[5, 1], [7, 1], [8, 2], [7, 2], [5, 2], [4, 2], [5, 4], ['r', 2], [3, 1], [4, 1], [5, 2], [4, 2], [3, 2], [2, 2], [3, 4], ['r', 2], [5, 1], [7, 1], [8, 2], [10, 2], [8, 2], [7, 2], [5, 4], [4, 2], [3, 2], [2, 2], [1, 2], [0, 8]]),
      },
      { inst: 'kane', oct: 1, gain: 0.8, notes: [...every(16, 1, 5, 0), ...every(16, 1, 7, 8, 9999, 0.6)] },
      { inst: 'drone', oct: -1, gain: 0.6, notes: [[0, 0, 32], [32, 2, 32]] },
      { inst: 'taiko', gain: 0.4, notes: [...every(16, 1, 1, 4), ...every(16, 1, 1, 12, 9999, 0.6)] },
    ],
  },
  // 静けさ（会話の多い場面・つづく）
  still: {
    bpm: 60,
    length: 64,
    tracks: [
      { inst: 'drone', oct: -1, gain: 0.8, notes: [[0, 0, 64]] },
      { inst: 'koto', gain: 0.8, notes: seq(0, [[5, 8], [3, 8], [4, 8], [2, 8], [3, 8], [1, 8], [0, 16]]) },
    ],
  },
};
