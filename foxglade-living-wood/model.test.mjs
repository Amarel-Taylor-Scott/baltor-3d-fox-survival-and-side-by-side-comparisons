import test from 'node:test';
import assert from 'node:assert/strict';
import { WORLD, terrainHeight, isBridge, isPond } from './world-data.mjs';
import { createState, step, snapshot, nextObjective, FIXED_DT, PLAYER_RADIUS, ACTIONS } from './model.mjs';
const near = (a, b, epsilon = 1e-8) => assert.ok(Math.abs(a - b) < epsilon, `${a} differs from ${b}`);
const frames = (state, input, n) => { for (let i = 0; i < n; i++) step(state, input); return state; };
function teleport(s, p) { s.x = p.x; s.z = p.z; s.y = 0; s.vy = 0; s.grounded = true; }
function take(s, wisp) { teleport(s, wisp); step(s, {}); }

test('seeded data provides the complete requested layout and clear POIs', () => {
  assert.equal(WORLD.wisps.length, 9); assert.equal(WORLD.shrines.length, 3);
  assert.equal(WORLD.obstacles.length, 84);
  assert.equal(WORLD.generation.placedObstacles, WORLD.generation.requestedObstacles);
  assert.ok(WORLD.generation.rejectedPlacements > 0);
  assert.equal(terrainHeight(10, -13), 0);
  for (const o of WORLD.obstacles) {
    assert.ok(Math.hypot(o.x, o.z) + o.radius < WORLD.radius);
    for (const p of [WORLD.den, ...WORLD.wisps, ...WORLD.shrines]) assert.ok(Math.hypot(o.x - p.x, o.z - p.z) >= 3.5 + o.radius);
    assert.ok(!isPond(o.x, o.z));
  }
  assert.ok(Object.isFrozen(WORLD.obstacles[0]));
});
test('same time and input trace produces identical public snapshots', () => {
  const a = createState(), b = createState();
  for (let i = 0; i < 1200; i++) {
    const input = { moveX: Math.sin(i / 100), moveZ: Math.cos(i / 100), jump: i % 95 < 5, sprint: i % 200 < 100, sniff: i % 120 === 0 };
    step(a, input); step(b, input);
  }
  assert.deepEqual(snapshot(a), snapshot(b));
});
test('walk, sprint and diagonal movement are normalized in a clear area', () => {
  const walk = createState(), diagonal = createState(), sprint = createState();
  frames(walk, { moveZ: -1 }, 30); frames(diagonal, { moveX: -1, moveZ: -1 }, 30); frames(sprint, { moveZ: -1, sprint: true }, 30);
  near(Math.hypot(walk.x, walk.z - 22), 2); near(Math.hypot(diagonal.x, diagonal.z - 22), 2);
  near(Math.hypot(sprint.x, sprint.z - 22), 3.5); near(diagonal.yaw, -3 * Math.PI / 4);
});
test('circle collider prevents travelling through a tree or rock', () => {
  const obstacle = WORLD.obstacles[0], s = createState();
  teleport(s, { x: obstacle.x - obstacle.radius - PLAYER_RADIUS - 0.2, z: obstacle.z });
  frames(s, { moveX: 1, sprint: true }, 30);
  assert.ok(s.x < obstacle.x);
  assert.ok(Math.hypot(s.x - obstacle.x, s.z - obstacle.z) >= obstacle.radius + PLAYER_RADIUS - 1e-8);
});
test('world boundary includes player collision radius', () => {
  const s = createState(); teleport(s, { x: 0, z: 39.5 });
  frames(s, { moveZ: 1, sprint: true }, 120);
  assert.ok(Math.hypot(s.x, s.z) <= WORLD.radius - PLAYER_RADIUS + 1e-8);
});
test('one held jump causes one launch then lands without repeat jumping', () => {
  const s = createState(); step(s, { jump: true });
  assert.equal(s.jumpCount, 1); assert.ok(!s.grounded); assert.ok(s.y > 0);
  frames(s, { jump: true }, 100);
  assert.equal(s.jumpCount, 1); assert.equal(s.grounded, true); near(s.y, 0);
  step(s, {}); step(s, { jump: true }); assert.equal(s.jumpCount, 2);
});
test('bridge supplies its exact deck height over the geometric pond', () => {
  assert.ok(isBridge(5, 4)); assert.ok(isPond(5, 4)); assert.ok(!isBridge(5, 6));
  const s = createState(); teleport(s, { x: -2.9, z: 4 });
  frames(s, { moveX: 1 }, 120);
  near(s.y, WORLD.bridge.deckY); assert.equal(s.deaths, 0); assert.ok(s.grounded);
});
test('pond causes a fall and reset without losing objective progress', () => {
  const s = createState(); take(s, WORLD.wisps[0]);
  teleport(s, { x: 5, z: 8 });
  let observedFall = false;
  for (let i = 0; i < 120 && !s.deaths; i++) { step(s, {}); observedFall ||= s.events.some(e => e.type === 'fall'); }
  assert.equal(s.deaths, 1); assert.equal(s.carried, 1); assert.equal(s.totalCollected, 1);
  near(s.x, WORLD.spawn.x); near(s.z, WORLD.spawn.z); assert.ok(observedFall);
});
test('wisp collection is unique and snapshots are detached', () => {
  const s = createState(); take(s, WORLD.wisps[0]); frames(s, {}, 30);
  assert.equal(s.carried, 1); assert.equal(s.totalCollected, 1); assert.deepEqual(s.collectedIds, ['wisp-1']);
  const copy = snapshot(s); copy.collectedIds.push('bad'); copy.checkpoint.x = 100;
  assert.equal(s.collectedIds.length, 1); assert.equal(s.checkpoint.x, 0); assert.ok(!('_pressed' in copy));
});
test('shrine needs three wisps and an interact edge, consumes exactly three', () => {
  const s = createState(); teleport(s, WORLD.shrines[0]); step(s, { interact: true });
  assert.equal(s.activatedIds.length, 0); assert.equal(s.events[0].type, 'need-wisps');
  WORLD.wisps.slice(0, 3).forEach(w => take(s, w));
  assert.equal(nextObjective(s).type, 'shrine');
  teleport(s, WORLD.shrines[0]); step(s, {}); step(s, { interact: true });
  assert.equal(s.carried, 0); assert.deepEqual(s.activatedIds, ['shrine-1']);
  assert.deepEqual(s.checkpoint, { x: WORLD.shrines[0].x, y: 0, z: WORLD.shrines[0].z });
  frames(s, { interact: true }, 10); assert.equal(s.carried, 0); assert.equal(s.activatedIds.length, 1);
});
test('last activated shrine becomes a safe checkpoint', () => {
  const s = createState(); WORLD.wisps.slice(0, 3).forEach(w => take(s, w));
  teleport(s, WORLD.shrines[0]); step(s, { interact: true });
  teleport(s, { x: 5, z: 8 }); frames(s, {}, 60);
  assert.equal(s.deaths, 1); near(s.x, WORLD.shrines[0].x); near(s.z, WORLD.shrines[0].z); assert.equal(s.activatedIds.length, 1);
});
test('win requires all three shrines and a grounded return to den', () => {
  const s = createState(); step(s, { interact: true }); assert.equal(s.status, 'playing');
  for (let group = 0; group < 3; group++) {
    WORLD.wisps.slice(group * 3, group * 3 + 3).forEach(w => take(s, w));
    teleport(s, WORLD.shrines[group]); step(s, {}); step(s, { interact: true });
  }
  assert.equal(s.status, 'playing'); assert.equal(s.totalCollected, 9); assert.equal(s.carried, 0);
  assert.equal(nextObjective(s).type, 'den');
  teleport(s, WORLD.den); step(s, {}); assert.equal(s.status, 'won'); assert.equal(s.animation, 'celebrate');
  assert.ok(s.events.some(e => e.type === 'win')); assert.equal(nextObjective(s).type, 'complete');
  const x = s.x; frames(s, { moveX: 1, jump: true }, 60); near(s.x, x);
});
test('malformed inputs and dt stay finite and bounded', () => {
  const s = createState();
  for (const input of [null, undefined, {}, 'bad', { moveX: Infinity, moveZ: NaN }, { moveX: -900, moveZ: 800, jump: 'true' }]) step(s, input, Infinity);
  step(s, { moveZ: -1 }, 1e9); step(s, { moveX: 1 }, -5);
  for (const key of ['x', 'y', 'z', 'yaw', 'vy', 'speed', 'time']) assert.ok(Number.isFinite(s[key]));
  assert.equal(s.jumpCount, 0); assert.ok(s.time <= 6 * FIXED_DT + 0.1 + 1e-8);
});
test('sniff is time-bounded and events clear on each step', () => {
  const s = createState(); step(s, { sniff: true });
  assert.ok(s.events.some(e => e.type === 'sniff')); near(s.sniffUntil, 4);
  step(s, { sniff: true }); assert.equal(s.events.length, 0); near(s.sniffUntil, 4);
  assert.equal(nextObjective(s).type, 'wisp');
});
test('protected authored route is playable end to end without teleporting or falling', () => {
  const s = createState();
  let steps = 0;
  for (const target of WORLD.route.slice(1)) {
    let distance = Math.hypot(target.x - s.x, target.z - s.z);
    while (distance > 0.18 && steps < 12000) {
      step(s, { moveX: (target.x - s.x) / distance, moveZ: (target.z - s.z) / distance });
      steps++;
      distance = Math.hypot(target.x - s.x, target.z - s.z);
      if (s.status === 'won') break;
    }
    if (target.id?.startsWith('shrine')) { step(s, {}); step(s, { interact: true }); }
    if (s.status === 'won') break;
  }
  assert.ok(steps < 12000); assert.equal(s.deaths, 0); assert.equal(s.status, 'won');
  assert.equal(s.totalCollected, 9); assert.equal(s.activatedIds.length, 3);
});
test('post-win free roam preserves completion and never repeats the win event', () => {
  const s = createState(); assert.equal(s.freeRoam, false);
  WORLD.wisps.forEach(w => take(s, w));
  for (const shrine of WORLD.shrines) { teleport(s, shrine); step(s, {}); step(s, { interact: true }); }
  teleport(s, WORLD.den); step(s, {});
  assert.equal(s.status, 'won'); assert.ok(s.events.some(e => e.type === 'win'));
  const collected = [...s.collectedIds], activated = [...s.activatedIds], startZ = s.z;
  s.freeRoam = true;
  let repeatWins = 0;
  for (let i = 0; i < 30; i++) { step(s, { moveZ: -1 }); repeatWins += s.events.filter(e => e.type === 'win').length; }
  assert.ok(s.z < startZ - 1.9); assert.equal(s.animation, 'walk'); assert.equal(repeatWins, 0);
  assert.equal(s.status, 'won'); assert.equal(s.totalCollected, 9); assert.equal(s.carried, 0);
  assert.deepEqual(s.collectedIds, collected); assert.deepEqual(s.activatedIds, activated);
  teleport(s, WORLD.den); step(s, {}); assert.equal(s.events.filter(e => e.type === 'win').length, 0);
  assert.equal(nextObjective(s).type, 'complete');
});
test('missing or duplicate objective IDs cannot trigger a win at home', () => {
  const s = createState(); WORLD.wisps.forEach(w => take(s, w));
  for (const shrine of WORLD.shrines.slice(0, 2)) { teleport(s, shrine); step(s, {}); step(s, { interact: true }); }
  teleport(s, WORLD.den); step(s, {}); assert.equal(s.status, 'playing');
  s.activatedIds.push(s.activatedIds[0]); step(s, {}); assert.equal(s.status, 'playing');
  s.activatedIds = WORLD.shrines.map(p => p.id); s.collectedIds.pop();
  step(s, {}); assert.equal(s.status, 'playing');
});
test('holding interact while entering shrine range requires release and a fresh press', () => {
  const s = createState(); WORLD.wisps.slice(0, 3).forEach(w => take(s, w));
  const shrine = WORLD.shrines[0]; teleport(s, { x: shrine.x, z: shrine.z + 3.4 });
  step(s, { interact: true }); frames(s, { interact: true, moveZ: -1 }, 12);
  assert.equal(s.activatedIds.length, 0); assert.equal(s.carried, 3);
  step(s, {}); step(s, { interact: true }); assert.equal(s.activatedIds.length, 1); assert.equal(s.carried, 0);
});
test('oversized inputs and dt cannot bypass the sprint speed bound', () => {
  const s = createState(); step(s, { moveX: -1e12, moveZ: -1e12, sprint: true }, 1e12);
  near(Math.hypot(s.x, s.z - 22), 0.7); near(s.time, 0.1); near(s.speed, 7);
});
test('zero-time frames preserve a new jump edge for the next real frame', () => {
  const s = createState(); step(s, { jump: true }, 0);
  assert.equal(s.jumpCount, 0); near(s.time, 0);
  step(s, { jump: true }); assert.equal(s.jumpCount, 1); assert.ok(!s.grounded);
});

