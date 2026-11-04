-- Idempotent schema. Executed on every API start.

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS password_resets (
  token      TEXT PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ
);

-- Key/value settings of the installation (the Web Push key pair lives here).
CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- What each person watches and how they want to be told.
CREATE TABLE IF NOT EXISTS user_settings (
  user_id         INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  home_name       TEXT NOT NULL,
  home_lat        DOUBLE PRECISION NOT NULL,
  home_lon        DOUBLE PRECISION NOT NULL,
  -- rain counts as "arriving" when a cell will come within this distance of home
  alert_radius_km REAL NOT NULL DEFAULT 10,
  -- ... within this many minutes
  horizon_min     INT NOT NULL DEFAULT 120,
  notify_push     BOOLEAN NOT NULL DEFAULT true,
  notify_email    BOOLEAN NOT NULL DEFAULT false,
  -- also warn when only the forecast (not an observed cell) expects rain at home
  notify_forecast BOOLEAN NOT NULL DEFAULT false,
  -- tell when the rain has moved away again
  notify_clear    BOOLEAN NOT NULL DEFAULT true,
  -- local hours (0-23) between which nothing is sent; both NULL = always
  quiet_from      SMALLINT CHECK (quiet_from BETWEEN 0 AND 23),
  quiet_to        SMALLINT CHECK (quiet_to BETWEEN 0 AND 23),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Browsers / phones that asked for Web Push notifications.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id           SERIAL PRIMARY KEY,
  user_id      INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint     TEXT UNIQUE NOT NULL,
  p256dh       TEXT NOT NULL,
  auth         TEXT NOT NULL,
  user_agent   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  failures     INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON push_subscriptions(user_id);

-- One row per scan of the area: every grid point with its precipitation and steering wind.
CREATE TABLE IF NOT EXISTS scans (
  id          SERIAL PRIMARY KEY,
  scanned_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  provider    TEXT NOT NULL,
  reason      TEXT NOT NULL,
  center_lat  DOUBLE PRECISION NOT NULL,
  center_lon  DOUBLE PRECISION NOT NULL,
  radius_km   REAL NOT NULL,
  spacing_km  REAL NOT NULL,
  point_count INT NOT NULL,
  rain_count  INT NOT NULL,
  max_rate    REAL NOT NULL,
  -- [[lat, lon, rate_mm_h, steering_kmh, steering_from_deg], ...]
  cells       JSONB NOT NULL,
  duration_ms INT NOT NULL,
  error       TEXT
);
CREATE INDEX IF NOT EXISTS scans_time_idx ON scans(scanned_at DESC);

-- The latest evaluation of a scan for each person (what the dashboard shows, and the previous
-- state when the next scan decides whether something changed).
CREATE TABLE IF NOT EXISTS user_status (
  user_id      INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  scan_id      INT REFERENCES scans(id) ON DELETE SET NULL,
  status       TEXT NOT NULL CHECK (status IN ('raining', 'approaching', 'forecast', 'nearby', 'clear')),
  eta_min      REAL,
  distance_km  REAL,
  from_deg     REAL,
  detail       JSONB NOT NULL,
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Every notification that was (or would have been) sent.
CREATE TABLE IF NOT EXISTS alerts (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scan_id     INT REFERENCES scans(id) ON DELETE SET NULL,
  status      TEXT NOT NULL,
  prev_status TEXT,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  eta_min     REAL,
  distance_km REAL,
  from_deg    REAL,
  push_sent   INT NOT NULL DEFAULT 0,
  email_sent  BOOLEAN NOT NULL DEFAULT false,
  suppressed  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS alerts_user_idx ON alerts(user_id, created_at DESC);
