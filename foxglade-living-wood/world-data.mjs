/**
 * Foxglade's shared synthetic world contract. Metres, Three.js Y-up, +Z forward.
 * terrainHeight is the ground plane, not the bridge deck or water surface.
 * All layout and obstacle geometry is deterministic and shared with rendering.
 */
const seed = 20261017;
const radius = 40;
const spawn = { x: 0, z: 22 };
const den = { ...spawn };
const pond = { x: 5, z: 4, radius: 7, waterY: -0.12 };
const bridge = { minX: -3, maxX: 13, x: 5, z: 4, width: 3.2, deckY: 0.35 };
const wisps = [
  [-3, 16], [-12, 10], [-18, 1], [-16, -12], [-8, -20],
  [0, -25], [12, -24], [20, -16], [21, -6],
].map(([x, z], i) => ({ id: `wisp-${i + 1}`, x, z }));
const shrines = [[-18, -5], [0, -28], [22, 0]].map(([x, z], i) => ({
  id: `shrine-${i + 1}`, x, z,
}));
const route = [spawn, ...wisps.slice(0, 3), shrines[0], ...wisps.slice(3, 6), shrines[1], ...wisps.slice(6), shrines[2], { x: 20, z: 12 }, { x: 10, z: 22 }, den];

export function terrainHeight(_x, _z) { return 0; }
export function isBridge(x, z) {
  return Number.isFinite(x) && Number.isFinite(z)
    && x >= bridge.minX && x <= bridge.maxX && Math.abs(z - bridge.z) <= bridge.width / 2;
}
export function isPond(x, z) {
  return Number.isFinite(x) && Number.isFinite(z)
    && (x - pond.x) ** 2 + (z - pond.z) ** 2 < pond.radius ** 2;
}

function randomGenerator(initial) {
  let value = initial >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let v = value;
    v = Math.imul(v ^ (v >>> 15), v | 1);
    v ^= v + Math.imul(v ^ (v >>> 7), v | 61);
    return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
  };
}
function segmentDistance(p, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(p.x - a.x - t * dx, p.z - a.z - t * dz);
}
const random = randomGenerator(seed);
const obstacles = [];
let rejectedPlacements = 0;
for (let attempt = 0; obstacles.length < 84 && attempt < 5000; attempt++) {
  const angle = random() * Math.PI * 2;
  const distance = Math.sqrt(random()) * (radius - 2);
  const type = random() < 0.74 ? 'tree' : 'rock';
  const r = type === 'tree' ? 0.42 + random() * 0.32 : 0.55 + random() * 0.55;
  const o = { id: `obstacle-${obstacles.length + 1}`, type, x: Math.sin(angle) * distance,
    z: Math.cos(angle) * distance, radius: r, height: type === 'tree' ? 4.5 + random() * 3 : 0.65 + random() * 0.8,
    scale: 0.8 + random() * 0.4, rotation: random() * Math.PI * 2 };
  const nearPoint = [den, ...wisps, ...shrines].some(p => Math.hypot(o.x - p.x, o.z - p.z) < 3.5 + r);
  const nearRoute = route.slice(1).some((b, i) => segmentDistance(o, route[i], b) < 2.4 + r);
  const nearWater = Math.hypot(o.x - pond.x, o.z - pond.z) < pond.radius + r + 0.8;
  const overlap = obstacles.some(p => Math.hypot(o.x - p.x, o.z - p.z) < r + p.radius + 1.2);
  if (nearPoint || nearRoute || nearWater || overlap) { rejectedPlacements++; continue; }
  obstacles.push(o);
}
function freezeDeep(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}
export const WORLD = freezeDeep({ seed, radius, spawn, den, pond, bridge, wisps, shrines, obstacles, route,
  generation: { requestedObstacles: 84, placedObstacles: obstacles.length, rejectedPlacements },
  contract: { units: 'metres', up: '+Y', forward: '+Z', terrain: 'synthetic-flat', motion: 'authored-kinematic' },
});