test('sneak overrides sprint and returns to ordinary movement after release', () => {
  const s = createState(); frames(s, { moveZ: -1, sneak: true, sprint: true }, 30);
  near(22 - s.z, ACTIONS.sneakSpeed * 0.5); assert.equal(s.animation, 'sneak');
  step(s, { moveZ: -1 }); near(s.speed, 4); assert.equal(s.animation, 'walk');
});
test('sit toggles on edges, stays still, and movement cancels the pose', () => {
  const s = createState(); frames(s, { sit: true }, 60);
  assert.ok(s.sitting); assert.equal(s.animation, 'sit'); near(s.z, 22);
  step(s, {}); step(s, { sit: true }); assert.ok(!s.sitting);
  step(s, {}); step(s, { sit: true }); assert.ok(s.sitting);
  step(s, { moveZ: -1 }); assert.ok(!s.sitting); assert.equal(s.animation, 'walk');
});
test('jump and pounce cancel sitting; sit cannot suspend an airborne fox', () => {
  for (const action of ['jump', 'pounce']) {
    const s = createState(); step(s, { sit: true }); step(s, { [action]: true });
    assert.ok(!s.sitting); assert.ok(!s.grounded); assert.ok(s.y > 0);
    step(s, { sit: true }); assert.ok(!s.sitting); assert.ok(!s.grounded);
  }
});
test('pounce is edge-triggered, direction-locked, ballistic and distance-bounded', () => {
  const s = createState(); step(s, { pounce: true });
  assert.equal(s.pounceCount, 1); assert.equal(s.jumpCount, 0);
  assert.ok(!s.grounded && s.y > 0); assert.equal(s.animation, 'pounce');
  frames(s, { pounce: true }, 119);
  assert.equal(s.pounceCount, 1); assert.ok(s.grounded);
  near(s.y, 0); near(22 - s.z, ACTIONS.pounceSpeed * ACTIONS.pounceDuration); near(s.x, 0);
  step(s, {}); step(s, { pounce: true }); assert.equal(s.pounceCount, 2);
});
test('pounce cannot launch in midair and cooldown requires a fresh press', () => {
  const s = createState(); step(s, { pounce: true }); step(s, {}); step(s, { pounce: true });
  assert.equal(s.pounceCount, 1);
  frames(s, {}, 35); assert.ok(s.grounded);
  step(s, { pounce: true }); assert.equal(s.pounceCount, 1);
  frames(s, { pounce: true }, 90); assert.equal(s.pounceCount, 1);
  step(s, {}); step(s, { pounce: true }); assert.equal(s.pounceCount, 2);
});
test('pounce does not tunnel through a tree, even with oversized dt', () => {
  const o = WORLD.obstacles[0], s = createState();
  teleport(s, { x: o.x - o.radius - PLAYER_RADIUS - 0.2, z: o.z }); s.yaw = Math.PI / 2;
  for (let i = 0; i < 8; i++) {
    step(s, { pounce: true }, 1e6);
    assert.ok(s.x < o.x); assert.ok(Math.hypot(s.x - o.x, s.z - o.z) >= o.radius + PLAYER_RADIUS - 1e-8);
  }
  assert.equal(s.pounceCount, 1); assert.ok(s.grounded);
});
test('pounce over unsupported water still falls and resets to a safe checkpoint', () => {
  const s = createState(); teleport(s, { x: 5, z: 11.1 }); s.yaw = Math.PI;
  step(s, { pounce: true }); frames(s, {}, 100);
  assert.equal(s.deaths, 1); assert.equal(s.pounceCount, 1); assert.ok(s.grounded);
  near(s.x, WORLD.spawn.x); near(s.z, WORLD.spawn.z);
});
test('call is a bounded grounded one-shot with cooldown, not held-key repetition', () => {
  const s = createState(); step(s, { call: true });
  assert.equal(s.callCount, 1); assert.equal(s.animation, 'bark'); assert.equal(s.events[0].type, 'call');
  step(s, {}); step(s, { call: true }); assert.equal(s.callCount, 1);
  frames(s, { call: true }, 100); assert.equal(s.callCount, 1); assert.equal(s.animation, 'idle');
  step(s, {}); step(s, { call: true }); assert.equal(s.callCount, 2);
  step(s, { jump: true }); step(s, {}); step(s, { call: true }); assert.equal(s.callCount, 2);
});
test('zero-time frames do not consume new action edges', () => {
  for (const action of ['sit', 'call', 'pounce']) {
    const s = createState(); step(s, { [action]: true }, 0); step(s, { [action]: true });
    assert.ok(s.events.some(e => e.type === action));
  }
});
test('all expanded action inputs repeat exactly and keep bounded finite state', () => {
  const a = createState(), b = createState();
  for (let i = 0; i < 3600; i++) {
    const input = { moveX: Math.sin(i / 200), moveZ: Math.cos(i / 200), sneak: i % 200 < 40,
      sprint: i % 170 < 50, jump: i % 107 === 0, pounce: i % 90 === 0,
      call: i % 84 === 0, sit: i % 140 === 0, sniff: i % 110 === 0 };
    step(a, input); step(b, input);
    for (const k of ['x', 'y', 'z', 'yaw', 'vy', 'speed', 'time', 'pounceUntil', 'callUntil']) assert.ok(Number.isFinite(a[k]));
    assert.ok(Math.hypot(a.x, a.z) <= WORLD.radius - PLAYER_RADIUS + 1e-8);
  }
  assert.deepEqual(snapshot(a), snapshot(b));
});
