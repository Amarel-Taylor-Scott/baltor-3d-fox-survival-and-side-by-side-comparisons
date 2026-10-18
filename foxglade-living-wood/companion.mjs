import { WORLD, terrainHeight, isBridge } from './world-data.mjs';
import { FIXED_DT } from './model.mjs';

/** Authored companion AI, not a learned policy. Metres, Y-up, +Z forward.
 * A bounded 1m navigation grid uses the shared circle proxies and conservative
 * whole-footprint water/bridge support. It never teleports to catch up.
 * This conservatively avoids decorative-tree trunk proxies, not full meshes.
 */
export const COMPANION = Object.freeze({ radius: 0.32, maxSpeed: 5.4, walkSpeed: 3.4,
  stopDistance: 2.8, sideOffset: 3.15, backOffset: 0.65, arrivalRadius: 0.12,
  gridStep: 1, replanInterval: 0.65, maxPathNodes: 6241 });
const LIMIT = 39, SIZE = LIMIT * 2 + 1;
const finite = (n, fallback = 0) => typeof n === 'number' && Number.isFinite(n) ? n : fallback;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const idAt = (x, z) => (z + LIMIT) * SIZE + x + LIMIT;
const pointAt = id => ({ x: id % SIZE - LIMIT, z: Math.floor(id / SIZE) - LIMIT });
const supportAt = (x, z) => isBridge(x, z) ? WORLD.bridge.deckY : terrainHeight(x, z);
// Fixed obstacle bins reduce preload and per-frame checks without changing
// the shared geometric circles or treating foliage as collision geometry.
const BINSIZE = 5, obstacleBins = new Map();
for (const obstacle of WORLD.obstacles) {
  const r = obstacle.radius + COMPANION.radius + 0.05;
  for (let bz = Math.floor((obstacle.z - r) / BINSIZE); bz <= Math.floor((obstacle.z + r) / BINSIZE); bz++) {
    for (let bx = Math.floor((obstacle.x - r) / BINSIZE); bx <= Math.floor((obstacle.x + r) / BINSIZE); bx++) {
      const key = `${bx},${bz}`;
      if (!obstacleBins.has(key)) obstacleBins.set(key, []);
      obstacleBins.get(key).push(obstacle);
    }
  }
}

export function companionPositionSafe(x, z) {
  if (!Number.isFinite(x) || !Number.isFinite(z) || Math.hypot(x, z) > WORLD.radius - COMPANION.radius - 0.03) return false;
  const nearby = obstacleBins.get(`${Math.floor(x / BINSIZE)},${Math.floor(z / BINSIZE)}`) || [];
  if (nearby.some(o => Math.hypot(o.x - x, o.z - z) < o.radius + COMPANION.radius + 0.05)) return false;
  // Any circle overlapping the pond must fit wholly on the bridge. This is
  // intentionally stricter than true circle/bridge-union support at corners.
  if (Math.hypot(x - WORLD.pond.x, z - WORLD.pond.z) < WORLD.pond.radius + COMPANION.radius) {
    return x - COMPANION.radius >= WORLD.bridge.minX && x + COMPANION.radius <= WORLD.bridge.maxX
      && Math.abs(z - WORLD.bridge.z) + COMPANION.radius <= WORLD.bridge.width / 2;
  }
  return true;
}
function segmentSafe(a, b) {
  const d = distance(a, b), steps = Math.max(1, Math.ceil(d / 0.12));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (!companionPositionSafe(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false;
  }
  return true;
}
function playerClear(a, b, player) {
  if (!player) return true;
  const dx = b.x - a.x, dz = b.z - a.z, square = dx * dx + dz * dz;
  const t = clamp(((player.x - a.x) * dx + (player.z - a.z) * dz) / (square || 1), 0, 1);
  return Math.hypot(a.x + dx * t - player.x, a.z + dz * t - player.z) >= COMPANION.stopDistance - 1e-6;
}
let graph = null;
function getGraph() {
  if (graph) return graph;
  const nodes = new Map();
  for (let z = -LIMIT; z <= LIMIT; z++) for (let x = -LIMIT; x <= LIMIT; x++) {
    if (companionPositionSafe(x, z)) nodes.set(idAt(x, z), { x, z, links: [] });
  }
  for (const node of nodes.values()) {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (dz < 0 || dz === 0 && dx <= 0) continue;
      if (Math.abs(node.x + dx) > LIMIT || Math.abs(node.z + dz) > LIMIT) continue;
      const id = idAt(node.x + dx, node.z + dz), other = nodes.get(id);
      if (other && segmentSafe(node, other)) {
        const cost = Math.hypot(dx, dz);
        node.links.push({ id, cost }); other.links.push({ id: idAt(node.x, node.z), cost });
      }
    }
  }
  graph = nodes;
  return graph;
}
function nearestNode(point, nodes, player) {
  const cx = Math.round(point.x), cz = Math.round(point.z), options = [];
  for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
    if (Math.abs(cx + dx) > LIMIT || Math.abs(cz + dz) > LIMIT) continue;
    const id = idAt(cx + dx, cz + dz), node = nodes.get(id);
    if (node) options.push({ id, node, distance: distance(point, node) });
  }
  options.sort((a, b) => a.distance - b.distance || a.id - b.id);
  return options.find(option => playerClear(point, option.node, player) && segmentSafe(point, option.node))?.id ?? null;
}
// Small deterministic min-heap: stable ordering resolves equal-score paths.
class MinHeap {
  items = [];
  less(a, b) { return a.f < b.f || a.f === b.f && a.id < b.id; }
  push(value) {
    const a = this.items; a.push(value); let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (!this.less(a[i], a[p])) break; [a[i], a[p]] = [a[p], a[i]]; i = p; }
  }
  pop() {
    const a = this.items, result = a[0], last = a.pop();
    if (a.length) {
      a[0] = last; let i = 0;
      while (true) {
        let next = i, left = i * 2 + 1, right = left + 1;
        if (left < a.length && this.less(a[left], a[next])) next = left;
        if (right < a.length && this.less(a[right], a[next])) next = right;
        if (next === i) break;
        [a[i], a[next]] = [a[next], a[i]]; i = next;
      }
    }
    return result;
  }
}

