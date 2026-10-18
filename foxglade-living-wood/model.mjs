import { WORLD, terrainHeight, isBridge, isPond } from './world-data.mjs';

export const FIXED_DT = 1 / 60;
export const PLAYER_RADIUS = 0.45;
const WALK_SPEED = 4, RUN_SPEED = 7, JUMP_SPEED = 6, GRAVITY = 18;
export const ACTIONS = Object.freeze({ sneakSpeed: 1.6, pounceSpeed: 8, pounceDuration: 0.3,
  pounceJumpSpeed: 4.5, pounceCooldown: 1.25, callDuration: 0.65, callCooldown: 1 });
const finite = (x, fallback = 0) => typeof x === 'number' && Number.isFinite(x) ? x : fallback;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const distanceTo = (state, p) => Math.hypot(state.x - p.x, state.z - p.z);
const supportAt = (x, z) => isBridge(x, z) ? WORLD.bridge.deckY : isPond(x, z) ? null : terrainHeight(x, z);

export function createState() {
  return { x: WORLD.spawn.x, y: terrainHeight(WORLD.spawn.x, WORLD.spawn.z), z: WORLD.spawn.z,
    yaw: Math.PI, vy: 0, speed: 0, grounded: true, time: 0, animation: 'idle',
    collectedIds: [], activatedIds: [], carried: 0, totalCollected: 0, status: 'playing', freeRoam: false,
    checkpoint: { x: WORLD.spawn.x, y: 0, z: WORLD.spawn.z }, deaths: 0, jumpCount: 0,
    events: [], sniffUntil: 0, sitting: false, action: 'idle',
    pounceUntil: 0, pounceReadyAt: 0, pounceCount: 0, pounceDirection: { x: 0, z: -1 },
    callUntil: 0, callReadyAt: 0, callCount: 0,
    _pressed: { jump: false, interact: false, sniff: false, pounce: false, sit: false, call: false } };
}

function collide(x, z) {
  // At the maximum allowed dt each substep is <= 0.134m, below the smallest
  // collider diameter. Iteration resolves the circle proxies, not visual foliage.
  for (let iteration = 0; iteration < 4; iteration++) {
    for (const obstacle of WORLD.obstacles) {
      const dx = x - obstacle.x, dz = z - obstacle.z;
      const separation = Math.hypot(dx, dz), required = PLAYER_RADIUS + obstacle.radius;
      if (separation < required) {
        const nx = separation > 1e-9 ? dx / separation : 1;
        const nz = separation > 1e-9 ? dz / separation : 0;
        x = obstacle.x + nx * required;
        z = obstacle.z + nz * required;
      }
    }
    const dist = Math.hypot(x, z), max = WORLD.radius - PLAYER_RADIUS;
    if (dist > max) { x *= max / dist; z *= max / dist; }
  }
  return { x, z };
}
function resetAfterFall(state) {
  const { x, y, z } = state.checkpoint;
  state.x = x; state.y = y; state.z = z;
  state.vy = 0; state.speed = 0; state.grounded = true;
  state.sitting = false; state.pounceUntil = state.time; state.callUntil = state.time;
  state.deaths++;
  state.events.push({ type: 'fall', checkpoint: { x, y, z } });
}
function collect(state) {
  if (state.y > 2 || state.y < -0.3) return;
  for (const wisp of WORLD.wisps) {
    if (!state.collectedIds.includes(wisp.id) && distanceTo(state, wisp) <= 1.15) {
      state.collectedIds.push(wisp.id); state.carried++; state.totalCollected++;
      state.events.push({ type: 'collect', id: wisp.id, carried: state.carried });
    }
  }
}
function interact(state) {
  if (!state.grounded) return;
  const shrine = WORLD.shrines.find(p => !state.activatedIds.includes(p.id) && distanceTo(state, p) <= 3);
  if (!shrine) return;
  if (state.carried < 3) { state.events.push({ type: 'need-wisps', id: shrine.id, needed: 3 - state.carried }); return; }
  state.carried -= 3;
  state.activatedIds.push(shrine.id);
  state.checkpoint = { x: shrine.x, y: terrainHeight(shrine.x, shrine.z), z: shrine.z };
  state.events.push({ type: 'shrine', id: shrine.id });
}

/** Mutates and returns state. Supply world-axis movement, never camera angles.
 * A caller should use FIXED_DT. Other finite dt values are bounded to [0,0.1]
 * and substepped; this is not an arbitrary-time seek or a physics simulation.
 * Jump, interact, sniff, pounce, sit and call trigger on rising boolean edges.
 * Sneak is held. Pounce is a bounded authored impulse with real vertical
 * integration, not an animation teleport or a learned locomotion policy.
 */
