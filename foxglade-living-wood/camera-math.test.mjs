import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraClearance } from './camera-math.mjs';
const target = { x: 0, y: 0.78, z: 0 };
const trunk = { x: 0, z: 6, radius: 0.42, height: 6 };
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} differs from ${b}`);

test('directly ahead trunk uses horizontal unit projection and ray-distance conversion', () => {
  const pitch = 0.48;
  const actual = cameraClearance(target, 0, pitch, 8.8, [trunk]);
  const expected = (6 - 0.42 - 0.7) / Math.cos(pitch) - 0.05;
  near(actual, expected); assert.ok(actual < 8.8);
});
test('side obstacle does not shorten a clear camera ray', () => {
  near(cameraClearance(target, 0, 0.48, 8.8, [{ ...trunk, x: 2 }]), 8.8);
});
test('high-pitch ray clears above a shorter trunk', () => {
  near(cameraClearance(target, 0, 0.95, 12, [{ ...trunk, height: 3 }]), 12);
});
test('negative yaw aims correctly toward negative X, not positive X', () => {
  const left = { ...trunk, x: -6, z: 0 }, right = { ...trunk, x: 6, z: 0 };
  const expected = (6 - trunk.radius - 0.7) / Math.cos(0.48) - 0.05;
  near(cameraClearance(target, -Math.PI / 2, 0.48, 8.8, [left]), expected);
  near(cameraClearance(target, -Math.PI / 2, 0.48, 8.8, [right]), 8.8);
});
test('nearest valid collision wins independently of obstacle order', () => {
  const close = { ...trunk, z: 3 };
  const a = cameraClearance(target, 0, 0.1, 8.8, [trunk, close]);
  const b = cameraClearance(target, 0, 0.1, 8.8, [close, trunk]);
  near(a, b); near(a, (3 - trunk.radius - 0.7) / Math.cos(0.1) - 0.05);
});
test('behind-camera and beyond-end obstacles leave desired distance unchanged', () => {
  near(cameraClearance(target, 0, 0.1, 8.8, [{ ...trunk, z: -3 }, { ...trunk, z: 20 }]), 8.8);
});
test('close or enclosing obstacle respects 0.8m minimum', () => {
  near(cameraClearance(target, 0, 0.1, 8.8, [{ ...trunk, z: 0.5 }]), 0.8);
  near(cameraClearance(target, 0, 0.1, 0.1, []), 0.8);
});
test('vertical ray only intersects cylinders enclosing its horizontal origin', () => {
  near(cameraClearance(target, 0, Math.PI / 2, 8.8, [trunk]), 8.8);
  near(cameraClearance(target, 0, Math.PI / 2, 8.8, [{ ...trunk, z: 0 }]), 0.8);
});
test('vertical interval uses obstacle base and supports rays below the camera', () => {
  near(cameraClearance({ x: 0, y: 10, z: 0 }, 0, 0, 8.8, [trunk]), 8.8);
  const hit = cameraClearance({ x: 0, y: 10, z: 0 }, 0, -0.6, 12, [trunk]);
  assert.ok(hit < 12 && hit >= 0.8);
  near(cameraClearance(target, 0, 0, 8.8, [{ ...trunk, y: 2 }]), 8.8);
});
test('malformed camera values fail explicitly and invalid proxies are ignored', () => {
  assert.throws(() => cameraClearance(target, NaN, 0.1, 8.8, []), TypeError);
  assert.throws(() => cameraClearance(target, 0, 0.1, Infinity, []), TypeError);
  near(cameraClearance(target, 0, 0.1, 8.8, [null, { ...trunk, radius: NaN }]), 8.8);
});