export function planCompanionPath(start, destination, avoidPlayer = null) {
  if (!companionPositionSafe(start?.x, start?.z) || !companionPositionSafe(destination?.x, destination?.z)) return [];
  if (playerClear(start, destination, avoidPlayer) && segmentSafe(start, destination)) return [{ x: destination.x, z: destination.z }];
  const nodes = getGraph(), from = nearestNode(start, nodes, avoidPlayer), to = nearestNode(destination, nodes, avoidPlayer);
  if (from === null || to === null) return [];
  const heap = new MinHeap(), cost = new Map([[from, 0]]), previous = new Map(), closed = new Set();
  heap.push({ id: from, f: distance(nodes.get(from), nodes.get(to)) });
  while (heap.items.length && closed.size < COMPANION.maxPathNodes) {
    const current = heap.pop().id;
    if (closed.has(current)) continue;
    if (current === to) {
      const ids = [to];
      while (ids.at(-1) !== from) ids.push(previous.get(ids.at(-1)));
      const raw = ids.reverse().map(pointAt); raw.push({ x: destination.x, z: destination.z });
      // Visibility smoothing preserves collision and water checks along each segment.
      const smooth = []; let anchor = start, index = 0;
      while (index < raw.length) {
        let farthest = index;
        for (let candidate = index + 1; candidate < raw.length; candidate++) {
          if (playerClear(anchor, raw[candidate], avoidPlayer) && segmentSafe(anchor, raw[candidate])) farthest = candidate;
        }
        smooth.push(raw[farthest]); anchor = raw[farthest]; index = farthest + 1;
      }
      return smooth;
    }
    closed.add(current);
    for (const link of nodes.get(current).links) {
      if (closed.has(link.id) || !playerClear(nodes.get(current), nodes.get(link.id), avoidPlayer)) continue;
      const candidate = cost.get(current) + link.cost;
      if (candidate + 1e-9 < (cost.get(link.id) ?? Infinity)) {
        cost.set(link.id, candidate); previous.set(link.id, current);
        heap.push({ id: link.id, f: candidate + distance(nodes.get(link.id), nodes.get(to)) });
      }
    }
  }
  return [];
}

export function createCompanion() {
  const x = WORLD.spawn.x - 3.5, z = WORLD.spawn.z - 1.5;
  if (!companionPositionSafe(x, z)) throw new Error('Companion spawn fails shared navigation constraints.');
  return { x, y: supportAt(x, z), z, yaw: Math.PI, speed: 0, time: 0, animation: 'idle',
    mode: 'waiting', followDistance: 0, formationSide: 1, path: [], pathTarget: null, nextPlanAt: 0,
    callUntil: 0, respondUntil: 0, lastCallCount: 0, callResponses: 0,
    plans: 0, blockedPlans: 0, distanceTravelled: 0, events: [],
    controller: 'authored-grid-pathfinding', trained: false };
}

/** No player mutation; follower cannot collect wisps, change quests or teleport.
 * Unsupported/unsafe player targets cause waiting, never water traversal.
 * The grid cannot prove precise skinned-foot contacts or every narrow passage.
 */