export function step(state, input = {}, dt = FIXED_DT) {
  input = input && typeof input === 'object' ? input : {};
  dt = clamp(finite(dt, FIXED_DT), 0, 0.1);
  state.events = [];
  // A paused/zero-time frame must not consume a newly pressed action.
  if (dt === 0) return state;
  const pressed = Object.fromEntries(['jump', 'interact', 'sniff', 'pounce', 'sit', 'call'].map(k => [k, input[k] === true]));
  const edge = Object.fromEntries(Object.keys(pressed).map(k => [k, pressed[k] && !state._pressed[k]]));
  state._pressed = pressed;
  if (state.status === 'won' && !state.freeRoam) { state.time += dt; state.speed = 0; state.animation = 'celebrate'; state.action = 'celebrate'; return state; }
  if (edge.sniff) { state.sniffUntil = state.time + 4; state.events.push({ type: 'sniff' }); }
  let mx = clamp(finite(input.moveX), -1, 1), mz = clamp(finite(input.moveZ), -1, 1);
  const magnitude = Math.hypot(mx, mz);
  if (magnitude > 1) { mx /= magnitude; mz /= magnitude; }
  const moving = magnitude > 0.001;
  if (moving || edge.jump || edge.pounce || input.sneak === true) state.sitting = false;
  if (edge.sit && state.grounded && !moving && !edge.jump && !edge.pounce && input.sneak !== true) {
    state.sitting = !state.sitting; state.events.push({ type: state.sitting ? 'sit' : 'stand' });
  }
  if (moving && state.time >= state.pounceUntil) state.yaw = Math.atan2(mx, mz);
  if (edge.call && state.grounded && state.time + 1e-9 >= state.callReadyAt) {
    state.callCount++; state.callUntil = state.time + ACTIONS.callDuration;
    state.callReadyAt = state.time + ACTIONS.callCooldown;
    state.sitting = false; state.events.push({ type: 'call', count: state.callCount });
  }
  if (edge.pounce && state.grounded && state.time + 1e-9 >= state.pounceReadyAt) {
    state.pounceDirection = { x: Math.sin(state.yaw), z: Math.cos(state.yaw) };
    state.pounceUntil = state.time + ACTIONS.pounceDuration;
    state.pounceReadyAt = state.time + ACTIONS.pounceCooldown;
    state.vy = ACTIONS.pounceJumpSpeed; state.grounded = false; state.pounceCount++;
    state.callUntil = state.time; state.events.push({ type: 'pounce', count: state.pounceCount });
  } else if (edge.jump && state.grounded) {
    state.vy = JUMP_SPEED; state.grounded = false; state.jumpCount++;
    state.callUntil = state.time; state.events.push({ type: 'jump' });
  }
  const targetSpeed = input.sneak === true ? ACTIONS.sneakSpeed : input.sprint === true ? RUN_SPEED : WALK_SPEED;
  const subdivisions = Math.max(1, Math.ceil(dt / FIXED_DT)), h = dt / subdivisions;
  let horizontalDistance = 0;
  let reset = false;
  for (let i = 0; i < subdivisions; i++) {
    const burst = Math.min(h, Math.max(0, state.pounceUntil - state.time));
    const normalTime = h - burst;
    const dx = state.pounceDirection.x * ACTIONS.pounceSpeed * burst + mx * targetSpeed * normalTime;
    const dz = state.pounceDirection.z * ACTIONS.pounceSpeed * burst + mz * targetSpeed * normalTime;
    const position = collide(state.x + dx, state.z + dz);
    horizontalDistance += Math.hypot(position.x - state.x, position.z - state.z);
    state.x = position.x; state.z = position.z;
    const support = supportAt(state.x, state.z);
    if (state.grounded && support !== null && Math.abs(support - state.y) <= 0.4) {
      state.y = support; state.vy = 0;
    } else {
      state.grounded = false;
      const oldY = state.y;
      state.vy -= GRAVITY * h; state.y += state.vy * h;
      if (support !== null && oldY >= support - 1e-9 && state.y <= support && state.vy <= 0) {
        state.y = support; state.vy = 0; state.grounded = true;
        state.events.push({ type: 'land' });
      }
    }
    state.time += h;
    if (state.y < -2) { resetAfterFall(state); reset = true; break; }
    collect(state);
  }
  if (!reset && edge.interact) interact(state);
  state.speed = reset ? 0 : horizontalDistance / dt;
  if (state.status !== 'won' && WORLD.shrines.every(p => state.activatedIds.includes(p.id))
      && WORLD.wisps.every(p => state.collectedIds.includes(p.id))
      && state.grounded && distanceTo(state, WORLD.den) <= 3) {
    state.status = 'won'; state.speed = 0; state.events.push({ type: 'win' });
  }
  state.animation = state.status === 'won' && !state.freeRoam ? 'celebrate'
    : !state.grounded ? state.time < state.pounceUntil ? 'pounce' : state.vy > 0 ? 'jump' : 'fall'
    : state.speed > 0.15 ? input.sneak === true ? 'sneak' : input.sprint === true ? 'run' : 'walk'
    : state.sitting ? 'sit' : state.time < state.callUntil ? 'bark' : 'idle';
  state.action = state.animation;
  return state;
}

/** JSON-safe public state, detached from the mutable simulation. */
export function snapshot(state) {
  const { _pressed, ...publicState } = state;
  return JSON.parse(JSON.stringify(publicState));
}
export function nextObjective(state) {
  if (state.status === 'won') return { type: 'complete', id: 'home', label: 'The grove is glowing. You brought everyone home.', ...WORLD.den, distance: distanceTo(state, WORLD.den), remaining: 0 };
  if (state.activatedIds.length === WORLD.shrines.length) return { type: 'den', id: 'home', label: 'Return to your den', ...WORLD.den, distance: distanceTo(state, WORLD.den), remaining: 1 };
  const wantShrine = state.carried >= 3;
  const options = wantShrine ? WORLD.shrines.filter(p => !state.activatedIds.includes(p.id)) : WORLD.wisps.filter(p => !state.collectedIds.includes(p.id));
  const target = [...options].sort((a, b) => distanceTo(state, a) - distanceTo(state, b))[0];
  if (!target) return { type: 'den', id: 'home', label: 'Follow the trail home', ...WORLD.den, distance: distanceTo(state, WORLD.den), remaining: 1 };
  return { type: wantShrine ? 'shrine' : 'wisp', id: target.id,
    label: wantShrine ? 'Bring three wisps to a moon shrine' : `Find ${3 - state.carried} more ${3 - state.carried === 1 ? 'wisp' : 'wisps'}`,
    x: target.x, z: target.z, distance: distanceTo(state, target), remaining: wantShrine ? WORLD.shrines.length - state.activatedIds.length : 3 - state.carried };
}
