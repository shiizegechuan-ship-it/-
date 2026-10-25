import { PALETTE_LIST, hexToRgb } from './palette';

/** 後処理：輪郭 → パレット量子化（ベイヤー）→ 特殊効果。内部解像度で 1 回だけ走る。 */
export const POST_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const pal = PALETTE_LIST.map((h) => {
  const [r, g, b] = hexToRgb(h);
  return `vec3(${r.toFixed(4)}, ${g.toFixed(4)}, ${b.toFixed(4)})`;
}).join(',\n  ');

export const POST_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform sampler2D tPrev;   // 前のコマの出力（データモッシュ）
uniform sampler2D tSnap;   // 保存したコマ（ルーマ・キー遷移・シネマグラフ）
uniform vec2 uRes;
uniform float uTime;
uniform float uNear;
uniform float uFar;
uniform float uDither;
uniform float uOutline;
uniform float uMosh;       // データモッシュ 0..1
uniform float uSort;       // ピクセルソート 0..1
uniform float uLumaKey;    // ルーマ・キー遷移のしきい値（<0 で無効）
uniform float uCinema;     // シネマグラフ 0/1
uniform float uAcid;       // ルマ・フェード・アシッド 0..1
uniform float uFlash;      // テクスチャフラッシュ 0..1
uniform float uFade;       // 暗転 0..1
uniform vec3 uFadeColor;
uniform float uVignette;
uniform float uSeed;
uniform float uPulse;     // 鼓動の脈（打つたびに 1 → 0）
uniform float uTension;   // 張りつめ（刻限が迫るほど 1 に近い）

const int NPAL = ${PALETTE_LIST.length};
const vec3 PAL[NPAL] = vec3[NPAL](
  ${pal}
);

float bayer4(vec2 p) {
  int x = int(mod(p.x, 4.0));
  int y = int(mod(p.y, 4.0));
  int i = x + y * 4;
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(m[i]) + 0.5) / 16.0 - 0.5;
}
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
float linDepth(float d) {
  float z = d * 2.0 - 1.0;
  return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + uSeed) * 43758.5453); }

// 明るさ（Y）と色み（U・V）に分けて比べる。暗い所でも色相が飛ばないよう、色みを重く見る
vec3 yuv(vec3 c) {
  float y = dot(c, vec3(0.299, 0.587, 0.114));
  return vec3(y, (c.b - y) * 0.565, (c.r - y) * 0.713);
}
vec3 quantize(vec3 c, vec2 px) {
  c += bayer4(px) * uDither;
  vec3 q = yuv(c);
  float best = 1e9; vec3 outc = PAL[0];
  for (int i = 0; i < NPAL; i++) {
    vec3 d = q - yuv(PAL[i]);
    float e = d.x * d.x + (d.y * d.y + d.z * d.z) * 1.7;
    if (e < best) { best = e; outc = PAL[i]; }
  }
  return outc;
}

vec3 hueRot(vec3 c, float a) {
  const vec3 k = vec3(0.57735);
  float ca = cos(a);
  return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}

