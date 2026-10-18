/**
 * Conservative camera clearance against the world's vertical circle proxies.
 * Metres, Y-up. Yaw zero looks toward +Z; positive yaw rotates toward +X.
 * Returns a distance ALONG the camera ray, never a horizontal distance.
 * This prevents trunk/rock intersections, not collisions with every leaf/branch.
 */
export function cameraClearance(target, yaw, pitch, distance, obstacles = []) {
  if (!target || ![target.x, target.y, target.z, yaw, pitch, distance].every(Number.isFinite)) {
    throw new TypeError('Camera target, angles and distance must be finite numbers.');
  }
  if (!Array.isArray(obstacles)) throw new TypeError('Camera obstacles must be an array.');
  const minimum = 0.8, desired = Math.max(minimum, distance);
  const angle = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch));
  const horizontalX = Math.sin(yaw), horizontalZ = Math.cos(yaw);
  const horizontalPerRayMetre = Math.cos(angle), verticalPerRayMetre = Math.sin(angle);
  let allowed = desired;
  for (const obstacle of obstacles) {
    if (!obstacle || ![obstacle.x, obstacle.z, obstacle.radius, obstacle.height].every(Number.isFinite)
        || obstacle.radius <= 0 || obstacle.height <= 0) continue;
    const baseY = Number.isFinite(obstacle.y) ? obstacle.y : 0;
    const radius = obstacle.radius + 0.7;
    const bottom = baseY - 0.15, top = baseY + obstacle.height + 0.4;
    const rx = obstacle.x - target.x, rz = obstacle.z - target.z;
    const projected = rx * horizontalX + rz * horizontalZ;
    const lateralSquared = Math.max(0, rx * rx + rz * rz - projected * projected);
    let horizontalNear, horizontalFar;
    if (horizontalPerRayMetre < 1e-9) {
      // A vertical ray does not approach a horizontally separated cylinder.
      if (rx * rx + rz * rz > radius * radius) continue;
      horizontalNear = -Infinity; horizontalFar = Infinity;
    } else {
      if (lateralSquared > radius * radius) continue;
      const halfChord = Math.sqrt(Math.max(0, radius * radius - lateralSquared));
      horizontalNear = (projected - halfChord) / horizontalPerRayMetre;
      horizontalFar = (projected + halfChord) / horizontalPerRayMetre;
    }
    let verticalNear, verticalFar;
    if (Math.abs(verticalPerRayMetre) < 1e-9) {
      if (target.y < bottom || target.y > top) continue;
      verticalNear = -Infinity; verticalFar = Infinity;
    } else {
      const a = (bottom - target.y) / verticalPerRayMetre;
      const b = (top - target.y) / verticalPerRayMetre;
      verticalNear = Math.min(a, b); verticalFar = Math.max(a, b);
    }
    const entry = Math.max(0, horizontalNear, verticalNear);
    const exit = Math.min(desired, horizontalFar, verticalFar);
    if (entry > exit || exit < 0) continue;
    allowed = Math.min(allowed, Math.max(minimum, entry - 0.05));
  }
  return allowed;
}
