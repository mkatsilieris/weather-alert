import { bearingDeg, compassName, toLocalKm, type LatLon } from './geo.js';

/** One grid point of a scan: how hard it rains there and which way the rain is being carried. */
export interface RainCell extends LatLon {
  /** precipitation, mm/h */
  rate: number;
  /** estimated speed of the rain cell, km/h */
  steeringKmh: number;
  /** direction the steering wind blows FROM (meteorological convention) */
  steeringFromDeg: number;
  /** side of the grid square the point stands for, km (missing: 2 x ApproachOptions.cellRadiusKm) */
  sizeKm?: number;
}

export interface ApproachOptions {
  /** rain counts as "arriving" when a cell gets this close to home (km) ... */
  alertRadiusKm: number;
  /** ... within this many minutes */
  horizonMin: number;
  /** mm/h from which a grid point counts as raining */
  minRate: number;
  /** half the grid spacing, for cells that do not carry their own sizeKm (km) */
  cellRadiusKm: number;
}

export interface Threat {
  lat: number;
  lon: number;
  rate: number;
  /** distance of the cell from home, km */
  distanceKm: number;
  /** where the cell is, seen from home (0 = north) */
  bearingDeg: number;
  bearingName: string;
  /** where the cell is heading (0 = north) */
  headingDeg: number;
  speedKmh: number;
  /** the closest the cell will get to home if it keeps going, km */
  closestKm: number;
  /** minutes until the cell is within the alert radius; null when it never gets there */
  etaMin: number | null;
  /** etaMin within the horizon */
  approaching: boolean;
  /** side of the grid square, km */
  sizeKm: number;
}

export type RainStatus = 'raining' | 'approaching' | 'forecast' | 'nearby' | 'clear';

/** What the forecast says about the home point itself (from the point forecast, not the grid). */
export interface HomeNow {
  /** precipitation at home right now, mm/h */
  rateNow: number;
  /** minutes until the model expects rain at home, null when none is expected */
  forecastEtaMin: number | null;
}

export interface Evaluation {
  status: RainStatus;
  /** minutes until the first approaching cell arrives (0 = it is already inside the alert radius) */
  etaMin: number | null;
  /** distance and direction of the most relevant cell */
  distanceKm: number | null;
  fromDeg: number | null;
  fromName: string | null;
  rateNow: number;
  forecastEtaMin: number | null;
  rainCells: number;
  maxRate: number;
  /** every raining cell, approaching ones first (soonest first), then the rest by distance */
  threats: Threat[];
}

/**
 * Where does this rain cell go? The cell is at P (relative to home) and moves with velocity V,
 * so its position is P + V t. It is "within the alert radius" when |P + V t| <= r, which is the
 * quadratic a t^2 + b t + c <= 0 with a = V.V, b = 2 P.V, c = P.P - r^2.
 */
export function analyseCell(cell: RainCell, home: LatLon, opts: ApproachOptions): Threat {
  const p = toLocalKm(home, cell);
  const headingDeg = (cell.steeringFromDeg + 180) % 360;
  const heading = (headingDeg * Math.PI) / 180;
  const v = { x: cell.steeringKmh * Math.sin(heading), y: cell.steeringKmh * Math.cos(heading) };
  const half = halfSize(cell, opts);
  const r = opts.alertRadiusKm + half;

  const distanceKm = Math.hypot(p.x, p.y);
  const a = v.x * v.x + v.y * v.y;
  const pv = p.x * v.x + p.y * v.y;
  const b = 2 * pv;
  const c = p.x * p.x + p.y * p.y - r * r;

  let etaMin: number | null = null;
  let closestKm = distanceKm;
  if (c <= 0) {
    etaMin = 0; // already inside the alert radius
  } else if (a > 1e-6) {
    const tStar = -pv / a; // time of closest approach (hours)
    if (tStar > 0) closestKm = Math.hypot(p.x + v.x * tStar, p.y + v.y * tStar);
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const tEnter = (-b - Math.sqrt(disc)) / (2 * a);
      if (tEnter >= 0) etaMin = tEnter * 60;
    }
  }

  const bearing = bearingDeg(home, cell);
  return {
    lat: cell.lat,
    lon: cell.lon,
    rate: cell.rate,
    distanceKm,
    bearingDeg: bearing,
    bearingName: compassName(bearing),
    headingDeg,
    speedKmh: cell.steeringKmh,
    closestKm,
    etaMin,
    approaching: etaMin !== null && etaMin <= opts.horizonMin,
    sizeKm: half * 2,
  };
}

const halfSize = (cell: RainCell, opts: ApproachOptions) => (cell.sizeKm !== undefined ? cell.sizeKm / 2 : opts.cellRadiusKm);

/** Is home inside the grid square of this cell? */
function covers(cell: RainCell, home: LatLon, opts: ApproachOptions): boolean {
  const p = toLocalKm(home, cell);
  const half = halfSize(cell, opts);
  return Math.abs(p.x) <= half && Math.abs(p.y) <= half;
}

/** Combines the raining grid cells and the home point forecast into one status for a person. */
export function evaluate(
  cells: RainCell[],
  home: LatLon,
  opts: ApproachOptions,
  homeNow: HomeNow | null = null,
): Evaluation {
  const raining = cells.filter((c) => c.rate >= opts.minRate);
  const threats = raining
    .map((c) => analyseCell(c, home, opts))
    .sort((x, y) => {
      if (x.approaching !== y.approaching) return x.approaching ? -1 : 1;
      if (x.approaching) return (x.etaMin ?? 0) - (y.etaMin ?? 0) || x.distanceKm - y.distanceKm;
      return x.distanceKm - y.distanceKm;
    });
  const approaching = threats.filter((t) => t.approaching);

  // Rain at home: what the point forecast says now, or the grid cell that covers home.
  const onTop = raining.filter((c) => covers(c, home, opts)).reduce<RainCell | null>((m, c) => (!m || c.rate > m.rate ? c : m), null);
  const rateNow = Math.max(homeNow?.rateNow ?? 0, onTop?.rate ?? 0);
  const forecastEtaMin = homeNow?.forecastEtaMin ?? null;

  let status: RainStatus;
  if (rateNow >= opts.minRate) status = 'raining';
  else if (approaching.length > 0) status = 'approaching';
  else if (forecastEtaMin !== null && forecastEtaMin <= opts.horizonMin) status = 'forecast';
  else if (raining.length > 0) status = 'nearby';
  else status = 'clear';

  const first = approaching[0] ?? threats[0] ?? null;
  const etaMin =
    status === 'raining' ? 0 : status === 'approaching' ? (first?.etaMin ?? null) : status === 'forecast' ? forecastEtaMin : null;
  return {
    status,
    etaMin,
    distanceKm: first?.distanceKm ?? null,
    fromDeg: first?.bearingDeg ?? null,
    fromName: first?.bearingName ?? null,
    rateNow,
    forecastEtaMin,
    rainCells: raining.length,
    maxRate: raining.reduce((m, c) => Math.max(m, c.rate), 0),
    threats,
  };
}
