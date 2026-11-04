import { config } from './config.js';
import { pool, type Queryable } from './db.js';

export interface Settings {
  user_id: number;
  home_name: string;
  home_lat: number;
  home_lon: number;
  alert_radius_km: number;
  horizon_min: number;
  notify_push: boolean;
  notify_email: boolean;
  notify_forecast: boolean;
  notify_clear: boolean;
  quiet_from: number | null;
  quiet_to: number | null;
  updated_at: string;
}

/** The person's settings, created with the defaults the first time they are asked for. */
export async function loadSettings(userId: number, db: Queryable = pool): Promise<Settings> {
  const existing = await db.query<Settings>('SELECT * FROM user_settings WHERE user_id = $1', [userId]);
  if (existing.rows[0]) return existing.rows[0];
  const home = config.defaultHome;
  const { rows } = await db.query<Settings>(
    `INSERT INTO user_settings (user_id, home_name, home_lat, home_lon) VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
     RETURNING *`,
    [userId, home.name, home.lat, home.lon],
  );
  return rows[0];
}

/** Local hour (0-23) in the display time zone. */
export function localHour(date = new Date()): number {
  const h = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: config.timeZone }).format(date);
  return Number(h) % 24;
}

/** True when the person asked for silence at this time of day. */
export function inQuietHours(s: Pick<Settings, 'quiet_from' | 'quiet_to'>, date = new Date()): boolean {
  if (s.quiet_from === null || s.quiet_to === null || s.quiet_from === s.quiet_to) return false;
  const h = localHour(date);
  // 23 -> 7 wraps past midnight
  return s.quiet_from < s.quiet_to ? h >= s.quiet_from && h < s.quiet_to : h >= s.quiet_from || h < s.quiet_to;
}
