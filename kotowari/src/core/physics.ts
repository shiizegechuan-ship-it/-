/** 軸平行の箱（AABB）による衝突。地形・足場はすべて Solid、鈴と妖は Body。 */
export type SolidTag = 'ground' | 'wall' | 'fence' | 'float' | 'ghost' | 'shadow' | 'gate' | 'hazard';

export interface Solid {
  id: number;
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  enabled: boolean;
  dynamic: boolean;
  /** このコマに動いた量（上に乗った物を運ぶ） */
  dx: number;
  dy: number;
  dz: number;
  tag: SolidTag;
  mat: string;
  /** 描画用の名前（任意） */
  name?: string;
}

export interface Body {
  x: number;
  y: number; // 足元
  z: number;
  hw: number; // 半分の幅（x・z とも）
  h: number;
  vx: number;
  vy: number;
  vz: number;
  onGround: boolean;
  ground: Solid | null;
  /** 横の壁に当たったか（このコマ） */
  hitWall: boolean;
}

export const newBody = (x: number, y: number, z: number, hw: number, h: number): Body => ({
  x,
  y,
  z,
  hw,
  h,
  vx: 0,
  vy: 0,
  vz: 0,
  onGround: false,
  ground: null,
  hitWall: false,
});

const EPS = 1e-4;
const CELL = 2;

export interface BoxSpec {
  min: [number, number, number];
  max: [number, number, number];
  tag?: SolidTag;
  mat?: string;
  name?: string;
}

export class PhysicsWorld {
  readonly solids: Solid[] = [];
  private grid = new Map<number, Solid[]>();
  private dynamics: Solid[] = [];
  private stamp = new Map<number, number>();
  private stampN = 0;
  private nextId = 1;

  add(spec: BoxSpec, dynamic = false): Solid {
    const s: Solid = {
      id: this.nextId++,
      minX: Math.min(spec.min[0], spec.max[0]),
      minY: Math.min(spec.min[1], spec.max[1]),
      minZ: Math.min(spec.min[2], spec.max[2]),
      maxX: Math.max(spec.min[0], spec.max[0]),
      maxY: Math.max(spec.min[1], spec.max[1]),
      maxZ: Math.max(spec.min[2], spec.max[2]),
      enabled: true,
      dynamic,
      dx: 0,
      dy: 0,
      dz: 0,
      tag: spec.tag ?? 'ground',
      mat: spec.mat ?? 'stone',
      name: spec.name,
    };
    this.solids.push(s);
    if (dynamic) this.dynamics.push(s);
    else this.insert(s);
    return s;
  }

  private key(cx: number, cz: number): number {
    return (cx + 4096) * 8192 + (cz + 4096);
  }

  private insert(s: Solid): void {
    const x0 = Math.floor(s.minX / CELL);
    const x1 = Math.floor(s.maxX / CELL);
    const z0 = Math.floor(s.minZ / CELL);
    const z1 = Math.floor(s.maxZ / CELL);
    for (let cx = x0; cx <= x1; cx++)
      for (let cz = z0; cz <= z1; cz++) {
        const k = this.key(cx, cz);
        let arr = this.grid.get(k);
        if (!arr) this.grid.set(k, (arr = []));
        arr.push(s);
      }
  }

  /** 箱と重なる有効な Solid（接しているだけのものは含まない） */
  query(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number, out: Solid[] = []): Solid[] {
    out.length = 0;
    const n = ++this.stampN;
    const x0 = Math.floor(minX / CELL);
    const x1 = Math.floor(maxX / CELL);
    const z0 = Math.floor(minZ / CELL);
    const z1 = Math.floor(maxZ / CELL);
    const test = (s: Solid) => {
      if (!s.enabled || this.stamp.get(s.id) === n) return;
      this.stamp.set(s.id, n);
      if (s.minX < maxX - EPS && s.maxX > minX + EPS && s.minY < maxY - EPS && s.maxY > minY + EPS && s.minZ < maxZ - EPS && s.maxZ > minZ + EPS)
        out.push(s);
    };
    for (let cx = x0; cx <= x1; cx++)
      for (let cz = z0; cz <= z1; cz++) {
        const arr = this.grid.get(this.key(cx, cz));
        if (arr) for (const s of arr) test(s);
      }
    for (const s of this.dynamics) test(s);
    return out;
  }

  private scratch: Solid[] = [];

  bodyOverlaps(b: Body, x = b.x, y = b.y, z = b.z): Solid[] {
    return this.query(x - b.hw, y, z - b.hw, x + b.hw, y + b.h, z + b.hw, this.scratch);
  }

  isFree(b: Body, x: number, y: number, z: number): boolean {
    return this.bodyOverlaps(b, x, y, z).length === 0;
  }

