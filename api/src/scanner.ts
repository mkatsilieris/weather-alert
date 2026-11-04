import { config } from './config.js';
import { pool } from './db.js';
import { log } from './log.js';
import { gridPoints } from './lib/geo.js';
import { evaluate, type Evaluation, type RainCell, type RainStatus } from './lib/approach.js';
import { createProvider, type ObservationProvider } from './weather/provider.js';
import { fetchHomeForecast, forecastEtaMin, type HomeForecast } from './weather/forecast.js';
import { sendPushToUser } from './notify.js';
import { sendAlertEmail } from './mail.js';
import { inQuietHours, loadSettings, type Settings } from './settings.js';

/**
 * The scan: every SCAN_INTERVAL_MIN the grid around the centre is read from the provider and
 * stored as one `scans` row. Then every person's home is evaluated against it (which cells are
 * coming, what the point forecast says) and, when their status changed, they are told.
 */

export interface ScanRow {
  id: number;
  scanned_at: string;
  provider: string;
  reason: string;
  center_lat: number;
  center_lon: number;
  radius_km: number;
  spacing_km: number;
  point_count: number;
  rain_count: number;
  max_rate: number;
  /** [[lat, lon, rate, steeringKmh, steeringFromDeg], ...] */
  cells: number[][];
  duration_ms: number;
  error: string | null;
}

export interface StatusDetail {
  evaluation: Evaluation;
  forecast: HomeForecast | null;
  forecast_error?: string;
}

export interface StatusRow {
  user_id: number;
  scan_id: number | null;
  status: RainStatus;
  eta_min: number | null;
  distance_km: number | null;
  from_deg: number | null;
  detail: StatusDetail;
  evaluated_at: string;
}

export type ScanReason = 'startup' | 'schedule' | 'manual';

let provider: ObservationProvider | null = null;
const getProvider = () => (provider ??= createProvider());

export const cellsOf = (scan: ScanRow): RainCell[] =>
  scan.cells.map(([lat, lon, rate, steeringKmh, steeringFromDeg]) => ({ lat, lon, rate, steeringKmh, steeringFromDeg }));

export async function latestScan(): Promise<ScanRow | null> {
  const { rows } = await pool.query<ScanRow>('SELECT * FROM scans WHERE error IS NULL ORDER BY scanned_at DESC LIMIT 1');
  return rows[0] ?? null;
}

let inFlight: Promise<ScanRow> | null = null;

