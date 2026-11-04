import type { LatLon } from './types';

/** The same flat projection the API uses: x km east, y km north of `origin`. */
const KM_PER_DEG_LAT = 110.574;
const kmPerDegLon = (lat: number) => 111.32 * Math.cos((lat * Math.PI) / 180);

export function toLocalKm(origin: LatLon, p: LatLon): { x: number; y: number } {
  return { x: (p.lon - origin.lon) * kmPerDegLon(origin.lat), y: (p.lat - origin.lat) * KM_PER_DEG_LAT };
}

export function haversineKm(a: LatLon, b: LatLon): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

const COMPASS = ['Β', 'ΒΑ', 'Α', 'ΝΑ', 'Ν', 'ΝΔ', 'Δ', 'ΒΔ'];

export function compassName(deg: number): string {
  const d = ((deg % 360) + 360) % 360;
  return COMPASS[Math.round(d / 45) % 8];
}
