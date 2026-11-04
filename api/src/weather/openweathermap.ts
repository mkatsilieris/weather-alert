import { config } from '../config.js';
import type { LatLon } from '../lib/geo.js';
import type { RainCell } from '../lib/approach.js';
import type { ObservationProvider } from './provider.js';
import { fetchJson, mapLimit } from './http.js';

/**
 * OpenWeatherMap "current weather" (https://openweathermap.org/current), one call per grid point.
 * Their current conditions blend weather stations with model data. Needs OWM_API_KEY; the free
 * plan allows 60 calls a minute and a million a month, so a 140-point grid every hour fits.
 *
 * Only the surface wind is available here, so the cell motion is the 10 m wind scaled up
 * (STEERING_FACTOR_10M); it is a rougher estimate than the 850 hPa wind Open-Meteo gives.
 */

interface OwmCurrent {
  wind?: { speed?: number; deg?: number };
  rain?: { '1h'?: number; '3h'?: number };
  snow?: { '1h'?: number; '3h'?: number };
}

const perHour = (v?: { '1h'?: number; '3h'?: number }): number => v?.['1h'] ?? (v?.['3h'] !== undefined ? v['3h'] / 3 : 0);

async function observePoint(p: LatLon): Promise<RainCell> {
  const url = new URL('https://api.openweathermap.org/data/2.5/weather');
  url.searchParams.set('lat', String(p.lat));
  url.searchParams.set('lon', String(p.lon));
  url.searchParams.set('units', 'metric');
  url.searchParams.set('appid', config.scan.owmApiKey);
  const d = await fetchJson<OwmCurrent>(url.toString());
  const kmh = (d.wind?.speed ?? 0) * 3.6 * config.scan.steeringFactor10m;
  return {
    lat: p.lat,
    lon: p.lon,
    rate: Math.max(0, perHour(d.rain) + perHour(d.snow)),
    steeringKmh: Math.round(kmh * 10) / 10,
    steeringFromDeg: Math.round(d.wind?.deg ?? 0),
  };
}

export const openWeatherMapProvider: ObservationProvider = {
  name: 'openweathermap',
  observe: (points) => mapLimit(points, 8, observePoint),
};
