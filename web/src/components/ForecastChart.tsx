import { timeShort } from '../format';
import type { HomeForecast } from '../types';

/** The next 6 hours at home in 15-minute bars (mm), then the next 12 hours as chips. */
export function ForecastChart({ forecast }: { forecast: HomeForecast }) {
  const slots = forecast.minutely15.slice(0, 24);
  const W = 360;
  const H = 110;
  const padL = 26;
  const padB = 18;
  const padT = 6;
  const max = Math.max(0.5, ...slots.map((s) => s.precipitation));
  const bw = (W - padL - 2) / Math.max(1, slots.length);
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max);

  return (
    <div className="stack">
      {slots.length > 0 ? (
        <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Βροχή ανά 15 λεπτά τις επόμενες 6 ώρες">
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line x1={padL} x2={W} y1={y(max * f)} y2={y(max * f)} className="grid" />
              <text x={padL - 4} y={y(max * f) + 3.5} textAnchor="end">
                {(max * f).toFixed(1)}
              </text>
            </g>
          ))}
          {slots.map((s, i) => {
            const top = y(s.precipitation);
            return (
              <rect
                key={s.time}
                x={padL + i * bw + 1}
                y={top}
                width={Math.max(1, bw - 2)}
                height={Math.max(0, H - padB - top)}
                rx={1}
                className={`bar ${s.precipitation >= 0.1 ? 'wet' : 'dry'}`}
              >
                <title>{`${timeShort(s.time)}: ${s.precipitation.toFixed(2)} mm`}</title>
              </rect>
            );
          })}
          {slots.map((s, i) =>
            i % 4 === 0 ? (
              <text key={s.time} x={padL + i * bw + 1} y={H - 5}>
                {timeShort(s.time)}
              </text>
            ) : null,
          )}
        </svg>
      ) : (
        <p className="muted small">Δεν υπάρχει πρόγνωση ανά 15 λεπτά για το σημείο.</p>
      )}
      <div className="hour-strip" aria-label="Πρόγνωση ανά ώρα">
        {forecast.hourly.map((h) => (
          <div key={h.time} className={`hour-chip${h.precipitation >= 0.3 ? ' wet' : ''}`}>
            <div className="muted">{timeShort(h.time)}</div>
            <div className="hour-mm">{h.precipitation.toFixed(1)} mm</div>
            <div className="muted small">{h.probability !== null ? `${h.probability}%` : '—'}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