vec3 toSrgb(vec3 c) {
  c = max(c, 0.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
vec4 sceneAt(vec2 uv) { vec4 c = texture2D(tColor, uv); return vec4(toSrgb(c.rgb), c.a); }

void main() {
  // 脈打つたびに、わずかに膨らむ
  vec2 UV = 0.5 + (vUv - 0.5) * (1.0 - uPulse * 0.018);
  vec2 px = floor(UV * uRes);
  vec2 texel = 1.0 / uRes;
  vec4 src = sceneAt(UV);
  vec3 col = src.rgb;
  bool glow = src.a < 0.75 && src.a > 0.35;
  bool live = src.a <= 0.35; // シネマグラフで動く部分（灯の火など）

  // 輪郭：周りに明らかに手前の画素があれば、自分は輪郭（外側に 1px）
  float dc = linDepth(texture2D(tDepth, UV).r);
  float dn = min(min(linDepth(texture2D(tDepth, UV + vec2(texel.x, 0.0)).r), linDepth(texture2D(tDepth, UV - vec2(texel.x, 0.0)).r)),
                 min(linDepth(texture2D(tDepth, UV + vec2(0.0, texel.y)).r), linDepth(texture2D(tDepth, UV - vec2(0.0, texel.y)).r)));
  float edge = step(0.35 + dc * 0.06, dc - dn);
  if (!glow) col = mix(col, col * 0.28 + vec3(0.03, 0.02, 0.05), edge * uOutline);

  // ピクセルソート（明るい縦の連なりを明るさ順に並べ替える近似）
  if (uSort > 0.0) {
    float th = mix(0.95, 0.35, uSort);
    if (lum(col) > th) {
      const int N = 16;
      float L[N]; vec3 C[N];
      float seg = 0.0;
      for (int j = 0; j < N; j++) {
        vec3 cj = sceneAt(UV + vec2(0.0, float(j - N / 2) * texel.y * 2.0)).rgb;
        C[j] = cj; L[j] = lum(cj);
      }
      // 自分の段（N/2）の位置にくる「順位」の画素を探す
      int target = N / 2;
      float bestE = 1e9; vec3 pick = col;
      for (int j = 0; j < N; j++) {
        int r = 0;
        for (int k = 0; k < N; k++) if (L[k] < L[j]) r++;
        float e = abs(float(r - target));
        if (e < bestE) { bestE = e; pick = C[j]; }
      }
      col = mix(col, pick, uSort);
      seg = 1.0;
    }
  }

  // 量子化
  if (!glow) col = quantize(col, px);

  // シネマグラフ：保存した画の上に、動く部分だけ生で重ねる
  if (uCinema > 0.5 && !live) col = texture2D(tSnap, UV).rgb;

  // データモッシュ：ブロックごとに前のコマを、明るさの勾配に沿ってずらして読む
  if (uMosh > 0.0) {
    vec2 blk = floor(px / 8.0);
    float h = hash(blk + floor(uTime * 6.0));
    float gx = lum(sceneAt(UV + vec2(texel.x * 2.0, 0.0)).rgb) - lum(sceneAt(UV - vec2(texel.x * 2.0, 0.0)).rgb);
    float gy = lum(sceneAt(UV + vec2(0.0, texel.y * 2.0)).rgb) - lum(sceneAt(UV - vec2(0.0, texel.y * 2.0)).rgb);
    vec2 mv = vec2(gx, gy) * 18.0 * texel + (vec2(hash(blk + 3.1), hash(blk + 7.7)) - 0.5) * texel * 6.0 * uMosh;
    vec3 prev = texture2D(tPrev, UV - mv).rgb;
    float keep = step(1.0 - uMosh * 0.92, h); // 更新されないブロック
    col = mix(col, prev, keep);
  }

  // ルーマ・キー遷移：保存した画の暗い所から先に抜ける
  if (uLumaKey >= 0.0) {
    vec3 snap = texture2D(tSnap, UV).rgb;
    float l = lum(snap);
    float k = smoothstep(uLumaKey - 0.04, uLumaKey + 0.04, l);
    col = mix(col, snap, k);
  }

  // テクスチャフラッシュ：模様の帯へ一瞬差し替える
  if (uFlash > 0.0) {
    float band = mod(floor((px.x + px.y) / 6.0) + floor(uTime * 30.0), 4.0);
    vec3 fc = band < 1.0 ? PAL[10] : band < 2.0 ? PAL[9] : band < 3.0 ? PAL[0] : PAL[14];
    col = mix(col, fc, uFlash * step(0.5, fract(lum(col) * 3.0 + uTime * 8.0)));
  }

  // ルマ・フェード・アシッド
  if (uAcid > 0.0) {
    float l = lum(col);
    col = mix(col, hueRot(col * 1.2, uTime * 2.5 + l * 9.0) , uAcid);
    col *= 1.0 - smoothstep(0.6, 1.0, uAcid) * (1.0 - l);
  }

  // 周辺減光（ほのかに）
  vec2 q = UV - 0.5;
  col *= 1.0 - dot(q, q) * uVignette;
  // 鼓動：縁が赤黒く沈み、張りつめるほど色が抜ける
  if (uTension > 0.0 || uPulse > 0.0) {
    float r = length(q) * 1.4;
    float edge = smoothstep(0.35, 0.95, r);
    col = mix(col, vec3(lum(col)), uTension * 0.45);
    col = mix(col, vec3(0.32, 0.02, 0.06), edge * (uTension * 0.5 + uPulse * 0.6));
  }
  col = mix(col, uFadeColor, uFade);
  gl_FragColor = vec4(col, 1.0);
}
`;
