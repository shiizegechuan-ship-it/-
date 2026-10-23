import * as THREE from 'three';
import { ATTACK } from '../core/data/tuning';
import type { EnemyState, Sim } from '../core/sim';
import type { Solid } from '../core/physics';
import { buildCreature, buildOkon, type CreatureRig, type OkonRig } from './models/creatures';
import { buildProp } from './models/props';
import { buildSuzu, type SuzuRig } from './models/suzu';
import { GLOW, PALETTE as C } from './palette';
import { Particles } from './particles';
import { boxesGeometry } from './terrain';
import { terrainTexture } from './textures';
import { THEMES, type Theme } from './themes';
import { Vox, glowMaterial, markerMaterial, toonGradient } from './voxel';
import { V16, voxMesh } from './models/common';

const SUZU_SCALE = 0.83;
const MAX_LAMPS = 6;

interface EnemyView {
  rig: CreatureRig;
  mats: Map<THREE.Mesh, THREE.Material | THREE.Material[]>;
  lastFlash: boolean;
  /** 地面に描く攻撃の予兆（外枠と、溜まり具合で伸びる中身） */
  tele: THREE.Group;
  teleFill: THREE.Mesh;
}

const teleMat = () => markerMaterial({ color: GLOW.telegraph, side: THREE.DoubleSide, depthWrite: false }, 0.5);
/** 突進：前方の帯。叩きつけ：周りの円 */
function buildTelegraph(e: EnemyState): { g: THREE.Group; fill: THREE.Mesh } {
  const g = new THREE.Group();
  const d = e.def;
  let outline: THREE.BufferGeometry;
  let fill: THREE.BufferGeometry;
  if (d.aoe) {
    outline = new THREE.RingGeometry(d.hitRadius - 0.1, d.hitRadius, 32);
    fill = new THREE.CircleGeometry(d.hitRadius - 0.12, 32);
  } else {
    const len = d.lunge * d.active + d.hitReach + d.hitRadius;
    const w = d.hitRadius * 2;
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2, 0);
    shape.lineTo(w / 2, 0);
    shape.lineTo(w / 2, len);
    shape.lineTo(-w / 2, len);
    shape.closePath();
    const hole = new THREE.Path();
    hole.moveTo(-w / 2 + 0.08, 0.08);
    hole.lineTo(-w / 2 + 0.08, len - 0.08);
    hole.lineTo(w / 2 - 0.08, len - 0.08);
    hole.lineTo(w / 2 - 0.08, 0.08);
    hole.closePath();
    shape.holes.push(hole);
    outline = new THREE.ShapeGeometry(shape);
    fill = new THREE.PlaneGeometry(w - 0.2, len - 0.2).translate(0, len / 2, 0);
    // 先端の三角（向き）
    const tri = new THREE.Shape();
    tri.moveTo(-w / 2, len + 0.05);
    tri.lineTo(w / 2, len + 0.05);
    tri.lineTo(0, len + 0.45);
    tri.closePath();
    const tm = new THREE.Mesh(new THREE.ShapeGeometry(tri), teleMat());
    tm.rotation.x = -Math.PI / 2;
    tm.scale.set(1, -1, 1);
    g.add(tm);
  }
  const om = new THREE.Mesh(outline, teleMat());
  om.rotation.x = -Math.PI / 2;
  if (!d.aoe) om.scale.set(1, -1, 1);
  const fm = new THREE.Mesh(fill, new THREE.MeshBasicMaterial({ color: GLOW.telegraph, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  fm.rotation.x = -Math.PI / 2;
  if (!d.aoe) fm.scale.set(1, -1, 1);
  g.add(om, fm);
  g.visible = false;
  g.renderOrder = 3;
  return { g, fill: fm };
}

/** 場面（Three.js）。Sim の状態を読んで模型を動かす。Sim は書き換えない。 */
export class GameView {
  readonly scene = new THREE.Scene();
  private level = new THREE.Group();
  private actors = new THREE.Group();
  suzu: SuzuRig;
  private enemies = new Map<string, EnemyView>();
  private floats: { solid: Solid; mesh: THREE.Mesh }[] = [];
  private gates: { solid: Solid; mesh: THREE.Mesh; baseY: number; h: number }[] = [];
  private ghosts: { solid: Solid; mesh: THREE.Mesh }[] = [];
  private shadows: { solid: Solid; full: THREE.Mesh; decal: THREE.Mesh }[] = [];
  private pickups: { id: string; mesh: THREE.Object3D; taken: () => boolean; y: number }[] = [];
  private okons: OkonRig[] = [];
  private flames: THREE.Object3D[] = [];
  private animProps: THREE.Object3D[] = [];
  private windSway = 0;
  private lampSpots: THREE.Vector3[] = [];
  private lamps: THREE.PointLight[] = [];
  private suzuLamp: THREE.PointLight;
  /** カメラ側からの弱い補助光（背中を向けた鈴が真っ黒にならないように） */
  private fill: THREE.PointLight;
  private moon: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private sky: THREE.Mesh;
  private water: THREE.Texture[] = [];
  readonly sparks = new Particles(260, true);
  readonly dust = new Particles(160, false);
  theme: Theme = THEMES.festival;
  private marker: THREE.Mesh;
  private time = 0;
  private runPhase = 0;
  private mats = new Map<string, THREE.MeshToonMaterial>();
  /** 当たり判定の可視化 */
  debugBoxes = false;
  private debugGroup = new THREE.Group();

  constructor() {
    this.scene.add(this.level, this.actors, this.debugGroup);
    this.suzu = buildSuzu();
    this.suzu.root.scale.setScalar(SUZU_SCALE);
    this.actors.add(this.suzu.root);
    this.hemi = new THREE.HemisphereLight('#5f8fbf', '#15111c', 0.9);
    this.scene.add(this.hemi);
    this.moon = new THREE.DirectionalLight('#cfe3e8', 1.2);
    this.moon.castShadow = true;
    this.moon.shadow.mapSize.set(1024, 1024);
    const sc = this.moon.shadow.camera;
    sc.left = sc.bottom = -18;
    sc.right = sc.top = 18;
    sc.near = 1;
    sc.far = 80;
    this.moon.shadow.bias = -0.0015;
    this.scene.add(this.moon, this.moon.target);
    for (let i = 0; i < MAX_LAMPS; i++) {
      const l = new THREE.PointLight('#ffab5c', 0, 7.5, 1.7);
      this.lamps.push(l);
      this.scene.add(l);
    }
    this.suzuLamp = new THREE.PointLight('#ffd27a', 0, 7, 1.4);
    this.scene.add(this.suzuLamp);
    this.fill = new THREE.PointLight('#a9d4d3', 3.2, 14, 1.2);
    this.scene.add(this.fill);
    this.sky = this.makeSky();
    this.scene.add(this.sky);
    this.scene.add(this.sparks.mesh, this.dust.mesh);
    const mv = new Vox();
    mv.box(0, 0, 0, 0, 0, 0, '#ffffff');
    mv.set(0, -1, 0, '#ffffff');
    this.marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.12, 0), glowMaterial(GLOW.interact));
    this.marker.visible = false;
    this.scene.add(this.marker);
  }

  private makeSky(): THREE.Mesh {
    const mat = new THREE.ShaderMaterial({
      uniforms: { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() }, stars: { value: 1 }, moonDir: { value: new THREE.Vector3(0, 1, 0) } },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w * 0.9999; }`,
      fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform float stars; uniform vec3 moonDir; varying vec3 vDir;
        float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453); }
        void main(){
          float t = clamp(vDir.y * 1.4 + 0.15, 0.0, 1.0);
          vec3 c = mix(bottom, top, t);
          vec3 q = floor(vDir * 220.0);
          float s = step(0.9965, h(q)) * stars * smoothstep(0.05, 0.4, vDir.y);
          c += s * vec3(0.9, 0.95, 1.0);
          float md = dot(normalize(vDir), normalize(moonDir));
          c = mix(c, vec3(0.93, 0.95, 0.9), step(0.9993, md));
          c += smoothstep(0.985, 0.999, md) * vec3(0.12, 0.14, 0.16);
          gl_FragColor = vec4(c, 1.0);
        }`,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    const m = new THREE.Mesh(new THREE.SphereGeometry(150, 24, 12), mat);
    m.renderOrder = -10;
    m.frustumCulled = false;
    return m;
  }

  private mat(name: string): THREE.MeshToonMaterial {
    let m = this.mats.get(name);
    if (!m) {
      const tex = terrainTexture(name);
      m = new THREE.MeshToonMaterial({ map: tex, gradientMap: toonGradient(), vertexColors: true });
      if (name === 'water') {
        const t2 = tex.clone();
        t2.needsUpdate = true;
        m.map = t2;
        this.water.push(t2);
      }
      this.mats.set(name, m);
    }
    return m;
  }

  /** 章の場面を作り直す */
  setLevel(sim: Sim): void {
    this.level.clear();
    this.floats = [];
    this.gates = [];
    this.ghosts = [];
    this.shadows = [];
    this.pickups = [];
    this.okons = [];
    this.flames = [];
    this.animProps = [];
    this.lampSpots = [];
    this.water = [];
    for (const v of this.enemies.values()) this.actors.remove(v.rig.root, v.tele);
    this.enemies.clear();
    this.sparks.clear();
    this.dust.clear();
    const def = sim.level;
    this.theme = THEMES[def.theme] ?? THEMES.festival;
    const t = this.theme;
    this.scene.fog = new THREE.Fog(t.fog, t.fogNear, t.fogFar);
    this.hemi.color.set(t.hemiSky);
    this.hemi.groundColor.set(t.hemiGround);
    this.hemi.intensity = t.hemiIntensity;
    this.moon.color.set(t.moon);
    this.moon.intensity = t.moonIntensity;
    const su = (this.sky.material as THREE.ShaderMaterial).uniforms;
    (su.top.value as THREE.Color).set(t.skyTop);
    (su.bottom.value as THREE.Color).set(t.skyBottom);
    su.stars.value = t.stars;
    (su.moonDir.value as THREE.Vector3).set(...t.moonDir).normalize();
    for (const l of this.lamps) l.color.set(t.lamp);

    // 地形（材質ごとにまとめる）
    const byMat = new Map<string, Solid[]>();
    for (const s of sim.world.statics) {
      if (s.mat === 'none') continue;
      let a = byMat.get(s.mat);
      if (!a) byMat.set(s.mat, (a = []));
      a.push(s);
    }
    for (const [mat, list] of byMat) {
      const mesh = new THREE.Mesh(boxesGeometry(list), this.mat(mat));
      mesh.receiveShadow = true;
      mesh.castShadow = mat !== 'water';
      this.level.add(mesh);
    }
    for (const f of sim.world.floats) {
      const mesh = new THREE.Mesh(boxesGeometry([f.solid], true), this.mat('floatstone'));
      mesh.castShadow = mesh.receiveShadow = true;
      this.level.add(mesh);
      this.floats.push({ solid: f.solid, mesh });
    }
    for (const g of sim.world.gates) {
      const mesh = new THREE.Mesh(boxesGeometry([g.solid], true), this.mat('gate'));
      mesh.castShadow = mesh.receiveShadow = true;
      this.level.add(mesh);
      this.gates.push({ solid: g.solid, mesh, baseY: g.solid.minY, h: g.solid.maxY - g.solid.minY });
    }
    const ghostMat = markerMaterial({ color: '#9ff3ff', map: terrainTexture('ghost') }, 0.5);
    for (const s of sim.world.ghosts) {
      const mesh = new THREE.Mesh(boxesGeometry([s]), ghostMat);
      this.level.add(mesh);
      this.ghosts.push({ solid: s, mesh });
    }
    for (const s of sim.world.shadows) {
      const full = new THREE.Mesh(boxesGeometry([s]), this.mat('shadow'));
      const decal = new THREE.Mesh(new THREE.PlaneGeometry(s.maxX - s.minX, s.maxZ - s.minZ), new THREE.MeshBasicMaterial({ color: C.yoru, transparent: true, opacity: 0.75, depthWrite: false }));
      decal.rotation.x = -Math.PI / 2;
      decal.position.set((s.minX + s.maxX) / 2, s.maxY + 0.01, (s.minZ + s.maxZ) / 2);
      this.level.add(full, decal);
      this.shadows.push({ solid: s, full, decal });
    }
    // 飾り
    for (const p of def.props) {
      const b = buildProp(p);
      this.level.add(b.obj);
      if (b.obj.userData.anim) this.animProps.push(b.obj);
      this.flames.push(...b.flames);
      this.lampSpots.push(...b.lights);
    }
    // 質屋（おこん）
    for (const s of def.shrines) {
      if (!s.shop) continue;
      const side = s.stallSide ?? 1;
      // 既定：鳥居の脇に置き、正面を参道の中心へ向ける
      const sx = s.stall?.x ?? s.x + Math.cos(s.yaw) * side * 2.9 + Math.sin(s.yaw) * 0.6;
      const sz = s.stall?.z ?? s.z - Math.sin(s.yaw) * side * 2.9 + Math.cos(s.yaw) * 0.6;
      const th = s.stall?.yaw ?? Math.atan2(-side * Math.cos(s.yaw), side * Math.sin(s.yaw));
      const st = buildProp({ kind: 'okonStall', x: sx, y: s.y, z: sz, yaw: th });
      this.level.add(st.obj);
      this.flames.push(...st.flames);
      this.lampSpots.push(...st.lights);
      const ok = buildOkon();
      ok.root.position.set(sx - Math.sin(th) * 0.85, s.y, sz - Math.cos(th) * 0.85);
      ok.root.rotation.y = th;
      ok.root.userData.home = ok.root.position.clone();
      this.level.add(ok.root);
      this.okons.push(ok);
    }
    // 銭
    const coinV = new Vox();
    for (let x = -3; x <= 3; x++) for (let y = -3; y <= 3; y++) if (x * x + y * y <= 10 && !(Math.abs(x) <= 1 && Math.abs(y) <= 1)) coinV.set(x, y, 0, x + y > 1 ? '#fff4b0' : GLOW.zeni);
    const coinGeo = coinV.build(V16 * 0.9, [-0.5, -0.5, -0.5], 0);
    for (const pk of sim.pickups) {
      const mesh = new THREE.Mesh(coinGeo, markerMaterial({ vertexColors: true }, 0.5));
      mesh.position.set(pk.def.x, pk.def.y, pk.def.z);
      this.level.add(mesh);
      this.pickups.push({ id: pk.def.id, mesh, taken: () => pk.taken, y: pk.def.y });
    }
    this.rebuildDebug(sim);
  }

  private rebuildDebug(sim: Sim): void {
    this.debugGroup.clear();
    if (!this.debugBoxes) return;
    const mat = new THREE.LineBasicMaterial({ color: '#00ff88' });
    for (const s of sim.world.phys.solids) {
      const g = new THREE.EdgesGeometry(new THREE.BoxGeometry(s.maxX - s.minX, s.maxY - s.minY, s.maxZ - s.minZ));
      const l = new THREE.LineSegments(g, mat);
      l.position.set((s.minX + s.maxX) / 2, (s.minY + s.maxY) / 2, (s.minZ + s.maxZ) / 2);
      l.userData.solid = s;
      this.debugGroup.add(l);
    }
  }

  setDebug(on: boolean, sim: Sim): void {
    this.debugBoxes = on;
    this.rebuildDebug(sim);
  }

  private enemyView(e: EnemyState): EnemyView {
    let v = this.enemies.get(e.id);
    if (!v) {
      const rig = buildCreature(e.spawn.type, e.id);
      const mats = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
      for (const m of rig.flash) mats.set(m, m.material);
      const t = buildTelegraph(e);
      v = { rig, mats, lastFlash: false, tele: t.g, teleFill: t.fill };
      this.enemies.set(e.id, v);
      this.actors.add(rig.root, t.g);
    }
    return v;
  }

  /** 描画の 1 コマ。dt は実時間 */
  /** カメラの位置（補助光をカメラと鈴の間に置く） */
  setCameraPos(p: THREE.Vector3, sim: Sim): void {
    const b = sim.player.body;
    this.fill.position.set(p.x * 0.6 + b.x * 0.4, p.y * 0.6 + (b.y + 1.2) * 0.4, p.z * 0.6 + b.z * 0.4);
  }

  update(sim: Sim, dt: number, frozen: boolean): void {
    this.time += dt;
    const t = this.time;
    const p = sim.player;
    const b = p.body;
    // 月の影は鈴の周りだけ
    const md = this.theme.moonDir;
    this.moon.position.set(b.x + md[0] * 30, b.y + md[1] * 30, b.z + md[2] * 30);
    this.moon.target.position.set(b.x, b.y, b.z);
    this.sky.position.set(b.x, b.y, b.z);

    this.updateSuzu(sim, frozen ? 0 : dt);

    // 妖
    const seen = new Set<string>();
    for (const e of sim.enemies) {
      seen.add(e.id);
      this.updateEnemy(e, this.enemyView(e), frozen ? 0 : dt);
    }
    for (const [id, v] of this.enemies)
      if (!seen.has(id)) {
        this.actors.remove(v.rig.root, v.tele);
        this.enemies.delete(id);
      }

    // 動く足場・門・幽かな橋・影
    for (const f of this.floats) f.mesh.position.set(f.solid.minX, f.solid.minY, f.solid.minZ);
    for (const g of this.gates) {
      const open = 1 - Math.max(0, Math.min(1, (g.solid.enabled ? 0 : 1)));
      const wr = sim.world.gates.find((x) => x.solid === g.solid);
      const o = wr ? wr.open : open;
      g.mesh.position.set(g.solid.minX, g.baseY - o * (g.h + 0.05), g.solid.minZ);
      g.mesh.visible = o < 0.98;
    }
    const lant = sim.lanternInfo();
    for (const gh of this.ghosts) {
      gh.mesh.visible = gh.solid.enabled;
      if (!gh.solid.enabled && Math.random() < dt * 3) {
        const cx = gh.solid.minX + Math.random() * (gh.solid.maxX - gh.solid.minX);
        const cz = gh.solid.minZ + Math.random() * (gh.solid.maxZ - gh.solid.minZ);
        if (Math.hypot(cx - b.x, cz - b.z) < 10) this.sparks.spawn({ x: cx, y: gh.solid.maxY + 0.1, z: cz, vy: 0.3, life: 1.2, size: 0.05, color: '#9ff3ff' });
      }
    }
    const shadowLaw = sim.ledger.pawned.includes('lantern');
    for (const s of this.shadows) {
      s.full.visible = shadowLaw;
      s.decal.visible = !shadowLaw;
    }
    // 銭
    for (const pk of this.pickups) {
      const taken = pk.taken();
      if (pk.mesh.visible && taken) {
        this.sparks.burst(10, pk.mesh.position.x, pk.mesh.position.y, pk.mesh.position.z, 3, GLOW.zeni, { life: 0.5, grav: 4 });
      }
      pk.mesh.visible = !taken;
      pk.mesh.rotation.y = t * 3;
      pk.mesh.position.y = pk.y + Math.sin(t * 2.5 + pk.mesh.position.x) * 0.08;
    }
    // おこん
    for (const ok of this.okons) {
      ok.tail.rotation.y = Math.sin(t * 1.3) * 0.35;
      ok.tail.rotation.z = Math.sin(t * 0.9) * 0.1;
      ok.head.rotation.z = Math.sin(t * 0.7) * 0.06;
      ok.fires.forEach((f, i) => {
        const a = t * 0.8 + (i * Math.PI * 2) / 3;
        f.position.set(Math.cos(a) * 0.55, 1.35 + Math.sin(t * 2 + i) * 0.12, Math.sin(a) * 0.55);
      });
    }
    // 竹のしなり・風車・人
    const wind = Math.hypot(sim.wind.x, sim.wind.z);
    this.windSway += ((wind > 0 ? 1 : 0) - this.windSway) * Math.min(1, dt * 1.5);
    for (const o of this.animProps) {
      const kind = o.userData.anim as string;
      if (kind === 'sway') {
        const base = Math.sin(t * 0.9 + o.position.x * 0.7 + o.position.z * 0.3) * 0.025;
        const ws = this.windSway * (0.12 + Math.sin(t * 3.1 + o.position.z) * 0.035);
        // 風下（+x）へしなる：z 軸まわりに負の回転
        o.rotation.z = -(base + ws) * Math.sign(sim.level.wind?.x ?? 1);
        o.rotation.x = base * 0.6;
      } else if (kind === 'windmill') {
        const bl = o.getObjectByName('blades');
        if (bl) bl.rotation.z -= dt * (0.15 + this.windSway * 4.5);
      } else if (kind === 'npc') {
        o.children[0].position.y = Math.abs(Math.sin(t * 2.2)) * 0.03;
      }
    }
    // 風の筋
    if (wind > 0 && Math.random() < dt * 40) {
      const len = 0.5 + Math.random() * 0.8;
      for (let i = 0; i < 4; i++)
        this.dust.spawn({
          x: b.x - sim.wind.x * 4 + (Math.random() - 0.5) * 16 + (sim.wind.x / wind) * i * len * 0.25,
          y: b.y + 0.2 + Math.random() * 3,
          z: b.z - sim.wind.z * 4 + (Math.random() - 0.5) * 16 + (sim.wind.z / wind) * i * len * 0.25,
          vx: sim.wind.x * 5,
          vz: sim.wind.z * 5,
          life: 0.7,
          size: 0.05,
          grav: 0,
          color: '#e4ebe8',
        });
    }
    // 火の揺らめき
    for (const f of this.flames) {
      const k = 1 + Math.sin(t * 13 + f.id) * 0.06 + Math.sin(t * 7.3 + f.id * 2) * 0.04;
      f.scale.set(k, 1 + (k - 1) * 2, k);
    }
    // 近くの灯籠に点光源を割り当てる
    const spots = this.lampSpots
      .map((v) => ({ v, d: (v.x - b.x) ** 2 + (v.z - b.z) ** 2 + (v.y - b.y) ** 2 }))
      .sort((a, c) => a.d - c.d)
      .slice(0, MAX_LAMPS);
    this.lamps.forEach((l, i) => {
      const s = spots[i];
      if (s && s.d < 30 * 30) {
        l.position.copy(s.v);
        l.intensity = this.theme.lampIntensity * (0.92 + Math.sin(t * 9 + i) * 0.08);
      } else l.intensity = 0;
    });
    this.suzuLamp.intensity = lant.on ? 9 : 0;
    this.suzuLamp.position.set(b.x + Math.sin(p.yaw) * 0.3, b.y + 0.8, b.z + Math.cos(p.yaw) * 0.3);
    // 漂う塵
    if (Math.random() < dt * 8) {
      this.dust.spawn({
        x: b.x + (Math.random() - 0.5) * 18,
        y: b.y + Math.random() * 5,
        z: b.z + (Math.random() - 0.5) * 18,
        vx: 0.2 + sim.wind.x * 0.5,
        vy: -0.15,
        vz: sim.wind.z * 0.5,
        life: 4,
        size: 0.05,
        grav: 0,
        color: this.theme.dust,
        spin: 2,
      });
    }
    for (const w of this.water) w.offset.set((t * 0.05) % 1, (t * 0.11) % 1);
    // 調べられる物の印
    const it = sim.interactable();
    if (it) {
      const pos = it.kind === 'shrine' ? new THREE.Vector3(it.def.x, it.def.y + 2.2, it.def.z) : (() => {
        const r = sim.level.readables.find((x) => x.id === it.id)!;
        return new THREE.Vector3(r.x, r.y + 1.6, r.z);
      })();
      this.marker.visible = true;
      this.marker.position.set(pos.x, pos.y + Math.sin(t * 4) * 0.08, pos.z);
      this.marker.rotation.y = t * 2;
    } else this.marker.visible = false;
    if (!frozen) {
      this.sparks.update(dt);
      this.dust.update(dt);
    }
    if (this.debugBoxes) for (const c of this.debugGroup.children) {
      const s = c.userData.solid as Solid;
      c.position.set((s.minX + s.maxX) / 2, (s.minY + s.maxY) / 2, (s.minZ + s.maxZ) / 2);
      c.visible = s.enabled;
    }
  }

  private updateSuzu(sim: Sim, dt: number): void {
    const r = this.suzu;
    const p = sim.player;
    const b = p.body;
    r.root.position.set(b.x, b.y, b.z);
    r.root.rotation.y = p.yaw;
    const run = b.onGround ? p.runAmt : 0;
    this.runPhase += dt * (6 + run * 9);
    const ph = this.runPhase;
    const sw = Math.sin(ph) * run;
    // 既定
    r.body.position.set(0, 0, 0);
    r.body.rotation.set(0, 0, 0);
    r.torso.rotation.set(0, 0, 0);
    r.head.rotation.set(0, 0, 0);
    r.legL.rotation.set(sw * 0.8, 0, 0);
    r.legR.rotation.set(-sw * 0.8, 0, 0);
    r.armL.rotation.set(-sw * 0.7, 0, 0.12);
    r.armR.rotation.set(sw * 0.7, 0, -0.12);
    r.body.position.y = Math.abs(Math.cos(ph)) * 0.05 * run + (run < 0.1 ? Math.sin(this.time * 2) * 0.008 : 0);
    r.torso.rotation.x = run * 0.12;
    if (!b.onGround && p.mode === 'normal') {
      const up = b.vy > 0;
      r.legL.rotation.x = up ? -0.7 : 0.3;
      r.legR.rotation.x = up ? 0.2 : -0.4;
      r.armL.rotation.set(-0.4, 0, 0.6);
      r.armR.rotation.set(-0.4, 0, -0.6);
    }
    r.fanOpen.visible = false;
    r.fanClosed.visible = sim.has('fan');
    const trailMat = r.trail.material as THREE.MeshBasicMaterial;
    trailMat.opacity = Math.max(0, trailMat.opacity - dt * 6);
    if (p.mode === 'attack') {
      const swd = ATTACK.swings[p.combo];
      const dir = p.combo === 1 ? -1 : 1;
      r.fanOpen.visible = true;
      r.fanClosed.visible = false;
      let k = 0;
      if (p.phase === 'startup') k = -0.6 * (p.modeT / swd.startup);
      else if (p.phase === 'active') k = -0.6 + 1.9 * (p.modeT / swd.active);
      else k = 1.3;
      r.torso.rotation.y = -k * 0.55 * dir;
      r.armR.rotation.set(-1.45, k * 1.1 * dir, -0.2);
      r.armL.rotation.set(-0.3, 0, 0.5);
      r.legL.rotation.x = -0.35;
      r.legR.rotation.x = 0.45;
      if (p.combo === 2) {
        r.body.rotation.y = k * Math.PI * 0.9;
      }
      if (p.phase === 'active') {
        trailMat.opacity = 0.85;
        r.trail.rotation.set(0, 0, 0);
        r.trail.scale.set(dir, 1, 1);
        r.trail.scale.setScalar(p.combo === 2 ? 1.25 : 1);
        if (p.combo === 1) r.trail.rotation.z = Math.PI;
      }
    }
    if (p.mode === 'dash') {
      r.torso.rotation.x = 0.55;
      r.body.position.y = -0.1;
      r.legL.rotation.x = -0.9;
      r.legR.rotation.x = 0.9;
      r.armL.rotation.set(1.0, 0, 0.4);
      r.armR.rotation.set(1.0, 0, -0.4);
      if (Math.random() < 0.9)
        this.sparks.spawn({ x: b.x + (Math.random() - 0.5) * 0.4, y: b.y + 0.3 + Math.random() * 0.9, z: b.z + (Math.random() - 0.5) * 0.4, life: 0.35, size: 0.06, color: '#f6f0e1', grav: 0 });
    }
    if (p.mode === 'hurt') {
      r.torso.rotation.x = -0.35;
      r.head.rotation.x = -0.3;
      r.armL.rotation.set(-0.8, 0, 0.9);
      r.armR.rotation.set(-0.8, 0, -0.9);
    }
    if (p.mode === 'dead') {
      r.body.rotation.x = -Math.min(1.45, p.modeT * 4);
      r.body.position.y = 0.05;
    }
    // 提灯
    r.lantern.visible = sim.has('lantern') && (p.lanternOn || p.mode !== 'attack');
    r.lanternGlow.visible = p.lanternOn && sim.has('lantern');
    r.lantern.rotation.x = -r.armL.rotation.x + Math.sin(this.time * 3) * 0.08;
    // 被弾後の点滅（見失わない程度）
    r.root.visible = !(p.invulnT > 0 && p.mode !== 'dead' && Math.floor(this.time * 14) % 3 === 0);
  }

  private updateEnemy(e: EnemyState, v: EnemyView, dt: number): void {
    const r = v.rig;
    const b = e.body;
    r.root.position.set(b.x, b.y + e.floatOff, b.z);
    r.root.rotation.y = e.yaw;
    const t = e.anim;
    r.body.position.y = e.spawn.type === 'menyo' ? 0.12 + Math.sin(t * 3) * 0.06 : 0;
    r.body.rotation.set(0, 0, 0);
    r.body.scale.setScalar(1);
    const eyeMat = (r.eyes as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
    let eye = '#5a1a2a';
    if (r.armL && r.armR) {
      r.armL.rotation.set(Math.sin(t * 2.2) * 0.2, 0, 0.15);
      r.armR.rotation.set(-Math.sin(t * 2.2) * 0.2, 0, -0.15);
    }
    switch (e.mode) {
      case 'chase':
        r.body.rotation.x = 0.15;
        break;
      case 'windup': {
        const k = Math.min(1, e.t / e.def.windup);
        eye = Math.floor(e.t * 16) % 2 ? GLOW.telegraph : '#ffd0d8';
        if (r.armL && r.armR) {
          r.armL.rotation.set(-2.2 * k, 0, 0.3);
          r.armR.rotation.set(-2.2 * k, 0, -0.3);
        }
        r.body.rotation.x = -0.25 * k;
        if (e.def.aoe) r.body.position.y = 0.15 * k;
        break;
      }
      case 'attack':
        eye = GLOW.telegraph;
        r.body.rotation.x = 0.45;
        if (r.armL && r.armR) {
          r.armL.rotation.set(-0.4, 0, 0.2);
          r.armR.rotation.set(-0.4, 0, -0.2);
        }
        if (e.def.aoe && e.t < dt * 1.5) this.shockwave(b.x, b.y, b.z, e.def.hitRadius);
        break;
      case 'stagger':
        r.body.rotation.z = Math.sin(e.t * 50) * 0.12;
        r.body.rotation.x = -0.3;
        break;
      case 'float':
        r.body.rotation.z = Math.sin(t * 1.3) * 0.3;
        r.body.rotation.x = Math.sin(t * 0.9) * 0.2;
        eye = '#3a2a4a';
        break;
      case 'dead': {
        const k = Math.min(1, e.deadT / 0.6);
        r.body.scale.set(1 + k * 0.3, 1 - k * 0.9, 1 + k * 0.3);
        r.root.visible = e.deadT < 0.7;
        if (e.deadT < dt * 1.5) {
          this.sparks.burst(24, b.x, b.y + b.h * 0.6, b.z, 4, '#f6f0e1', { life: 0.7, grav: 3 });
          this.sparks.burst(10, b.x, b.y + b.h * 0.6, b.z, 2.5, '#9283c8', { life: 1.0, grav: -1 });
        }
        break;
      }
    }
    if (eyeMat) eyeMat.color.set(eye);
    // 地面の予兆：溜めの間だけ。中身が溜まり具合で満ちる
    const showTele = e.mode === 'windup' || (e.mode === 'attack' && e.t < e.def.active);
    v.tele.visible = showTele;
    if (showTele) {
      v.tele.position.set(b.x, b.y + 0.04, b.z);
      v.tele.rotation.y = e.def.aoe ? 0 : e.yaw;
      const k = e.mode === 'attack' ? 1 : Math.min(1, e.t / e.def.windup);
      if (e.def.aoe) v.teleFill.scale.set(k, k, 1);
      else v.teleFill.scale.set(1, -k, 1);
      (v.teleFill.material as THREE.MeshBasicMaterial).opacity = e.mode === 'attack' ? 0.55 : 0.18 + k * 0.2;
    }
    // 被弾の白
    const flash = e.flash > 0;
    if (flash !== v.lastFlash) {
      for (const [m, orig] of v.mats) m.material = flash ? glowMaterial('#ffffff') : orig;
      v.lastFlash = flash;
    }
  }

  private shockwave(x: number, y: number, z: number, r: number): void {
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      this.sparks.spawn({ x: x + Math.cos(a) * 0.4, y: y + 0.1, z: z + Math.sin(a) * 0.4, vx: Math.cos(a) * r * 3.2, vz: Math.sin(a) * r * 3.2, vy: 0.5, life: 0.32, size: 0.12, color: '#cdb88d', grav: 2, drag: 3 });
    }
  }

  /** 1 発の当たりの飾り */
  hitFx(x: number, y: number, z: number, heavy: boolean, immune: boolean): void {
    if (immune) {
      this.sparks.burst(8, x, y, z, 3, '#bdb9c3', { life: 0.25, grav: 6 });
      return;
    }
    this.sparks.burst(heavy ? 22 : 12, x, y, z, heavy ? 6 : 4.5, '#fff3b0', { life: 0.3, grav: 2, size: 0.06 });
    this.sparks.burst(heavy ? 10 : 5, x, y, z, 2.5, '#d0482f', { life: 0.45, grav: 5, size: 0.08 });
  }

  telegraphFx(e: EnemyState): void {
    const b = e.body;
    this.sparks.burst(6, b.x, b.y + b.h + 0.2, b.z, 1.5, GLOW.telegraph, { life: 0.4, grav: -2, size: 0.07 });
  }

  /** 型を質に入れた／請け出した瞬間の粒 */
  lawFx(sim: Sim): void {
    const b = sim.player.body;
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * Math.PI * 2;
      this.sparks.spawn({ x: b.x, y: b.y + 0.8, z: b.z, vx: Math.cos(a) * 5, vy: (Math.random() - 0.2) * 4, vz: Math.sin(a) * 5, life: 1.0, size: 0.07, grav: 0, drag: 1.5, color: Math.random() < 0.5 ? GLOW.foxfire : '#efd27a' });
    }
  }

  /** 浮石の理：石の周りに光の粒 */
  floatFx(): void {
    for (const f of this.floats) {
      const s = f.solid;
      for (let i = 0; i < 8; i++)
        this.sparks.spawn({ x: s.minX + Math.random() * (s.maxX - s.minX), y: s.minY, z: s.minZ + Math.random() * (s.maxZ - s.minZ), vy: 1 + Math.random(), life: 1.4, size: 0.06, grav: -0.5, color: '#efd27a' });
    }
  }

  /** 注目させたい物の位置（ドリーズームの対象） */
  okonPosition(shrineId: string, sim: Sim): THREE.Vector3 | null {
    const shops = sim.level.shrines.filter((s) => s.shop);
    const i = shops.findIndex((s) => s.id === shrineId);
    const ok = this.okons[i];
    return ok ? ok.root.position.clone().add(new THREE.Vector3(0, 1.0, 0)) : null;
  }
  floatCenter(): THREE.Vector3 | null {
    if (!this.floats.length) return null;
    const c = new THREE.Vector3();
    for (const f of this.floats.slice(0, 4)) c.add(new THREE.Vector3((f.solid.minX + f.solid.maxX) / 2, f.solid.maxY, (f.solid.minZ + f.solid.maxZ) / 2));
    return c.multiplyScalar(1 / Math.min(4, this.floats.length));
  }
}

export { voxMesh };
