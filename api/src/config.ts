const env = process.env;

const num = (raw: string | undefined, fallback: number): number => {
  const n = Number(raw);
  return raw !== undefined && raw !== '' && Number.isFinite(n) ? n : fallback;
};

export const config = {
  port: num(env.PORT, 4000),
  nodeEnv: env.NODE_ENV ?? 'development',
  logLevel: env.LOG_LEVEL ?? 'info',
  databaseUrl: env.DATABASE_URL ?? 'postgres://weather:weather@localhost:5432/weather',
  jwtSecret: env.JWT_SECRET ?? 'dev-secret-change-me',
  jwtExpiresIn: env.JWT_EXPIRES_IN ?? '30d',
  appUrl: (env.APP_URL ?? 'http://localhost:8081').replace(/\/$/, ''),
  /** IANA time zone used in notification texts (the server itself runs in UTC). */
  timeZone: env.DISPLAY_TZ ?? 'Europe/Athens',
  // Cloudflare Access single sign-on. Both empty = disabled (plain e-mail/password login only).
  access: {
    teamDomain: (env.ACCESS_TEAM_DOMAIN ?? '').replace(/^https?:\/\//, '').replace(/\/$/, ''),
    aud: env.ACCESS_AUD ?? '',
  },
  smtp: {
    host: env.SMTP_HOST ?? '',
    port: num(env.SMTP_PORT, 587),
    user: env.SMTP_USER ?? '',
    pass: env.SMTP_PASS ?? '',
    from: env.SMTP_FROM ?? 'Weather Alert <no-reply@example.com>',
  },
  /**
   * The scan: a grid of sample points (every SCAN_GRID_KM) inside SCAN_RADIUS_KM around the centre,
   * read every SCAN_INTERVAL_MIN minutes from the observation provider.
   */
  scan: {
    provider: (env.WEATHER_PROVIDER ?? 'open-meteo') as 'open-meteo' | 'openweathermap' | 'mock',
    center: { lat: num(env.SCAN_CENTER_LAT, 37.9838), lon: num(env.SCAN_CENTER_LON, 23.7275) },
    radiusKm: num(env.SCAN_RADIUS_KM, 100),
    spacingKm: num(env.SCAN_GRID_KM, 15),
    /**
     * A denser grid near the centre: every square whose centre is within SCAN_DENSE_KM of the scan
     * centre is split into SCAN_DENSE_SPLIT x SCAN_DENSE_SPLIT smaller ones (15 km / 3 = 5 km).
     * The weather models behind Open-Meteo resolve about 5 km around Athens, so going finer than
     * that only repeats the same values. SCAN_DENSE_KM=0 turns it off.
     */
    denseKm: num(env.SCAN_DENSE_KM, 25),
    denseSplit: Math.max(1, Math.round(num(env.SCAN_DENSE_SPLIT, 3))),
    intervalMin: num(env.SCAN_INTERVAL_MIN, 60),
    /** Precipitation (mm/h) from which a grid point counts as "raining". */
    minRate: num(env.RAIN_MIN_RATE, 0.2),
    /** Rain cells move roughly with the mid-level (850 hPa) wind; the surface wind underestimates it. */
    steeringFactor850: num(env.STEERING_FACTOR_850, 0.85),
    steeringFactor10m: num(env.STEERING_FACTOR_10M, 1.5),
    /** The least time between two manual "scan now" requests. */
    manualCooldownMin: num(env.SCAN_MANUAL_COOLDOWN_MIN, 3),
    owmApiKey: env.OWM_API_KEY ?? '',
    userAgent: env.WEATHER_USER_AGENT ?? 'weather-alert (self-hosted rain alert)',
    /** WEATHER_PROVIDER=mock: a rain band crossing the area, for demos (see weather/mock.ts). */
    mock: {
      fromDeg: num(env.MOCK_FROM_DEG, 250),
      speedKmh: num(env.MOCK_SPEED_KMH, 40),
      timeFactor: num(env.MOCK_TIME_FACTOR, 20),
      startKm: num(env.MOCK_START_KM, 90),
      widthKm: num(env.MOCK_WIDTH_KM, 30),
      peakRate: num(env.MOCK_PEAK_RATE, 5),
    },
  },
  alerts: {
    /** At most one notification per user in this many minutes, except when it starts raining. */
    cooldownMin: num(env.ALERT_COOLDOWN_MIN, 30),
  },
  /** Web Push keys. Leave empty: a pair is generated on first start and kept in the database. */
  vapid: {
    publicKey: env.VAPID_PUBLIC_KEY ?? '',
    privateKey: env.VAPID_PRIVATE_KEY ?? '',
    subject: env.VAPID_SUBJECT ?? 'mailto:no-reply@example.com',
  },
  /** Where a new account watches until it picks its own place. */
  defaultHome: { name: 'Νέος Κόσμος, Αθήνα', lat: 37.9597, lon: 23.7276 },
};

/** The grid as configured: outer spacing, and the spacing and reach of the dense part near the centre. */
export function gridConfig() {
  const { spacingKm, denseKm, denseSplit } = config.scan;
  const dense = denseKm > 0 && denseSplit > 1;
  return {
    spacingKm,
    denseKm: dense ? denseKm : 0,
    fineKm: dense ? Math.round((spacingKm / denseSplit) * 100) / 100 : spacingKm,
    dense: { radiusKm: dense ? denseKm : 0, split: dense ? denseSplit : 1 },
  };
}