/** Scans now; a scan already running is shared instead of started twice. */
export function runScan(reason: ScanReason): Promise<ScanRow> {
  if (inFlight) return inFlight;
  inFlight = doScan(reason).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

export const scanInProgress = (): boolean => inFlight !== null;

async function doScan(reason: ScanReason): Promise<ScanRow> {
  const started = Date.now();
  const { center, radiusKm, spacingKm, minRate } = config.scan;
  const points = gridPoints(center, radiusKm, spacingKm);
  const prov = getProvider();

  let cells: RainCell[];
  try {
    cells = await prov.observe(points);
  } catch (err) {
    const message = (err as Error).message;
    await pool.query(
      `INSERT INTO scans (provider, reason, center_lat, center_lon, radius_km, spacing_km, point_count, rain_count, max_rate, cells, duration_ms, error)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 0, '[]', $8, $9)`,
      [prov.name, reason, center.lat, center.lon, radiusKm, spacingKm, points.length, Date.now() - started, message],
    );
    log.error({ err, provider: prov.name, points: points.length }, 'scan failed');
    throw err;
  }

  const raining = cells.filter((c) => c.rate >= minRate);
  const maxRate = raining.reduce((m, c) => Math.max(m, c.rate), 0);
  const packed = cells.map((c) => [c.lat, c.lon, round2(c.rate), c.steeringKmh, c.steeringFromDeg]);
  const { rows } = await pool.query<ScanRow>(
    `INSERT INTO scans (provider, reason, center_lat, center_lon, radius_km, spacing_km, point_count, rain_count, max_rate, cells, duration_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
    [prov.name, reason, center.lat, center.lon, radiusKm, spacingKm, cells.length, raining.length, maxRate, JSON.stringify(packed), Date.now() - started],
  );
  const scan = rows[0];
  log.info(
    { scan: scan.id, reason, provider: prov.name, points: cells.length, raining: raining.length, maxRate: round2(maxRate), ms: scan.duration_ms },
    'scan done',
  );
  await evaluateAll(scan);
  // Old scans are not needed once their alerts carry the facts (alerts.scan_id becomes NULL).
  await pool.query(`DELETE FROM scans WHERE scanned_at < now() - interval '60 days'`).catch((err) => log.warn({ err }, 'scan cleanup failed'));
  return scan;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Evaluates (and notifies) every account against the scan. One person's failure never stops the others. */
export async function evaluateAll(scan: ScanRow): Promise<void> {
  const { rows } = await pool.query<{ id: number }>('SELECT id FROM users ORDER BY id');
  const forecasts = new Map<string, Promise<HomeForecast>>();
  for (const u of rows) {
    try {
      await evaluateUser(u.id, scan, { notify: true, forecasts });
    } catch (err) {
      log.error({ err, user: u.id, scan: scan.id }, 'evaluation failed');
    }
  }
}

interface EvaluateOptions {
  /** send notifications when the status changed (false for a refresh the person asked for) */
  notify: boolean;
  /** point forecasts already fetched in this pass, keyed by rounded coordinates */
  forecasts?: Map<string, Promise<HomeForecast>>;
}

export async function evaluateUser(userId: number, scan: ScanRow | null, opts: EvaluateOptions): Promise<StatusRow> {
  const s = await loadSettings(userId);
  const home = { lat: s.home_lat, lon: s.home_lon };

  let forecast: HomeForecast | null = null;
  let forecastError: string | undefined;
  try {
    const key = `${home.lat.toFixed(3)},${home.lon.toFixed(3)}`;
    let pending = opts.forecasts?.get(key);
    if (!pending) {
      pending = fetchHomeForecast(home);
      opts.forecasts?.set(key, pending);
    }
    forecast = await pending;
  } catch (err) {
    forecastError = (err as Error).message;
    log.warn({ user: userId, reason: forecastError }, 'home forecast unavailable, evaluating from the grid only');
  }

  const homeNow = forecast ? { rateNow: forecast.current.precipitation, forecastEtaMin: forecastEtaMin(forecast) } : null;
  const evaluation = evaluate(
    scan ? cellsOf(scan) : [],
    home,
    {
      alertRadiusKm: s.alert_radius_km,
      horizonMin: s.horizon_min,
      minRate: config.scan.minRate,
      cellRadiusKm: (scan?.spacing_km ?? config.scan.spacingKm) / 2,
    },
    homeNow,
  );

  const prev = (await pool.query<StatusRow>('SELECT * FROM user_status WHERE user_id = $1', [userId])).rows[0] ?? null;
  const detail: StatusDetail = { evaluation, forecast, ...(forecastError ? { forecast_error: forecastError } : {}) };
  const { rows } = await pool.query<StatusRow>(
    `INSERT INTO user_status (user_id, scan_id, status, eta_min, distance_km, from_deg, detail, evaluated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now())
     ON CONFLICT (user_id) DO UPDATE SET scan_id = EXCLUDED.scan_id, status = EXCLUDED.status, eta_min = EXCLUDED.eta_min,
       distance_km = EXCLUDED.distance_km, from_deg = EXCLUDED.from_deg, detail = EXCLUDED.detail, evaluated_at = now()
     RETURNING *`,
    [userId, scan?.id ?? null, evaluation.status, evaluation.etaMin, evaluation.distanceKm, evaluation.fromDeg, JSON.stringify(detail)],
  );
  log.debug({ user: userId, scan: scan?.id, status: evaluation.status, prev: prev?.status, eta: evaluation.etaMin }, 'evaluated');

  if (opts.notify) await maybeNotify(userId, s, prev?.status ?? null, evaluation, scan?.id ?? null);
  return rows[0];
}

// ---- notifications ----

const fmtTime = (d: Date) => new Intl.DateTimeFormat('el-GR', { hour: '2-digit', minute: '2-digit', timeZone: config.timeZone }).format(d);
const isActive = (st: RainStatus | null) => st === 'raining' || st === 'approaching';

/** The message a change of status deserves, or null when it is not worth a notification. */
export function composeAlert(prev: RainStatus | null, ev: Evaluation, s: Settings, now = new Date()): { title: string; body: string } | null {
  const place = s.home_name;
  const at = (min: number) => fmtTime(new Date(now.getTime() + min * 60_000));
  switch (ev.status) {
    case 'raining': {
      if (prev === 'raining') return null;
      return { title: `Βρέχει τώρα: ${place}`, body: `Βροχή ${ev.rateNow.toFixed(1)} mm/h στην περιοχή σας.` };
    }
    case 'approaching': {
      if (isActive(prev)) return null;
      const eta = Math.round(ev.etaMin ?? 0);
      const dist = Math.round(ev.distanceKm ?? 0);
      const speed = Math.round(ev.threats[0]?.speedKmh ?? 0);
      const body =
        eta <= 5
          ? `Βροχή ${dist} km ${ev.fromName} από εσάς, φτάνει από στιγμή σε στιγμή.`
          : `Βροχή ${dist} km ${ev.fromName} από εσάς κινείται προς τα εδώ με ${speed} km/h. Εκτιμώμενη άφιξη σε ~${eta} λεπτά (${at(eta)}).`;
      return { title: `Έρχεται βροχή: ${place}`, body };
    }
    case 'forecast': {
      if (!s.notify_forecast || isActive(prev) || prev === 'forecast') return null;
      const eta = Math.round(ev.etaMin ?? 0);
      return {
        title: `Πιθανή βροχή: ${place}`,
        body: `Η πρόγνωση δείχνει βροχή γύρω στις ${at(eta)} (σε ~${eta} λεπτά). Δεν εντοπίζεται ακόμη βροχή που να κινείται προς εσάς.`,
      };
    }
    case 'nearby':
    case 'clear': {
      if (!s.notify_clear || !isActive(prev)) return null;
      const around = ev.rainCells > 0 ? ' Υπάρχει ακόμη βροχή στην ευρύτερη περιοχή.' : '';
      if (prev === 'raining') return { title: `Σταμάτησε η βροχή: ${place}`, body: `Δεν βρέχει πλέον στην περιοχή σας.${around}` };
      return { title: `Η βροχή δεν έρχεται πλέον: ${place}`, body: `Η βροχή άλλαξε πορεία ή εξασθένησε.${around}` };
    }
  }
}

async function maybeNotify(userId: number, s: Settings, prev: RainStatus | null, ev: Evaluation, scanId: number | null): Promise<void> {
  const msg = composeAlert(prev, ev, s);
  if (!msg) return;

  let suppressed: string | null = null;
  if (!s.notify_push && !s.notify_email) suppressed = 'disabled';
  else if (inQuietHours(s)) suppressed = 'quiet';
  else if (ev.status !== 'raining') {
    const last = await pool.query<{ created_at: Date }>(
      'SELECT created_at FROM alerts WHERE user_id = $1 AND suppressed IS NULL ORDER BY created_at DESC LIMIT 1',
      [userId],
    );
    const lastAt = last.rows[0] ? new Date(last.rows[0].created_at).getTime() : 0;
    if (Date.now() - lastAt < config.alerts.cooldownMin * 60_000) suppressed = 'cooldown';
  }

  let pushSent = 0;
  let emailSent = false;
  if (!suppressed) {
    if (s.notify_push) {
      try {
        pushSent = (await sendPushToUser(userId, { title: msg.title, body: msg.body, tag: 'rain', url: '/' })).sent;
      } catch (err) {
        log.error({ err, user: userId }, 'push notification failed');
      }
    }
    if (s.notify_email) {
      try {
        const { rows } = await pool.query<{ email: string }>('SELECT email FROM users WHERE id = $1', [userId]);
        if (rows[0]) emailSent = await sendAlertEmail(rows[0].email, msg.title, msg.body);
      } catch (err) {
        log.error({ err, user: userId }, 'alert e-mail failed');
      }
    }
  }

  await pool.query(
    `INSERT INTO alerts (user_id, scan_id, status, prev_status, title, body, eta_min, distance_km, from_deg, push_sent, email_sent, suppressed)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [userId, scanId, ev.status, prev, msg.title, msg.body, ev.etaMin, ev.distanceKm, ev.fromDeg, pushSent, emailSent, suppressed],
  );
  log.info({ user: userId, status: ev.status, prev, eta: ev.etaMin, pushSent, emailSent, suppressed, title: msg.title }, 'alert');
}

// ---- scheduler ----

let nextAt: Date | null = null;

/** Runs the first scan shortly after start, then one every SCAN_INTERVAL_MIN minutes. */
export function startScheduler(): void {
  const everyMs = Math.max(1, config.scan.intervalMin) * 60_000;
  const schedule = (delayMs: number, reason: ScanReason) => {
    nextAt = new Date(Date.now() + delayMs);
    setTimeout(async () => {
      try {
        await runScan(reason);
      } catch {
        /* already logged */
      }
      schedule(everyMs, 'schedule');
    }, delayMs).unref();
  };
  schedule(5_000, 'startup');
}

export const nextScanAt = (): Date | null => nextAt;
