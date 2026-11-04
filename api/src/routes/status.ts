import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';
import { requireAuth } from '../auth.js';
import { HttpError } from '../errors.js';
import { config } from '../config.js';
import { loadSettings } from '../settings.js';
import { evaluateUser, latestScan, nextScanAt, runScan, scanInProgress, type ScanRow, type StatusRow } from '../scanner.js';

/** What the dashboard shows: the latest scan, the person's evaluation of it, their alerts. */
export const statusRouter = Router();
statusRouter.use(requireAuth);

interface AlertRow {
  id: number;
  scan_id: number | null;
  status: string;
  prev_status: string | null;
  title: string;
  body: string;
  eta_min: number | null;
  distance_km: number | null;
  from_deg: number | null;
  push_sent: number;
  email_sent: boolean;
  suppressed: string | null;
  created_at: string;
}

async function buildStatus(userId: number) {
  const scan = await latestScan();
  let status = (await pool.query<StatusRow>('SELECT * FROM user_status WHERE user_id = $1', [userId])).rows[0] ?? null;
  // A new account, or a scan the scheduler has not reached this person with yet: evaluate quietly.
  if (!status || (scan && status.scan_id !== scan.id)) {
    status = await evaluateUser(userId, scan, { notify: false });
  }
  const settings = await loadSettings(userId);
  const lastAlert =
    (await pool.query<AlertRow>('SELECT * FROM alerts WHERE user_id = $1 AND suppressed IS NULL ORDER BY created_at DESC LIMIT 1', [userId])).rows[0] ?? null;
  const lastFailed = (
    await pool.query<{ scanned_at: string; error: string }>(
      'SELECT scanned_at, error FROM scans WHERE error IS NOT NULL ORDER BY scanned_at DESC LIMIT 1',
      [],
    )
  ).rows[0];
  const failedSince = lastFailed && (!scan || new Date(lastFailed.scanned_at) > new Date(scan.scanned_at)) ? lastFailed : null;

  const { center, radiusKm, spacingKm, intervalMin, provider, minRate, manualCooldownMin } = config.scan;
  return {
    scan: scan ? publicScan(scan) : null,
    status,
    settings,
    last_alert: lastAlert,
    scan_failed: failedSince,
    scan_in_progress: scanInProgress(),
    next_scan_at: nextScanAt()?.toISOString() ?? null,
    scan_config: { center, radius_km: radiusKm, spacing_km: spacingKm, interval_min: intervalMin, provider, min_rate: minRate, manual_cooldown_min: manualCooldownMin },
  };
}

const publicScan = (s: ScanRow) => ({
  id: s.id,
  scanned_at: s.scanned_at,
  provider: s.provider,
  reason: s.reason,
  center: { lat: s.center_lat, lon: s.center_lon },
  radius_km: s.radius_km,
  spacing_km: s.spacing_km,
  point_count: s.point_count,
  rain_count: s.rain_count,
  max_rate: s.max_rate,
  cells: s.cells,
  duration_ms: s.duration_ms,
});

statusRouter.get('/status', async (req, res) => {
  res.json(await buildStatus(req.user.id));
});

/** "Scan now": allowed when the last scan is older than the manual cooldown. */
statusRouter.post('/scan', async (req, res) => {
  const last = await latestScan();
  const ageMin = last ? (Date.now() - new Date(last.scanned_at).getTime()) / 60_000 : Infinity;
  if (ageMin < config.scan.manualCooldownMin && !scanInProgress()) {
    const wait = Math.ceil(config.scan.manualCooldownMin - ageMin);
    throw new HttpError(429, `Η τελευταία σάρωση είναι πολύ πρόσφατη, δοκιμάστε ξανά σε ${wait} λεπτ${wait === 1 ? 'ό' : 'ά'}`);
  }
  try {
    await runScan('manual');
  } catch (err) {
    throw new HttpError(502, `Η σάρωση απέτυχε: ${(err as Error).message}`);
  }
  req.log.info({ user: req.user.id }, 'manual scan');
  res.json(await buildStatus(req.user.id));
});

statusRouter.get('/alerts', async (req, res) => {
  const limit = z.coerce.number().int().min(1).max(200).default(50).parse(req.query.limit);
  const { rows } = await pool.query<AlertRow>('SELECT * FROM alerts WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2', [req.user.id, limit]);
  res.json({ alerts: rows });
});

statusRouter.get('/scans', async (req, res) => {
  const limit = z.coerce.number().int().min(1).max(500).default(48).parse(req.query.limit);
  const { rows } = await pool.query<Pick<ScanRow, 'id' | 'scanned_at' | 'reason' | 'rain_count' | 'max_rate' | 'duration_ms' | 'error'>>(
    'SELECT id, scanned_at, reason, rain_count, max_rate, duration_ms, error FROM scans ORDER BY scanned_at DESC LIMIT $1',
    [limit],
  );
  res.json({ scans: rows });
});
