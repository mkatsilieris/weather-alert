export interface User {
  id: number;
  email: string;
  name: string;
}

export type RainStatus = 'raining' | 'approaching' | 'forecast' | 'nearby' | 'clear';

export interface LatLon {
  lat: number;
  lon: number;
}

/** One raining grid cell, as the API judged it for the person's home. */
export interface Threat {
  lat: number;
  lon: number;
  rate: number;
  distanceKm: number;
  bearingDeg: number;
  bearingName: string;
  headingDeg: number;
  speedKmh: number;
  closestKm: number;
  etaMin: number | null;
  approaching: boolean;
}

export interface Evaluation {
  status: RainStatus;
  etaMin: number | null;
  distanceKm: number | null;
  fromDeg: number | null;
  fromName: string | null;
  rateNow: number;
  forecastEtaMin: number | null;
  rainCells: number;
  maxRate: number;
  threats: Threat[];
}

export interface HomeForecast {
  fetchedAt: string;
  current: {
    time: string;
    precipitation: number;
    temperature: number | null;
    weatherCode: number | null;
    windKmh: number | null;
    windFromDeg: number | null;
  };
  minutely15: { time: string; precipitation: number }[];
  hourly: { time: string; precipitation: number; probability: number | null; weatherCode: number | null }[];
}

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

export interface ScanConfig {
  center: LatLon;
  radius_km: number;
  spacing_km: number;
  interval_min: number;
  provider: string;
}

export interface SettingsResponse {
  settings: Settings;
  mail_configured: boolean;
  scan: ScanConfig;
}

export interface Scan {
  id: number;
  scanned_at: string;
  provider: string;
  reason: string;
  center: LatLon;
  radius_km: number;
  spacing_km: number;
  point_count: number;
  rain_count: number;
  max_rate: number;
  /** [[lat, lon, rate mm/h, steering km/h, steering from deg], ...] */
  cells: number[][];
  duration_ms: number;
}

export interface UserStatus {
  user_id: number;
  scan_id: number | null;
  status: RainStatus;
  eta_min: number | null;
  distance_km: number | null;
  from_deg: number | null;
  detail: { evaluation: Evaluation; forecast: HomeForecast | null; forecast_error?: string };
  evaluated_at: string;
}

export interface Alert {
  id: number;
  scan_id: number | null;
  status: RainStatus;
  prev_status: RainStatus | null;
  title: string;
  body: string;
  eta_min: number | null;
  distance_km: number | null;
  from_deg: number | null;
  push_sent: number;
  email_sent: boolean;
  suppressed: 'quiet' | 'cooldown' | 'disabled' | null;
  created_at: string;
}

export interface StatusResponse {
  scan: Scan | null;
  status: UserStatus;
  settings: Settings;
  last_alert: Alert | null;
  scan_failed: { scanned_at: string; error: string } | null;
  scan_in_progress: boolean;
  next_scan_at: string | null;
  scan_config: ScanConfig & { min_rate: number; manual_cooldown_min: number };
}

export interface ScanSummary {
  id: number;
  scanned_at: string;
  reason: string;
  rain_count: number;
  max_rate: number;
  duration_ms: number;
  error: string | null;
}

export interface GeoResult {
  name: string;
  region: string;
  lat: number;
  lon: number;
  distance_km: number;
  inside: boolean;
}
