import test from 'node:test';
import assert from 'node:assert/strict';
import { SONGS, RANGE, buildSong, musicFor } from '../src/songs.js';
import { Music } from '../src/music.js';
import { newGame } from './helpers.mjs';

const ids = Object.keys(SONGS);
const melodic = (s) => s.tracks.filter((t) => t.part === 'lead' || t.part === 'counter');

test('BGM の声部：通常の階は主旋律 1・和音 2・ドラム 1、刻守は主旋律 1・副旋律 1・和音 3・ドラム 1', () => {
  for (const id of ids) {
    const s = buildSong(id), n = (p) => s.tracks.filter((t) => t.part === p).length;
    const chord = n('bass') + n('chord');
    if (SONGS[id].boss) assert.deepEqual([n('lead'), n('counter'), chord, n('drum')], [1, 1, 3, 1], id);
    else assert.deepEqual([n('lead'), n('counter'), chord, n('drum')], [1, 0, 2, 1], id);
    // 声部の中で音は重ならない（1 声部 = 同時に 1 音）
    for (const t of s.tracks) for (let i = 1; i < t.notes.length; i++) assert.ok(t.notes[i].s >= t.notes[i - 1].s + t.notes[i - 1].len, `${id} ${t.part} overlap at ${t.notes[i].s}`);
  }
});

test('BGM の音の高さ：高すぎ・低すぎない範囲に収まる', () => {
  for (const id of ids) for (const t of buildSong(id).tracks) {
    if (t.wave === 'noise') continue;
    const [lo, hi] = RANGE[t.part];
    for (const n of t.notes) assert.ok(n.m >= lo && n.m <= hi, `${id} ${t.part} ${n.m}`);
  }
});

test('BGM のコード進行：旋律の小節の頭はコードの音、拍の頭もほとんどコードの音。和音はコードの音だけ。跳躍は 9 半音まで', () => {
  for (const id of ids) {
    const s = buildSong(id);
    for (const t of melodic(s)) {
      let on = 0, ok = 0;
      for (const n of t.notes) {
        const c = s.chords[Math.floor(n.s / 16)], inChord = c.tones.includes(n.m % 12);
        if (n.s % 16 === 0) assert.ok(inChord, `${id} ${t.part} bar ${n.s / 16 + 1} starts on a chord tone`);
        if (n.s % 4 === 0) { on++; if (inChord) ok++; }
      }
      assert.ok(ok / on >= 0.85, `${id} ${t.part} on-beat chord tones ${ok}/${on}`);
      for (let i = 1; i < t.notes.length; i++) assert.ok(Math.abs(t.notes[i].m - t.notes[i - 1].m) <= 9, `${id} ${t.part} leap at ${t.notes[i].s}`);
    }
    for (const t of s.tracks.filter((t) => t.part === 'bass' || t.part === 'chord')) for (const n of t.notes) assert.ok(s.chords[Math.floor(n.s / 16)].tones.includes(n.m % 12), `${id} ${t.part} ${n.s}`);
  }
});

test('BGM の主旋律は曲どうしで似ない（同じ音の動きが 6 音続く所がない）', () => {
  const grams = (s) => { const t = s.tracks.find((x) => x.part === 'lead').notes; const iv = t.slice(1).map((n, i) => n.m - t[i].m); const g = new Set(); for (let i = 0; i + 5 <= iv.length; i++) g.add(iv.slice(i, i + 5).join(',')); return g; };
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const a = grams(buildSong(ids[i])), b = grams(buildSong(ids[j]));
    const same = [...a].filter((x) => b.has(x));
    assert.equal(same.length, 0, `${ids[i]} vs ${ids[j]}: ${same}`);
  }
});

test('場面ごとの曲：各階・刻守・白き刻守。タイトル・倒れた時・刻守を倒した直後は無音', () => {
  const g = newGame(5); g.startLoop(); g.modal = null;
  assert.equal(musicFor(g), 'market');
  g.run.fi = 1; assert.equal(musicFor(g), 'gears');
  g.run.fi = 2; assert.equal(musicFor(g), 'belfry');
  g.room.desc = { type: 'boss' }; g.room.boss = { defeated: false, finalForm: false };
  assert.equal(musicFor(g), 'boss');
  g.room.boss.defeated = true; assert.equal(musicFor(g), null);
  g.room.boss = { defeated: false, finalForm: true }; assert.equal(musicFor(g), 'final');
  g.player.state = 'dead'; assert.equal(musicFor(g), null);
  g.scene = 'title'; assert.equal(musicFor(g), null);
});

// 鳴らした音を記録するだけの、偽の音の出口
function fakeAudio() {
  const nodes = [];
  const param = () => ({ value: 0, events: 0, setValueAtTime() { this.events++; }, linearRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} });
  const ctx = {
    currentTime: 0, sampleRate: 8000, state: 'running',
    createGain: () => ({ gain: param(), connect() {}, disconnect() {} }),
    createOscillator: () => { const o = { frequency: param(), setPeriodicWave() {}, connect() {}, start(t) { o.t0 = t; }, stop(t) { o.t1 = t; } }; nodes.push(o); return o; },
    createBufferSource: () => { const o = { connect() {}, start(t) { o.t0 = t; }, stop(t) { o.t1 = t; } }; nodes.push(o); return o; },
    createBuffer: (ch, len) => ({ getChannelData: () => new Float32Array(len) }),
    createPeriodicWave: () => ({}),
  };
  return { ctx, nodes };
}

test('BGM の演奏：同時に鳴る音は通常の階で 4 音まで、刻守で 6 音まで（エコーは数えない）。エコーとビブラートがある', () => {
  for (const [id, max] of [['market', 4], ['gears', 4], ['belfry', 4], ['boss', 6], ['final', 6]]) {
    const { ctx, nodes } = fakeAudio();
    const m = new Music({ ctx, master: { connect() {} } });
    globalThis.setTimeout ??= () => {};
    for (let i = 0; i < 60 * 30; i++) { ctx.currentTime = i / 60; m.update(id); }
    const parts = nodes.filter((n) => n.part !== 'echo');
    // 音の始まりごとに、その時に鳴っている音を数える
    let peak = 0;
    for (const a of parts) peak = Math.max(peak, parts.filter((b) => b.t0 <= a.t0 + 1e-9 && b.t1 > a.t0 + 1e-9).length);
    assert.ok(peak <= max, `${id}: ${peak} voices at once`);
    assert.ok(peak >= max - 1, `${id}: uses its voices (${peak})`);
    assert.ok(nodes.some((n) => n.part === 'echo'), `${id}: echo`);
    assert.ok(nodes.some((n) => n.part === 'lead' && n.frequency.events > 3), `${id}: stepped vibrato`);
  }
});
