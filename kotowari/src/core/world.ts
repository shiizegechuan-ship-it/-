import type { AbilityId } from './data/abilities';
import { PhysicsWorld, type Solid } from './physics';
import type { FloatDef, GateDef, LevelDef } from './levels/types';

export interface FloatRt {
  def: FloatDef;
  solid: Solid;
  baseY: number;
  offset: number; // 今の浮き上がり量
  wait: number; // 浮き始めまでの残り
}

export interface GateRt {
  def: GateDef;
  solid: Solid;
  open: number; // 0..1
}

/** 章の地形の実行時の状態。理（質入れ中の型）に応じて足場や門を変える。 */
export class LevelWorld {
  readonly phys = new PhysicsWorld();
  readonly floats: FloatRt[] = [];
  readonly gates: GateRt[] = [];
  readonly ghosts: Solid[] = [];
  readonly shadows: Solid[] = [];
  readonly statics: Solid[] = [];

  constructor(readonly def: LevelDef) {
    for (const b of def.boxes) {
      const s = this.phys.add(b);
      // 水などの hazard は見た目だけ（落ちると killY で戻る）
      if (s.tag === 'hazard') s.enabled = false;
      this.statics.push(s);
    }
    for (const f of def.floats) {
      const solid = this.phys.add({ ...f.box, tag: 'float', mat: f.box.mat ?? 'floatstone' }, true);
      this.floats.push({ def: f, solid, baseY: solid.minY, offset: 0, wait: f.delay ?? 0 });
    }
    for (const g of def.ghosts) {
      const s = this.phys.add({ ...g, tag: 'ghost', mat: g.mat ?? 'ghost' });
      s.enabled = false;
      this.ghosts.push(s);
    }
    for (const g of def.shadows) {
      const s = this.phys.add({ ...g, tag: 'shadow', mat: g.mat ?? 'shadow' });
      s.enabled = false;
      this.shadows.push(s);
    }
    for (const g of def.gates) {
      const solid = this.phys.add({ ...g.box, tag: 'gate', mat: g.box.mat ?? 'gate' }, true);
      this.gates.push({ def: g, solid, open: 0 });
    }
  }

  /** 理と灯の状態を足場へ反映する（毎コマ） */
  applyLaws(
    pawned: readonly AbilityId[],
    flags: Record<string, boolean>,
    lantern: { on: boolean; x: number; z: number; radius: number },
    dt: number,
    bodies: Parameters<PhysicsWorld['moveSolid']>[4],
  ): void {
    const floatLaw = pawned.includes('jump');
    for (const f of this.floats) {
      let target = 0;
      if (floatLaw) {
        if (f.wait > 0) f.wait -= dt;
        else target = f.def.lift;
      } else f.wait = f.def.delay ?? 0;
      const speed = 2.2;
      const next = target > f.offset ? Math.min(target, f.offset + speed * dt) : Math.max(target, f.offset - speed * 1.4 * dt);
      if (next !== f.offset) {
        f.offset = next;
        this.phys.moveSolid(f.solid, f.solid.minX, f.baseY + next, f.solid.minZ, bodies);
      } else {
        f.solid.dx = f.solid.dy = f.solid.dz = 0;
      }
    }
    const shadowLaw = pawned.includes('lantern');
    for (const s of this.shadows) s.enabled = shadowLaw;
    for (const s of this.ghosts) {
      const cx = (s.minX + s.maxX) / 2;
      const cz = (s.minZ + s.maxZ) / 2;
      // 灯の輪が板の一部にでも掛かれば実体化
      const hx = (s.maxX - s.minX) / 2;
      const hz = (s.maxZ - s.minZ) / 2;
      const dx = Math.max(0, Math.abs(lantern.x - cx) - hx);
      const dz = Math.max(0, Math.abs(lantern.z - cz) - hz);
      s.enabled = !shadowLaw && lantern.on && Math.hypot(dx, dz) <= lantern.radius;
    }
    for (const g of this.gates) {
      const ow = g.def.opensWhen;
      const want = 'law' in ow ? pawned.includes(ow.law) : 'flag' in ow ? !!flags[ow.flag] : !flags[ow.notFlag];
      g.open = Math.max(0, Math.min(1, g.open + (want ? dt : -dt) * 0.8));
      // 門は開いたら当たりを消す（半分以上開いたら通れる）
      g.solid.enabled = g.open < 0.6;
    }
  }

  windAt(pawned: readonly AbilityId[]): { x: number; z: number } {
    const w = this.def.wind;
    if (!w || !pawned.includes('fan')) return { x: 0, z: 0 };
    const n = Math.hypot(w.x, w.z) || 1;
    return { x: (w.x / n) * w.strength, z: (w.z / n) * w.strength };
  }
}
