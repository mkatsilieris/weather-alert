import type { RainStatus } from './types';

const timeFmt = new Intl.DateTimeFormat('el-GR', { hour: '2-digit', minute: '2-digit' });
const dateTimeFmt = new Intl.DateTimeFormat('el-GR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** '15:40' */
export const timeShort = (iso: string | Date): string => timeFmt.format(new Date(iso));

/** '04/11, 15:40' */
export const dateTime = (iso: string | Date): string => dateTimeFmt.format(new Date(iso));

/** 'πριν 12 λεπτά', 'σε 48 λεπτά', 'μόλις τώρα' */
export function relative(iso: string | Date, now = Date.now()): string {
  const diffMin = Math.round((new Date(iso).getTime() - now) / 60_000);
  const abs = Math.abs(diffMin);
  if (abs < 1) return 'μόλις τώρα';
  const span = abs < 60 ? `${abs} λεπτ${abs === 1 ? 'ό' : 'ά'}` : abs < 48 * 60 ? `${Math.round(abs / 60)} ώρ${Math.round(abs / 60) === 1 ? 'α' : 'ες'}` : `${Math.round(abs / 1440)} ημέρες`;
  return diffMin < 0 ? `πριν ${span}` : `σε ${span}`;
}

/** 40 -> '40 λεπτά', 95 -> '1 ώ 35 λ', 0 -> 'λίγα λεπτά' */
export function minutes(min: number): string {
  const m = Math.round(min);
  if (m <= 2) return 'λίγα λεπτά';
  if (m < 60) return `${m} λεπτά`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} ώ ${rest} λ` : `${h} ώρ${h === 1 ? 'α' : 'ες'}`;
}

export const km = (n: number): string => `${n < 10 ? n.toFixed(1) : Math.round(n)} km`;

export const mmh = (n: number): string => `${n < 10 ? n.toFixed(1) : Math.round(n)} mm/h`;

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

export const STATUS_META: Record<RainStatus, { label: string; icon: string }> = {
  raining: { label: 'Βρέχει τώρα', icon: '🌧️' },
  approaching: { label: 'Έρχεται βροχή', icon: '⚠️' },
  forecast: { label: 'Πιθανή βροχή', icon: '🌦️' },
  nearby: { label: 'Βροχή στην περιοχή, όχι προς εσάς', icon: '🌥️' },
  clear: { label: 'Καθαρά', icon: '☀️' },
};

/** WMO weather code -> short Greek description. */
export function weatherText(code: number | null): string {
  if (code === null) return '';
  if (code === 0) return 'αίθριος';
  if (code <= 2) return 'λίγα σύννεφα';
  if (code === 3) return 'συννεφιά';
  if (code <= 48) return 'ομίχλη';
  if (code <= 57) return 'ψιχάλα';
  if (code <= 67) return 'βροχή';
  if (code <= 77) return 'χιόνι';
  if (code <= 82) return 'μπόρες';
  if (code <= 86) return 'χιονόνερο';
  return 'καταιγίδα';
}
