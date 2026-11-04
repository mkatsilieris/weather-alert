import { config } from '../config.js';
import { toLocalKm, type LatLon } from '../lib/geo.js';
import type { RainCell } from '../lib/approach.js';
import type { ObservationProvider } from './provider.js';

/**
 * Mock provider for demos and tests (WEATHER_PROVIDER=mock): a band of rain that starts
 * MOCK_START_KM from the scan centre, on the MOCK_FROM_DEG side, and travels across the area at
 * MOCK_SPEED_KMH. Time runs MOCK_TIME_FACTOR times faster than the clock, so with
 * SCAN_INTERVAL_MIN=1 and factor 20 the whole passage takes a few real minutes; then it repeats.
 * Nothing is random: the band's position follows only the time since the API started.
 */
const started = Date.now();

export function mockCells(points: LatLon[], now = Date.now()): RainCell[] {
  const { center, mock } = config.scan;
  const elapsedH = ((now - started) / 3_600_000) * mock.timeFactor;
  const cycleKm = mock.startKm + 80; // start upstream, leave 80 km downstream, start again
  const travel = (mock.speedKmh * elapsedH) % cycleKm;
  const bandAt = mock.startKm - travel; // km upstream of the centre (negative = past it)

  const theta = (mock.fromDeg * Math.PI) / 180;
  const ux = Math.sin(theta); // unit vector pointing from the centre towards where the rain comes from
  const uy = Math.cos(theta);
  const halfWidth = mock.widthKm / 2;
  const halfLength = 70; // the band is 140 km long across the direction of motion

  return points.map((p) => {
    const q = toLocalKm(center, p);
    const along = q.x * ux + q.y * uy;
    const across = Math.abs(q.x * -uy + q.y * ux);
    const dAlong = Math.abs(along - bandAt);
    let rate = 0;
    if (dAlong <= halfWidth && across <= halfLength) {
      // heaviest in the middle of the band, fading to the edges
      rate = mock.peakRate * (1 - dAlong / halfWidth) * (1 - 0.6 * (across / halfLength));
    }
    return {
      lat: p.lat,
      lon: p.lon,
      rate: Math.round(rate * 100) / 100,
      steeringKmh: mock.speedKmh,
      steeringFromDeg: mock.fromDeg,
    };
  });
}

export const mockProvider: ObservationProvider = {
  name: 'mock',
  observe: async (points) => mockCells(points),
};
