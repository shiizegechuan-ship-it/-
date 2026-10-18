import test from 'node:test';
import assert from 'node:assert/strict';
import { SONGS, RANGE, buildSong, musicFor, harmonyTones, chordTones } from '../src/songs.js';
import { Music } from '../src/music.js';
import { newGame } from './helpers.mjs';

const ids = Object.keys(SONGS);
const melodic = (s) => s.tracks.filter((t) => t.part === 'lead' || t.part === 'counter');

test('BGM の声部：通常の階と戦いのあとは主旋律 1・和音 3・ドラム 1、刻守は主旋律 1・副旋律 1・和音 4・ドラム 1', () => {
  for (const id of ids) {
    const s = buildSong(id), n = (p) => s.tracks.filter((t) => t.part === p).length;
    const chord = n('bass') + n('chord');
    if (SONGS[id].boss) assert.deepEqual([n('lead'), n('counter'), chord, n('drum')], [1, 1, 4, 1], id);
    else assert.deepEqual([n('lead'), n('counter'), chord, n('drum')], [1, 0, 3, 1], id);
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
        const inChord = harmonyTones(s.chordAt(n.s)).includes(n.m % 12);
        // 小節の頭と、コードが替わる所（小節の後半の頭）はかならずコードの音
        if (n.s % 8 === 0 && (n.s % 16 === 0 || s.chordAt(n.s) !== s.chordAt(n.s - 8))) assert.ok(inChord, `${id} ${t.part} bar ${Math.floor(n.s / 16) + 1} step ${n.s % 16}: ${n.m} on ${s.chordAt(n.s).sym}`);
        if (n.s % 4 === 0) { on++; if (inChord) ok++; }
      }
      assert.ok(ok / on >= 0.85, `${id} ${t.part} on-beat chord tones ${ok}/${on}`);
      for (let i = 1; i < t.notes.length; i++) assert.ok(Math.abs(t.notes[i].m - t.notes[i - 1].m) <= 9, `${id} ${t.part} leap at ${t.notes[i].s}`);
    }
    for (const t of s.tracks.filter((t) => t.part === 'bass' || t.part === 'chord')) for (const n of t.notes) assert.ok(harmonyTones(s.chordAt(n.s)).includes(n.m % 12), `${id} ${t.part} ${n.s}`);
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

test('場面ごとの曲：戦いのある部屋は各階の曲（上層は「鐘楼の剣戟」）、戦いの無い部屋とタイトルは「夜明けを待つ塔」、刻守・白き刻守。倒れた時・刻守を倒した直後は無音', () => {
  const g = newGame(5); g.startLoop(); g.modal = null;
  // 夜のはじめの入口（戦いの無い部屋）はタイトルと同じ曲
  assert.equal(g.room.desc.type, 'entry'); assert.equal(musicFor(g), 'title');
  // 書庫も同じ
  const fi = g.run.plan.floors.findIndex((fl) => fl.some((r) => r.type === 'archive'));
  if (fi >= 0) { g.enterRoom(fi, g.run.plan.floors[fi].findIndex((r) => r.type === 'archive')); g.modal = null; assert.equal(musicFor(g), 'title'); }
  g.run.fi = 0; g.room.desc = { type: 'combat' }; g.room.cleared = false;
  assert.equal(musicFor(g), 'market');
  g.run.fi = 1; assert.equal(musicFor(g), 'gears');
  g.run.fi = 2; assert.equal(musicFor(g), 'bellfight'); // 上層の戦闘部屋は戦闘向けの速い曲
  assert.ok(SONGS.bellfight.bpm >= 144, 'fast enough for a fight');
  // 戦いを終えた部屋は静かな曲
  const keep = g.room.desc; g.room.desc = { type: 'combat' }; g.room.cleared = true;
  assert.equal(musicFor(g), 'calm');
  g.room.cleared = false; assert.equal(musicFor(g), 'bellfight');
  g.room.desc = { type: 'shop' }; g.room.cleared = true; assert.equal(musicFor(g), 'title'); g.room.desc = keep;
  g.room.desc = { type: 'boss' }; g.room.boss = { defeated: false, finalForm: false };
  assert.equal(musicFor(g), 'boss');
  g.room.boss.defeated = true; assert.equal(musicFor(g), null);
  g.room.boss = { defeated: false, finalForm: true }; assert.equal(musicFor(g), 'final');
  g.player.state = 'dead'; assert.equal(musicFor(g), null);
  g.scene = 'title'; assert.equal(musicFor(g), 'title');
  g.scene = 'rewind'; assert.equal(musicFor(g), null);
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
    createBiquadFilter: () => ({ type: '', frequency: param(), Q: param(), connect() {} }),
  };
  return { ctx, nodes };
}

test('BGM の演奏：同時に鳴る音は通常の階と戦いのあとで 5 音まで、刻守で 7 音まで（エコーは数えない）。エコーとビブラートがある', () => {
  for (const [id, max] of [['market', 5], ['gears', 5], ['belfry', 5], ['bellfight', 5], ['calm', 5], ['title', 5], ['boss', 7], ['final', 7]]) {
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

test('BGM のコード進行には、哀愁と少し特殊な響きがある（7 の和音・宙づり・ナポリの和音・下っていく低音・王道進行）', () => {
  const all = (id) => buildSong(id).chords.flat();
  const has = (id, f) => all(id).some(f);
  for (const id of ids) {
    assert.ok(has(id, (c) => c.tones.length === 4), `${id}: seventh chords`);
    assert.ok(all(id).filter((c, i, a) => i === 0 || c.sym !== a[i - 1].sym).length >= 16, `${id}: enough chord changes`);
  }
  // ナポリの和音（主音から半音上の長和音）：白き刻守の Cmaj7
  const napo = buildSong('final').chords.flat().some((c) => c.root === 0 && c.tones[1] === 4);
  assert.ok(napo, 'Neapolitan chord in the final battle');
  // 短調の ii–V（m7♭5 → 7）
  assert.ok(ids.some((id) => has(id, (c) => /m7b5/.test(c.sym))));
  // 宙づり（sus4）と、分数コードで下っていく低音
  assert.ok(ids.filter((id) => has(id, (c) => /sus4/.test(c.sym))).length >= 3);
  assert.ok(ids.filter((id) => has(id, (c) => c.bass !== c.root)).length >= 3);
  // 王道進行（IV maj7 → V7 → iii m7 → vi m7）
  assert.match(SONGS.market.chords, /Fmaj7 G7 Em7 Am7/);
});

test('BGM：コードが小節の途中で替わる所で、伸ばしている音が新しいコードとぶつからない', () => {
  for (const id of ids) {
    const s = buildSong(id);
    for (const t of s.tracks) if (t.wave !== 'noise') for (const n of t.notes) for (let k = n.s + 1; k < n.s + n.len; k++) {
      if (s.chordAt(k) !== s.chordAt(k - 1)) assert.ok(harmonyTones(s.chordAt(k)).includes(n.m % 12), `${id} ${t.part} bar ${Math.floor(n.s / 16) + 1}`);
    }
  }
});

test('BGM の主旋律・副旋律は、同じ高さの音を続けて鳴らさない', () => {
  for (const id of ids) for (const t of melodic(buildSong(id))) for (let i = 1; i < t.notes.length; i++) {
    assert.notEqual(t.notes[i].m, t.notes[i - 1].m, `${id} ${t.part} bar ${Math.floor(t.notes[i].s / 16) + 1}`);
  }
});

test('BGM の音色とハイカット：主旋律はリード、副旋律はうつろ（4 ビットの波形表）、和音は 25%・37.5% の矩形波。BGM 全体にローパスを通す', async () => {
  const { HICUT } = await import('../src/music.js');
  const s = buildSong('boss');
  assert.equal(s.tracks.find((t) => t.part === 'lead').wave, 'reed');
  assert.equal(s.tracks.find((t) => t.part === 'counter').wave, 'hollow');
  assert.deepEqual(s.tracks.filter((t) => t.part === 'chord').map((t) => t.duty), [0.375, 0.25, 0.375]);
  const filters = [], waves = [];
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} });
  const ctx = {
    currentTime: 0, sampleRate: 8000, state: 'running',
    createGain: () => ({ gain: param(), connect() {}, disconnect() {} }),
    createOscillator: () => ({ frequency: param(), setPeriodicWave(w) { waves.push(w); }, connect() {}, start() {}, stop() {} }),
    createBufferSource: () => ({ connect() {}, start() {}, stop() {} }),
    createBuffer: (ch, len) => ({ getChannelData: () => new Float32Array(len) }),
    createPeriodicWave: (re, im) => ({ re, im }),
    createBiquadFilter: () => { const f = { type: '', frequency: param(), Q: param(), connect(to) { f.to = to; } }; filters.push(f); return f; },
  };
  const master = { connect() {} };
  const m = new Music({ ctx, master });
  for (let i = 0; i < 60; i++) { ctx.currentTime = i / 60; m.update('boss'); }
  assert.ok(filters.some((f) => f.type === 'lowpass' && f.frequency.value === HICUT && f.to === master), 'hi-cut in front of the output');
  assert.ok(HICUT <= 6000);
  for (const k of ['reed', 'hollow', 'triangle', 0.25, 0.375]) assert.ok(waves.includes(m.waves[k]), `uses ${k}`);
});

test('BGM：ドラムの音源は打つたびに止める（ループ音源が止まらずに溜まると、音が途切れ途切れになる）', () => {
  const { ctx, nodes } = fakeAudio();
  const m = new Music({ ctx, master: { connect() {} } });
  for (let i = 0; i < 60 * 10; i++) { ctx.currentTime = i / 60; m.update('market'); }
  const drums = nodes.filter((n) => n.part === 'drum');
  assert.ok(drums.length > 20);
  assert.ok(drums.every((n) => n.t1 > n.t0), 'every drum hit stops');
  // 描画が止まっても曲が続くよう、描画とは別のタイマーからも予約する
  assert.ok(m.timer, 'scheduler timer');
  clearInterval(m.timer);
});

test('BGM の主旋律には、コードの音どうしを半音でつなぐ経過音がある（拍の裏の短い音）', () => {
  for (const id of ids) {
    const lead = buildSong(id).tracks.find((t) => t.part === 'lead').notes;
    let n = 0;
    for (let i = 1; i + 1 < lead.length; i++) {
      const a = lead[i - 1], b = lead[i], c = lead[i + 1];
      if (b.len <= 1 && b.s % 4 !== 0 && Math.abs(b.m - a.m) === 1 && Math.abs(c.m - b.m) === 1 && Math.sign(b.m - a.m) === Math.sign(c.m - b.m)) n++;
    }
    assert.ok(n >= 1, `${id}: chromatic passing tones`);
  }
});
