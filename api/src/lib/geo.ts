/** Small geodesy helpers. Distances in km, angles in degrees (0 = north, clockwise). */

export interface LatLon {
  lat: number;
  lon: number;
}

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

export function haversineKm(a: LatLon, b: LatLon): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** Initial bearing from `from` to `to`, 0..360. */
export function bearingDeg(from: LatLon, to: LatLon): number {
  const f1 = toRad(from.lat);
  const f2 = toRad(to.lat);
  const dl = toRad(to.lon - from.lon);
  const y = Math.sin(dl) * Math.cos(f2);
  const x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

const KM_PER_DEG_LAT = 110.574;
const kmPerDegLon = (lat: number) => 111.32 * Math.cos(toRad(lat));

/**
 * Flat local projection around `origin`: x km east, y km north. Accurate enough for the
 * ~100 km we work with (the error is well under 1%).
 */
export function toLocalKm(origin: LatLon, p: LatLon): { x: number; y: number } {
  return {
    x: (p.lon - origin.lon) * kmPerDegLon(origin.lat),
    y: (p.lat - origin.lat) * KM_PER_DEG_LAT,
  };
}

export function fromLocalKm(origin: LatLon, p: { x: number; y: number }): LatLon {
  return {
    lat: origin.lat + p.y / KM_PER_DEG_LAT,
    lon: origin.lon + p.x / kmPerDegLon(origin.lat),
  };
}

export const COMPASS = ['Β', 'ΒΑ', 'Α', 'ΝΑ', 'Ν', 'ΝΔ', 'Δ', 'ΒΔ'] as const;

/** 0 -> 'Β' (north), 225 -> 'ΝΔ' (south-west), ... */
export function compassName(deg: number): string {
  const d = ((deg % 360) + 360) % 360;
  return COMPASS[Math.round(d / 45) % 8];
}

const round4 = (n: number) => Math.round(n * 1e4) / 1e4;

/** A sample point of the scan and the square around it that it stands for. */
export interface GridPoint extends LatLon {
  /** side of the square, km */
  sizeKm: number;
}

/** The parts of the grid that are sampled more densely: around the places people watch. */
export interface DenseCore {
  /** the places (the homes of the users) */
  around: LatLon[];
  /** squares whose centre is this close to one of the places are split ... */
  radiusKm: number;
  /** ... into split x split smaller squares (1 = not split) */
  split: number;
}

/**
 * Sample points of the scan: a square grid with `spacingKm` between points, clipped to the circle
 * of `radiusKm` around `center`. Near the places in `dense` every square is split into smaller
 * ones, so a home is not lost in a single 15 km square. Two places close together share their
 * squares, so nothing is sampled twice.
 */
export function gridPoints(
  center: LatLon,
  radiusKm: number,
  spacingKm: number,
  dense: DenseCore = { around: [], radiusKm: 0, split: 1 },
): GridPoint[] {
  if (spacingKm <= 0 || radiusKm <= 0) throw new Error('radius and spacing must be positive');
  const n = Math.ceil(radiusKm / spacingKm);
  const points: GridPoint[] = [];
  const add = (x: number, y: number, sizeKm: number) => {
    const p = fromLocalKm(center, { x, y });
    points.push({ lat: round4(p.lat), lon: round4(p.lon), sizeKm: round4(sizeKm) });
  };
  const split = Math.max(1, Math.round(dense.split));
  const places = split > 1 && dense.radiusKm > 0 ? dense.around.map((p) => toLocalKm(center, p)) : [];
  const isDense = (x: number, y: number) => places.some((p) => Math.hypot(x - p.x, y - p.y) <= dense.radiusKm + 1e-9);
  for (let j = n; j >= -n; j--) {
    for (let i = -n; i <= n; i++) {
      const x = i * spacingKm;
      const y = j * spacingKm;
      const r = Math.hypot(x, y);
      if (r > radiusKm + 1e-9) continue;
      if (isDense(x, y)) {
        const s = spacingKm / split;
        const mid = (split - 1) / 2;
        for (let b = split - 1; b >= 0; b--) for (let a = 0; a < split; a++) add(x + (a - mid) * s, y + (b - mid) * s, s);
      } else {
        add(x, y, spacingKm);
      }
    }
  }
  return points;
}
