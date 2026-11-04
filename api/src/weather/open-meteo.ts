import { config } from '../config.js';
import type { LatLon } from '../lib/geo.js';
import type { RainCell } from '../lib/approach.js';
import type { ObservationProvider } from './provider.js';
import { chunk, fetchJson } from './http.js';

/**
 * Open-Meteo (https://open-meteo.com): free, no key, one request for many points. Every grid
 * point gets the latest model analysis (the "current" block, updated every 15 min for Europe)
 * and the 850 hPa wind of the current hour, which is what carries rain cells around.
 *
 * These are model values on a ~2 km grid, not literal station readings: the stations are
 * assimilated into the model, and the model fills the gaps between them.
 */

interface Current {
  time: number;
  precipitation: number | null;
  wind_speed_10m: number | null;
  wind_direction_10m: number | null;
}

interface Hourly {
  time: number[];
  wind_speed_850hPa?: (number | null)[];
  wind_direction_850hPa?: (number | null)[];
}

interface Point {
  latitude: number;
  longitude: number;
  current: Current;
  hourly?: Hourly;
}

const BATCH = 50;

async function observeBatch(points: LatLon[]): Promise<RainCell[]> {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', points.map((p) => p.lat).join(','));
  url.searchParams.set('longitude', points.map((p) => p.lon).join(','));
  url.searchParams.set('current', 'precipitation,wind_speed_10m,wind_direction_10m');
  url.searchParams.set('hourly', 'wind_speed_850hPa,wind_direction_850hPa');
  url.searchParams.set('forecast_hours', '1');
  url.searchParams.set('wind_speed_unit', 'kmh');
  url.searchParams.set('timeformat', 'unixtime');
  url.searchParams.set('timezone', 'UTC');

  const data = await fetchJson<Point | Point[]>(url.toString());
  const list = Array.isArray(data) ? data : [data];
  if (list.length !== points.length) {
    throw new Error(`open-meteo returned ${list.length} points for ${points.length} requested`);
  }
  return list.map((d, i) => {
    const w850 = d.hourly?.wind_speed_850hPa?.[0] ?? null;
    const d850 = d.hourly?.wind_direction_850hPa?.[0] ?? null;
    const steering =
      w850 !== null && d850 !== null
        ? { kmh: w850 * config.scan.steeringFactor850, from: d850 }
        : {
            kmh: (d.current.wind_speed_10m ?? 0) * config.scan.steeringFactor10m,
            from: d.current.wind_direction_10m ?? 0,
          };
    return {
      lat: points[i].lat,
      lon: points[i].lon,
      rate: Math.max(0, d.current.precipitation ?? 0),
      steeringKmh: Math.round(steering.kmh * 10) / 10,
      steeringFromDeg: Math.round(steering.from),
    };
  });
}

export const openMeteoProvider: ObservationProvider = {
  name: 'open-meteo',
  async observe(points) {
    const batches = await Promise.all(chunk(points, BATCH).map(observeBatch));
    return batches.flat();
  },
};
