import test from 'node:test';
import assert from 'node:assert/strict';
import { WORLD } from './world-data.mjs';
import { createState, step } from './model.mjs';
import { demoInput } from './demo.mjs';
import { COMPANION, createCompanion, stepCompanion, companionSnapshot, companionPositionSafe, planCompanionPath } from './companion.mjs';
const near = (a, b, epsilon = 1e-7) => assert.ok(Math.abs(a - b) < epsilon, `${a} != ${b}`);
function checkPath(start, path) {
  let current = start;
  for (const target of path) {
    const d = Math.hypot(current.x - target.x, current.z - target.z), steps = Math.ceil(d / 0.05);
    for (let i = 0; i <= steps; i++) {
      const t = steps ? i / steps : 0;
      assert.ok(companionPositionSafe(current.x + (target.x - current.x) * t, current.z + (target.z - current.z) * t));
    }
    current = target;
  }
}
test('companion spawns safely with explicit non-trained controller provenance', () => {
  const c = createCompanion(); assert.ok(companionPositionSafe(c.x, c.z));
  assert.equal(c.trained, false); assert.equal(c.controller, 'authored-grid-pathfinding');
  assert.equal(c.y, 0); assert.equal(c.plans, 0);
});
test('safe navigation rejects water, collider interiors and out-of-world positions', () => {
  assert.ok(!companionPositionSafe(5, 8)); assert.ok(companionPositionSafe(5, 4));
  assert.ok(!companionPositionSafe(5, 5.5));
  assert.ok(!companionPositionSafe(WORLD.obstacles[0].x, WORLD.obstacles[0].z));
  assert.ok(!companionPositionSafe(40, 0)); assert.ok(!companionPositionSafe(NaN, 0));
});
test('accelerated obstacle bins agree with exhaustive safety checks across the world', () => {
  for (let i = 0; i < 4000; i++) {
    const x = Math.sin(i * 0.727) * 41, z = Math.cos(i * 1.613) * 41;
    const radius = COMPANION.radius;
    const inWorld = Math.hypot(x, z) <= WORLD.radius - radius - 0.03;
    const clear = WORLD.obstacles.every(o => Math.hypot(o.x - x, o.z - z) >= o.radius + radius + 0.05);
    const touchesWater = Math.hypot(x - WORLD.pond.x, z - WORLD.pond.z) < WORLD.pond.radius + radius;
    const supported = !touchesWater || x - radius >= WORLD.bridge.minX && x + radius <= WORLD.bridge.maxX
      && Math.abs(z - WORLD.bridge.z) + radius <= WORLD.bridge.width / 2;
    assert.equal(companionPositionSafe(x, z), inWorld && clear && supported);
  }
});
test('A-star route goes around obstacles without unsafe corner cutting', () => {
  const obstacle = WORLD.obstacles[0], radius = obstacle.radius + 1.3;
  const start = { x: obstacle.x - radius, z: obstacle.z }, goal = { x: obstacle.x + radius, z: obstacle.z };
  assert.ok(companionPositionSafe(start.x, start.z) && companionPositionSafe(goal.x, goal.z));
  const path = planCompanionPath(start, goal); assert.ok(path.length >= 2);
  checkPath(start, path); assert.deepEqual(path.at(-1), goal);
});
test('cross-pond navigation uses supported bridge instead of walking over water', () => {
  const start = { x: -4, z: 4 }, goal = { x: 13, z: 4 };
  const path = planCompanionPath(start, goal); assert.ok(path.length); checkPath(start, path);
  const c = createCompanion(); Object.assign(c, start);
  let bridgeSeen = false;
  for (let i = 0; i < 900; i++) {
    const before = { x: c.x, z: c.z }; stepCompanion(c, { ...goal, callCount: 0 });
    assert.ok(companionPositionSafe(c.x, c.z)); assert.ok(Math.hypot(c.x - before.x, c.z - before.z) <= COMPANION.maxSpeed / 60 + 1e-8);
    bridgeSeen ||= c.y === WORLD.bridge.deckY;
  }
  assert.ok(bridgeSeen); assert.ok(Math.hypot(c.x - goal.x, c.z - goal.z) >= COMPANION.stopDistance - 1e-6);
  assert.ok(Math.hypot(c.x - goal.x, c.z - goal.z) < 3.4); assert.equal(c.mode, 'beside-player');
});
test('following is bounded, never changes player and waits at unsafe targets', () => {
  const c = createCompanion(), p = { x: -3, z: 16, callCount: 0 }; const original = structuredClone(p);
  const before = { x: c.x, z: c.z }; stepCompanion(c, p, 1e9);
  assert.ok(Math.hypot(c.x - before.x, c.z - before.z) <= COMPANION.maxSpeed * 0.1 + 1e-8);
  assert.deepEqual(p, original);
  const saved = { x: c.x, z: c.z }; stepCompanion(c, { x: 5, z: 8, callCount: 0 });
  near(c.x, saved.x); near(c.z, saved.z); assert.equal(c.mode, 'waiting-on-bank');
});
test('companion call response is one-shot and rests beside a sitting player', () => {
  const c = createCompanion(), p = { x: c.x + COMPANION.sideOffset, z: c.z - COMPANION.backOffset, yaw: Math.PI, sitting: true, callCount: 1 };
  stepCompanion(c, p); assert.equal(c.callResponses, 1); assert.equal(c.events[0].type, 'companion-answer');
  assert.equal(c.animation, 'bark');
  for (let i = 0; i < 90; i++) stepCompanion(c, p);
  assert.equal(c.callResponses, 1); assert.equal(c.animation, 'sit');
  stepCompanion(c, { ...p, callCount: 2 }); assert.equal(c.callResponses, 2);
});
test('invalid inputs fail stationary and snapshots are detached', () => {
  const c = createCompanion(); stepCompanion(c, null); stepCompanion(c, { x: Infinity, z: 0 });
  near(c.x, -3.5); near(c.z, 20.5); assert.equal(c.speed, 0);
  const s = companionSnapshot(c); s.path.push({ x: 99, z: 99 }); assert.equal(c.path.length, 0);
  const start = structuredClone(c); stepCompanion(c, { x: 0, z: 0, callCount: 1 }, 0); near(c.time, start.time); assert.equal(c.lastCallCount, 0);
  assert.deepEqual(planCompanionPath(c, { x: 5, z: 8 }), []);
});
test('full actual-input tour repeats deterministically with safe continuous companion travel', () => {
  const a = createCompanion(), b = createCompanion(), player = createState();
  for (let i = 0; i < 3600; i++) {
    step(player, demoInput(player)); const before = { x: a.x, z: a.z };
    stepCompanion(a, player); stepCompanion(b, player);
    assert.ok(companionPositionSafe(a.x, a.z)); assert.ok(Math.hypot(a.x - before.x, a.z - before.z) <= COMPANION.maxSpeed / 60 + 1e-8);
    for (const key of ['x', 'y', 'z', 'yaw', 'time', 'speed']) assert.ok(Number.isFinite(a[key]));
  }
  assert.equal(player.status, 'won'); assert.equal(player.deaths, 0);
  assert.ok(a.distanceTravelled > 60); assert.ok(a.followDistance > 2.8 && a.followDistance < 3.4);
  assert.equal(a.mode, 'beside-player'); assert.equal(a.animation, 'sit');
  const settled = { x: a.x, z: a.z };
  for (let i = 0; i < 120; i++) { stepCompanion(a, player); near(a.x, settled.x); near(a.z, settled.z); assert.equal(a.mode, 'beside-player'); }
  for (let i = 0; i < 120; i++) stepCompanion(b, player);
  assert.deepEqual(companionSnapshot(a), companionSnapshot(b));
});
test('stationary side formation routes around the player instead of crossing the body', () => {
  const c = createCompanion(), player = { x: 0, z: 16, yaw: Math.PI / 2, callCount: 0 };
  Object.assign(c, { x: 0, z: 20 });
  for (let i = 0; i < 600; i++) {
    const before = { x: c.x, z: c.z }; stepCompanion(c, player);
    assert.ok(Math.hypot(c.x - before.x, c.z - before.z) <= COMPANION.maxSpeed / 60 + 1e-8);
    assert.ok(Math.hypot(c.x - player.x, c.z - player.z) >= COMPANION.stopDistance - 1e-6);
  }
  assert.equal(c.mode, 'beside-player'); assert.ok(c.z < player.z - 2.9);
});
test('a player entering the companion clearance triggers continuous outward movement, not a snap', () => {
  const c = createCompanion(), player = { x: c.x + 1, z: c.z, yaw: 0, callCount: 0 };
  const before = { x: c.x, z: c.z }; stepCompanion(c, player);
  assert.equal(c.mode, 'giving-space');
  assert.ok(Math.hypot(c.x - player.x, c.z - player.z) > 1);
  assert.ok(Math.hypot(c.x - before.x, c.z - before.z) <= COMPANION.maxSpeed / 60 + 1e-8);
});
