import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyseCell, evaluate, type RainCell } from './approach.js';
import { fromLocalKm } from './geo.js';

const home = { lat: 37.958, lon: 23.729 };
const opts = { alertRadiusKm: 10, horizonMin: 120, minRate: 0.2, cellRadiusKm: 0 };

/** A raining cell `x` km east / `y` km north of home, carried by a wind blowing FROM `from`. */
const cell = (x: number, y: number, from: number, speed = 40, rate = 1): RainCell => ({
  ...fromLocalKm(home, { x, y }),
  rate,
  steeringKmh: speed,
  steeringFromDeg: from,
});

test('a cell 40 km west with a west wind arrives in (40-10)/40 h = 45 min', () => {
  const t = analyseCell(cell(-40, 0, 270), home, opts);
  assert.ok(Math.abs(t.distanceKm - 40) < 0.5);
  assert.equal(t.bearingName, 'Δ');
  assert.ok(Math.abs(t.headingDeg - 90) < 0.01);
  assert.ok(t.etaMin !== null && Math.abs(t.etaMin - 45) < 1, `eta ${t.etaMin}`);
  assert.ok(t.closestKm < 0.5);
  assert.equal(t.approaching, true);
});

test('a cell 40 km east with a west wind moves away', () => {
  const t = analyseCell(cell(40, 0, 270), home, opts);
  assert.equal(t.etaMin, null);
  assert.equal(t.approaching, false);
  assert.ok(Math.abs(t.closestKm - 40) < 0.5);
});

test('a cell passing 20 km to the side never enters a 10 km radius', () => {
  const t = analyseCell(cell(-40, 20, 270), home, opts);
  assert.equal(t.etaMin, null);
  assert.ok(Math.abs(t.closestKm - 20) < 0.5);
});

test('calm air: the cell stays where it is', () => {
  const t = analyseCell(cell(-30, 0, 270, 0), home, opts);
  assert.equal(t.etaMin, null);
});

test('a cell inside the alert radius has eta 0', () => {
  const t = analyseCell(cell(5, 5, 90), home, opts);
  assert.equal(t.etaMin, 0);
});

test('beyond the horizon it is not "approaching"', () => {
  const t = analyseCell(cell(-90, 0, 270, 30), home, opts); // (90-10)/30 h = 160 min
  assert.ok(t.etaMin !== null && t.etaMin > 120);
  assert.equal(t.approaching, false);
});

test('evaluate: status ladder', () => {
  assert.equal(evaluate([], home, opts).status, 'clear');
  assert.equal(evaluate([cell(40, 0, 270)], home, opts).status, 'nearby');
  const appr = evaluate([cell(40, 0, 270), cell(-40, 0, 270)], home, opts);
  assert.equal(appr.status, 'approaching');
  assert.equal(appr.fromName, 'Δ');
  assert.ok(appr.etaMin !== null && Math.abs(appr.etaMin - 45) < 1);
  assert.equal(appr.threats[0].approaching, true);
  assert.equal(appr.rainCells, 2);
  assert.equal(evaluate([cell(40, 0, 270)], home, opts, { rateNow: 0, forecastEtaMin: 30 }).status, 'forecast');
  assert.equal(evaluate([cell(40, 0, 270)], home, opts, { rateNow: 0, forecastEtaMin: 300 }).status, 'nearby');
  const rain = evaluate([cell(-40, 0, 270)], home, opts, { rateNow: 1.5, forecastEtaMin: 0 });
  assert.equal(rain.status, 'raining');
  assert.equal(rain.etaMin, 0);
});

test('evaluate: a raining grid cell on top of home counts as raining at home', () => {
  const withCells = { ...opts, cellRadiusKm: 7.5 };
  assert.equal(evaluate([cell(3, 2, 270)], home, withCells).status, 'raining');
  assert.equal(evaluate([cell(0, 0, 270, 40, 0.1)], home, withCells).status, 'clear'); // drizzle below minRate
});

test('a cell with its own size: the square, not a fixed radius, decides what it covers', () => {
  const small = (x: number, y: number, sizeKm: number): RainCell => ({ ...cell(x, y, 270), sizeKm });
  // 3 km east and 2 km north of home: inside a 15 km square, outside a 5 km one
  assert.equal(evaluate([small(3, 2, 15)], home, opts).status, 'raining');
  assert.notEqual(evaluate([small(3, 2, 5)], home, opts).status, 'raining');
  // a corner of the square covers home even though the centre is further than half its side
  assert.equal(evaluate([small(2.2, 2.2, 5)], home, opts).status, 'raining');
  // the cell size widens the target circle: 10 km alert radius + 2.5 km half-square
  const t = analyseCell(small(-40, 0, 5), home, opts);
  assert.equal(t.sizeKm, 5);
  assert.ok(t.etaMin !== null && Math.abs(t.etaMin - ((40 - 12.5) / 40) * 60) < 1, `got ${t.etaMin}`);
});
