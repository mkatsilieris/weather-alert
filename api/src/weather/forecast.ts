import type { LatLon } from '../lib/geo.js';
import { fetchJson } from './http.js';

/**
 * The point forecast for a person's home (always Open-Meteo, whatever the grid provider): what
 * falls there right now, the next 6 hours in 15-minute steps and the next 12 hours by the hour.
 * It is the second opinion next to the cell tracking: the model may expect rain to form over
 * home without any cell being on its way, and the dashboard shows it as a chart.
 */
export interface HomeForecast {
  fetchedAt: string;
  current: {
    time: string;
    /** mm/h */
    precipitation: number;
    temperature: number | null;
    weatherCode: number | null;
    windKmh: number | null;
    windFromDeg: number | null;
  };
  /** mm per 15 minutes */
  minutely15: { time: string; precipitation: number }[];
  /** mm per hour, probability in % */
  hourly: { time: string; precipitation: number; probability: number | null; weatherCode: number | null }[];
}

interface Response {
  current: {
    time: number;
    precipitation: number | null;
    temperature_2m: number | null;
    weather_code: number | null;
    wind_speed_10m: number | null;
    wind_direction_10m: number | null;
  };
  minutely_15?: { time: number[]; precipitation: (number | null)[] };
  hourly?: {
    time: number[];
    precipitation: (number | null)[];
    precipitation_probability: (number | null)[];
    weather_code: (number | null)[];
  };
}

const iso = (unix: number) => new Date(unix * 1000).toISOString();

export async function fetchHomeForecast(p: LatLon): Promise<HomeForecast> {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(p.lat));
  url.searchParams.set('longitude', String(p.lon));
  url.searchParams.set('current', 'precipitation,temperature_2m,weather_code,wind_speed_10m,wind_direction_10m');
  url.searchParams.set('minutely_15', 'precipitation');
  url.searchParams.set('forecast_minutely_15', '24');
  url.searchParams.set('hourly', 'precipitation,precipitation_probability,weather_code');
  url.searchParams.set('forecast_hours', '12');
  url.searchParams.set('wind_speed_unit', 'kmh');
  url.searchParams.set('timeformat', 'unixtime');
  url.searchParams.set('timezone', 'UTC');

  const d = await fetchJson<Response>(url.toString());
  return {
    fetchedAt: new Date().toISOString(),
    current: {
      time: iso(d.current.time),
      precipitation: Math.max(0, d.current.precipitation ?? 0),
      temperature: d.current.temperature_2m,
      weatherCode: d.current.weather_code,
      windKmh: d.current.wind_speed_10m,
      windFromDeg: d.current.wind_direction_10m,
    },
    minutely15: (d.minutely_15?.time ?? []).map((t, i) => ({
      time: iso(t),
      precipitation: Math.max(0, d.minutely_15?.precipitation[i] ?? 0),
    })),
    hourly: (d.hourly?.time ?? []).map((t, i) => ({
      time: iso(t),
      precipitation: Math.max(0, d.hourly?.precipitation[i] ?? 0),
      probability: d.hourly?.precipitation_probability[i] ?? null,
      weatherCode: d.hourly?.weather_code[i] ?? null,
    })),
  };
}

/** mm in a 15-minute slot that counts as rain (0.1 mm / 15 min = 0.4 mm/h) */
const MIN_15 = 0.1;
/** mm in an hour that counts as rain, and the least probability to trust it */
const MIN_HOUR = 0.3;
const MIN_PROB = 40;

/** Minutes until the model expects rain at the point (0 = in the current slot), null when it does not. */
export function forecastEtaMin(f: HomeForecast, now = Date.now()): number | null {
  for (const slot of f.minutely15) {
    const t = Date.parse(slot.time);
    if (t + 15 * 60_000 <= now) continue; // slot is over
    if (slot.precipitation >= MIN_15) return Math.max(0, Math.round((t - now) / 60_000));
  }
  for (const h of f.hourly) {
    const t = Date.parse(h.time);
    if (t + 60 * 60_000 <= now) continue;
    if (h.precipitation >= MIN_HOUR && (h.probability === null || h.probability >= MIN_PROB)) {
      return Math.max(0, Math.round((t - now) / 60_000));
    }
  }
  return null;
}
