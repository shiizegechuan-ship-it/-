import { describe, expect, it } from 'vitest';
import { PhysicsWorld, newBody } from '../src/core/physics';

describe('物理（AABB）', () => {
  it('床に落ちて止まり、接地する', () => {
    const w = new PhysicsWorld();
    w.add({ min: [-5, -1, -5], max: [5, 0, 5] });
    const b = newBody(0, 2, 0, 0.25, 1.4);
    for (let i = 0; i < 120; i++) {
      b.vy -= 27 / 60;
      w.moveBody(b, 0, b.vy / 60, 0);
    }
    expect(b.y).toBeCloseTo(0, 5);
    expect(b.onGround).toBe(true);
  });

  it('壁を抜けない（速く動いても）', () => {
    const w = new PhysicsWorld();
    w.add({ min: [-5, -1, -5], max: [5, 0, 5] });
    w.add({ min: [1, 0, -5], max: [1.2, 3, 5] });
    const b = newBody(0, 0, 0, 0.25, 1.4);
    for (let i = 0; i < 30; i++) w.moveBody(b, 0.5, -0.01, 0);
    expect(b.x).toBeLessThanOrEqual(1 - 0.25 + 1e-3);
    expect(b.hitWall).toBe(true);
  });

  it('低い段は自動で上り、高い段は上らない', () => {
    const w = new PhysicsWorld();
    w.add({ min: [-5, -1, -5], max: [5, 0, 5] });
    w.add({ min: [1, 0, -5], max: [5, 0.3, 5] }); // 0.3 の段
    w.add({ min: [-5, 0, -5], max: [-1, 0.6, 5] }); // 0.6 の段
    const b = newBody(0, 0, 0, 0.25, 1.4);
    w.moveBody(b, 0, -0.01, 0);
    for (let i = 0; i < 20; i++) w.moveBody(b, 0.1, -0.01, 0, 0.34);
    expect(b.y).toBeCloseTo(0.3, 2);
    const c = newBody(0, 0, 0, 0.25, 1.4);
    w.moveBody(c, 0, -0.01, 0);
    for (let i = 0; i < 20; i++) w.moveBody(c, -0.1, -0.01, 0, 0.34);
    expect(c.y).toBeCloseTo(0, 2);
    expect(c.x).toBeGreaterThan(-1);
  });

  it('動く足場は乗った体を運ぶ', () => {
    const w = new PhysicsWorld();
    const s = w.add({ min: [-1, -1, -1], max: [1, 0, 1] }, true);
    const b = newBody(0, 0.5, 0, 0.25, 1.4);
    w.moveBody(b, 0, -1, 0);
    expect(b.ground).toBe(s);
    for (let i = 0; i < 60; i++) w.moveSolid(s, s.minX, s.minY + 0.02, s.minZ, [b]);
    expect(b.y).toBeCloseTo(1.2, 3);
    expect(b.ground).toBe(s);
  });

  it('下からせり上がる足場は体を上へ押し出す', () => {
    const w = new PhysicsWorld();
    w.add({ min: [-5, -1, -5], max: [5, 0, 5] });
    const s = w.add({ min: [-1, -2, -1], max: [1, -0.05, 1] }, true);
    const b = newBody(0, 0, 0, 0.25, 1.4);
    w.moveBody(b, 0, -0.01, 0);
    for (let i = 0; i < 40; i++) w.moveSolid(s, s.minX, s.minY + 0.05, s.minZ, [b]);
    expect(b.y).toBeCloseTo(s.maxY, 3);
  });

  it('無効な Solid は当たらない', () => {
    const w = new PhysicsWorld();
    const s = w.add({ min: [-5, -1, -5], max: [5, 0, 5] });
    s.enabled = false;
    const b = newBody(0, 0.1, 0, 0.25, 1.4);
    w.moveBody(b, 0, -0.5, 0);
    expect(b.y).toBeLessThan(0);
  });
});
