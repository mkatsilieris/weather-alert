import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bearingDeg, compassName, fromLocalKm, gridPoints, haversineKm, toLocalKm } from './geo.js';

const athens = { lat: 37.9838, lon: 23.7275 };
const thessaloniki = { lat: 40.6401, lon: 22.9444 };

test('haversine: Athens - Thessaloniki is about 300 km', () => {
  const d = haversineKm(athens, thessaloniki);
  assert.ok(d > 295 && d < 305, `got ${d}`);
});

test('bearing: north is 0, east is 90', () => {
  assert.ok(Math.abs(bearingDeg(athens, { lat: 38.5, lon: 23.7275 })) < 0.5);
  const east = bearingDeg(athens, { lat: 37.9838, lon: 24.5 });
  assert.ok(Math.abs(east - 90) < 1, `got ${east}`);
});

test('local projection round-trips and agrees with haversine', () => {
  const p = { lat: 38.3, lon: 23.2 };
  const xy = toLocalKm(athens, p);
  const back = fromLocalKm(athens, xy);
  assert.ok(Math.abs(back.lat - p.lat) < 1e-9 && Math.abs(back.lon - p.lon) < 1e-9);
  const flat = Math.hypot(xy.x, xy.y);
  const great = haversineKm(athens, p);
  assert.ok(Math.abs(flat - great) / great < 0.01, `${flat} vs ${great}`);
});

test('compass names', () => {
  assert.equal(compassName(0), 'Β');
  assert.equal(compassName(44), 'ΒΑ');
  assert.equal(compassName(225), 'ΝΔ');
  assert.equal(compassName(359), 'Β');
  assert.equal(compassName(-90), 'Δ');
});

test('grid: points fill the circle, include the centre and stay inside the radius', () => {
  const pts = gridPoints(athens, 100, 15);
  // area of the circle / area per point, give or take the edge
  assert.ok(pts.length > 120 && pts.length < 160, `got ${pts.length}`);
  assert.ok(pts.some((p) => Math.abs(p.lat - athens.lat) < 1e-3 && Math.abs(p.lon - athens.lon) < 1e-3));
  for (const p of pts) assert.ok(haversineKm(athens, p) <= 101, `${p.lat},${p.lon} is outside`);
});
