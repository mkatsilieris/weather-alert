import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';
import { requireAuth } from '../auth.js';
import { badRequest } from '../errors.js';
import { config, gridConfig } from '../config.js';
import { haversineKm } from '../lib/geo.js';
import { mailConfigured } from '../mail.js';
import { fetchJson } from '../weather/http.js';
import { loadSettings, type Settings } from '../settings.js';
import { evaluateUser, latestScan, scanSoon } from '../scanner.js';

/** The place a person watches and how they want to be told. */
export const settingsRouter = Router();
settingsRouter.use(requireAuth);

const hour = z.number().int().min(0).max(23).nullable();

const settingsBody = z
  .object({
    home_name: z.string().trim().min(1, 'Δώστε όνομα στην τοποθεσία').max(100),
    home_lat: z.number().min(-90).max(90),
    home_lon: z.number().min(-180).max(180),
    alert_radius_km: z.number().min(1).max(50),
    horizon_min: z.number().int().min(15).max(360),
    notify_push: z.boolean(),
    notify_email: z.boolean(),
    notify_forecast: z.boolean(),
    notify_clear: z.boolean(),
    quiet_from: hour,
    quiet_to: hour,
  })
  .partial();

settingsRouter.get('/', async (req, res) => {
  const settings = await loadSettings(req.user.id);
  res.json(envelope(settings));
});

settingsRouter.put('/', async (req, res) => {
  const body = settingsBody.parse(req.body);
  const current = await loadSettings(req.user.id);
  const next: Settings = { ...current, ...stripUndefined(body) };

  const { center, radiusKm } = config.scan;
  const away = haversineKm(center, { lat: next.home_lat, lon: next.home_lon });
  if (away > radiusKm) {
    throw badRequest(`Η τοποθεσία είναι ${Math.round(away)} km από το κέντρο της σάρωσης· η περιοχή που παρακολουθείται φτάνει τα ${radiusKm} km`);
  }
  if ((next.quiet_from === null) !== (next.quiet_to === null)) {
    throw badRequest('Οι ώρες ησυχίας θέλουν και αρχή και τέλος');
  }

  const { rows } = await pool.query<Settings>(
    `UPDATE user_settings SET home_name = $2, home_lat = $3, home_lon = $4, alert_radius_km = $5, horizon_min = $6,
       notify_push = $7, notify_email = $8, notify_forecast = $9, notify_clear = $10, quiet_from = $11, quiet_to = $12, updated_at = now()
     WHERE user_id = $1 RETURNING *`,
    [
      req.user.id,
      next.home_name,
      next.home_lat,
      next.home_lon,
      next.alert_radius_km,
      next.horizon_min,
      next.notify_push,
      next.notify_email,
      next.notify_forecast,
      next.notify_clear,
      next.quiet_from,
      next.quiet_to,
    ],
  );
  req.log.info({ user: req.user.id, home: next.home_name, radius: next.alert_radius_km, horizon: next.horizon_min }, 'settings saved');

  // The new place is judged against the latest scan right away (a failure here is not the person's problem).
  try {
    await evaluateUser(req.user.id, await latestScan(), { notify: true });
  } catch (err) {
    req.log.warn({ err, user: req.user.id }, 'could not re-evaluate after settings change');
  }
  // The grid is dense around the homes, so a home that moved gets a fresh scan (in the background).
  const moved = haversineKm({ lat: current.home_lat, lon: current.home_lon }, { lat: next.home_lat, lon: next.home_lon });
  if (moved > 5) {
    scanSoon('manual')
      .then((started) => req.log.info({ user: req.user.id, movedKm: Math.round(moved), started }, 'home moved, rescan'))
      .catch((err) => req.log.warn({ err }, 'rescan after home change failed'));
  }
  res.json(envelope(rows[0]));
});

interface GeoResult {
  name: string;
  admin1?: string;
  admin2?: string;
  country?: string;
  latitude: number;
  longitude: number;
}

/** Place search for the settings page (Open-Meteo geocoding, proxied so the browser stays same-origin). */
settingsRouter.get('/geocode', async (req, res) => {
  const q = z.string().trim().min(2).max(100).parse(req.query.q);
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.searchParams.set('name', q);
  url.searchParams.set('count', '8');
  url.searchParams.set('language', 'el');
  url.searchParams.set('format', 'json');
  const data = await fetchJson<{ results?: GeoResult[] }>(url.toString(), 10_000);
  const { center, radiusKm } = config.scan;
  const results = (data.results ?? []).map((r) => {
    const distance = haversineKm(center, { lat: r.latitude, lon: r.longitude });
    return {
      name: r.name,
      region: [r.admin2, r.admin1, r.country].filter(Boolean).join(', '),
      lat: r.latitude,
      lon: r.longitude,
      distance_km: Math.round(distance),
      inside: distance <= radiusKm,
    };
  });
  res.json({ results });
});

function envelope(settings: Settings) {
  const { center, radiusKm, spacingKm, intervalMin, provider } = config.scan;
  const { denseKm, fineKm } = gridConfig();
  return {
    settings,
    mail_configured: mailConfigured,
    scan: { center, radius_km: radiusKm, spacing_km: spacingKm, dense_km: denseKm, fine_km: fineKm, interval_min: intervalMin, provider },
  };
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}