  /** 体を (dx,dy,dz) 動かし、軸ごとに押し戻す。stepUp > 0 なら接地中の小さな段を自動で上る。 */
  moveBody(b: Body, dx: number, dy: number, dz: number, stepUp = 0): void {
    const wasGround = b.onGround;
    b.hitWall = false;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) / 0.18));
    const sx = dx / steps;
    const sy = dy / steps;
    const sz = dz / steps;
    let grounded = false;
    let ground: Solid | null = null;
    for (let i = 0; i < steps; i++) {
      this.moveAxis(b, 0, sx, wasGround || grounded ? stepUp : 0);
      this.moveAxis(b, 2, sz, wasGround || grounded ? stepUp : 0);
      // Y
      b.y += sy;
      const hits = this.bodyOverlaps(b);
      if (hits.length) {
        if (sy <= 0) {
          let top = -Infinity;
          for (const s of hits) if (s.maxY > top) { top = s.maxY; ground = s; }
          b.y = top;
          grounded = true;
          if (b.vy < 0) b.vy = 0;
        } else {
          let bottom = Infinity;
          for (const s of hits) bottom = Math.min(bottom, s.minY);
          b.y = bottom - b.h - EPS;
          if (b.vy > 0) b.vy = 0;
        }
      }
    }
    // 下に足場があるか（動かなくても接地を保つ）
    if (!grounded && dy <= 0) {
      const below = this.query(b.x - b.hw, b.y - 0.02, b.z - b.hw, b.x + b.hw, b.y + 0.001, b.z + b.hw, this.scratch);
      for (const s of below)
        if (Math.abs(s.maxY - b.y) < 0.025) {
          grounded = true;
          ground = s;
        }
    }
    b.onGround = grounded;
    b.ground = grounded ? ground : null;
  }

  private moveAxis(b: Body, axis: 0 | 2, d: number, stepUp: number): void {
    if (d === 0) return;
    if (axis === 0) b.x += d;
    else b.z += d;
    const hits = this.bodyOverlaps(b);
    if (!hits.length) return;
    // 段差：当たった物の上面が足元から stepUp 以内で、上に空きがあれば上る
    if (stepUp > 0) {
      let top = -Infinity;
      for (const s of hits) top = Math.max(top, s.maxY);
      if (top - b.y <= stepUp && top > b.y && this.isFree(b, b.x, top + EPS, b.z)) {
        b.y = top + EPS;
        return;
      }
    }
    b.hitWall = true;
    if (axis === 0) {
      if (d > 0) {
        let m = Infinity;
        for (const s of hits) m = Math.min(m, s.minX);
        b.x = m - b.hw - EPS;
      } else {
        let m = -Infinity;
        for (const s of hits) m = Math.max(m, s.maxX);
        b.x = m + b.hw + EPS;
      }
      b.vx = 0;
    } else {
      if (d > 0) {
        let m = Infinity;
        for (const s of hits) m = Math.min(m, s.minZ);
        b.z = m - b.hw - EPS;
      } else {
        let m = -Infinity;
        for (const s of hits) m = Math.max(m, s.maxZ);
        b.z = m + b.hw + EPS;
      }
      b.vz = 0;
    }
  }

  /** 動く足場を新しい位置へ。上に乗っていた体を運び、下から押し上げた体を上へ出す。 */
  moveSolid(s: Solid, nx: number, ny: number, nz: number, bodies: Body[]): void {
    const dx = nx - s.minX;
    const dy = ny - s.minY;
    const dz = nz - s.minZ;
    s.dx = dx;
    s.dy = dy;
    s.dz = dz;
    if (dx === 0 && dy === 0 && dz === 0) return;
    const riders = bodies.filter((b) => b.ground === s);
    s.minX += dx;
    s.maxX += dx;
    s.minY += dy;
    s.maxY += dy;
    s.minZ += dz;
    s.maxZ += dz;
    for (const b of riders) {
      b.y = s.maxY; // 乗っている物は上面に付いていく
      this.moveBody(b, dx, 0, dz, 0);
      b.onGround = true;
      b.ground = s;
    }
    if (!s.enabled) return;
    for (const b of bodies) {
      if (riders.includes(b)) continue;
      const over =
        b.x + b.hw > s.minX && b.x - b.hw < s.maxX && b.z + b.hw > s.minZ && b.z - b.hw < s.maxZ && b.y < s.maxY && b.y + b.h > s.minY;
      if (over && b.y + b.h * 0.5 > (s.minY + s.maxY) * 0.5) {
        b.y = s.maxY;
        b.onGround = true;
        b.ground = s;
        if (b.vy < 0) b.vy = 0;
      }
    }
  }
}