export function stepCompanion(state, player, dt = FIXED_DT) {
  dt = clamp(finite(dt, FIXED_DT), 0, 0.1); state.events = [];
  if (!dt) return state;
  state.time += dt;
  if (!companionPositionSafe(state.x, state.z)) { state.mode = 'blocked'; state.speed = 0; state.animation = 'idle'; return state; }
  if (!player || !Number.isFinite(player.x) || !Number.isFinite(player.z)) { state.mode = 'waiting'; state.speed = 0; state.animation = 'idle'; return state; }
  const count = Math.max(0, Math.floor(finite(player.callCount)));
  if (count > state.lastCallCount) {
    state.lastCallCount = count; state.callUntil = state.time + 5;
    state.respondUntil = state.time + 0.7; state.callResponses++;
    state.events.push({ type: 'companion-answer', count: state.callResponses }); state.nextPlanAt = 0;
  }
  const separation = distance(state, player);
  state.followDistance = separation;
  if (!companionPositionSafe(player.x, player.z)) {
    state.speed = 0; state.path = []; state.pathTarget = null;
    state.mode = 'waiting-on-bank';
    state.animation = state.time < state.respondUntil ? 'bark' : player.sitting ? 'sit' : 'idle';
    return state;
  }
  const yaw = finite(player.yaw, Math.PI), side = { x: Math.cos(yaw), z: -Math.sin(yaw) }, forward = { x: Math.sin(yaw), z: Math.cos(yaw) };
  const offsetTarget = sign => ({ x: player.x + side.x * COMPANION.sideOffset * sign - forward.x * COMPANION.backOffset,
    z: player.z + side.z * COMPANION.sideOffset * sign - forward.z * COMPANION.backOffset });
  let target = offsetTarget(state.formationSide);
  if (!companionPositionSafe(target.x, target.z)) {
    const opposite = offsetTarget(-state.formationSide);
    if (companionPositionSafe(opposite.x, opposite.z)) { state.formationSide *= -1; target = opposite; }
    else target = { x: player.x - forward.x * (COMPANION.sideOffset + 0.2), z: player.z - forward.z * (COMPANION.sideOffset + 0.2) };
  }
  const escaping = separation < COMPANION.stopDistance - 1e-6;
  if (escaping) {
    // A player may walk into Pip. Move continuously outward instead of snapping
    // the companion to a free point or pushing the player's game state.
    const angle = separation > 1e-6 ? Math.atan2(state.x - player.x, state.z - player.z) : yaw + Math.PI / 2;
    const escapeTargets = [0, 0.35, -0.35, 0.7, -0.7].map(offset => ({
      x: player.x + Math.sin(angle + offset) * (COMPANION.sideOffset + 0.2),
      z: player.z + Math.cos(angle + offset) * (COMPANION.sideOffset + 0.2) }));
    target = escapeTargets.find(p => companionPositionSafe(p.x, p.z) && segmentSafe(state, p)
      && (p.x - state.x) * (state.x - player.x) + (p.z - state.z) * (state.z - player.z) >= -1e-9);
    state.path = target ? [target] : [];
    state.pathTarget = null;
  }
  if (!target || !companionPositionSafe(target.x, target.z)) {
    state.speed = 0; state.path = []; state.mode = 'waiting-for-space'; state.animation = state.time < state.respondUntil ? 'bark' : 'idle'; return state;
  }
  const targetDistance = distance(state, target);
  if (targetDistance <= COMPANION.arrivalRadius + 0.04 && !escaping) {
    state.speed = 0; state.path = []; state.pathTarget = target; state.mode = 'beside-player';
    state.animation = state.time < state.respondUntil ? 'bark' : player.sitting || player.status === 'won' ? 'sit' : 'idle';
    return state;
  }
  if (!escaping && (!state.pathTarget || state.time >= state.nextPlanAt && distance(state.pathTarget, target) > 0.45 || !state.path.length && state.time >= state.nextPlanAt)) {
    state.path = planCompanionPath(state, target, player); state.pathTarget = target;
    state.nextPlanAt = state.time + COMPANION.replanInterval; state.plans++;
    if (!state.path.length) state.blockedPlans++;
  }
  const speed = separation > 7 || state.time < state.callUntil ? COMPANION.maxSpeed : COMPANION.walkSpeed;
  let remaining = Math.min(speed * dt, Math.max(0, targetDistance - COMPANION.arrivalRadius)), moved = 0;
  // A frame is itself subdivided, so neither catch-up nor a large dt tunnels.
  for (let guard = 0; remaining > 1e-8 && state.path.length && guard < 16; guard++) {
    const target = state.path[0], d = distance(state, target);
    if (d < 1e-6) { state.path.shift(); continue; }
    const amount = Math.min(remaining, d, 0.09), mx = (target.x - state.x) / d, mz = (target.z - state.z) / d;
    const next = { x: state.x + mx * amount, z: state.z + mz * amount };
    if (!segmentSafe(state, next) || !escaping && !playerClear(state, next, player)) { state.path = []; state.nextPlanAt = state.time; break; }
    state.x = next.x; state.z = next.z; state.y = supportAt(state.x, state.z);
    state.yaw = Math.atan2(mx, mz); moved += amount; remaining -= amount;
    if (d - amount < 1e-6) state.path.shift();
  }
  state.speed = moved / dt; state.distanceTravelled += moved; state.followDistance = distance(state, player);
  state.mode = moved > 1e-6 ? escaping ? 'giving-space' : 'following' : 'waiting-for-path';
  state.animation = state.speed > 4 ? 'run' : state.speed > 0.05 ? 'walk' : state.time < state.respondUntil ? 'bark' : 'idle';
  return state;
}

export function companionSnapshot(state) { return JSON.parse(JSON.stringify(state)); }

/** Optional one-time preload while a loading screen is visible. */
export function prepareCompanionNavigation() {
  const nodes = getGraph();
  return { nodes: nodes.size, maxNodes: COMPANION.maxPathNodes, gridStep: COMPANION.gridStep, trained: false };
}
