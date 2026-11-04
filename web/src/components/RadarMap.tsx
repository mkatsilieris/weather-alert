import { toLocalKm } from '../geo';
import type { LatLon, Scan, Threat } from '../types';

interface Props {
  scan: Scan;
  home: LatLon;
  homeName: string;
  alertRadiusKm: number;
  threats: Threat[];
  minRate: number;
}

const level = (rate: number) => (rate < 1 ? 'light' : rate < 4 ? 'moderate' : 'heavy');

/**
 * The scan area seen from above: north up, the centre of the scan in the middle, every grid
 * point as a dot (dry) or a square (raining, darker = heavier) with an arrow showing where the
 * rain is heading, and the person's home with its alert radius.
 */
export function RadarMap({ scan, home, homeName, alertRadiusKm, threats, minRate }: Props) {
  const R = scan.radius_km;
  const s = scan.spacing_km;
  const pad = 12;
  const size = 2 * (R + pad);
  const h = toLocalKm(scan.center, home);
  const approaching = new Set(threats.filter((t) => t.approaching).map((t) => `${t.lat},${t.lon}`));
  const rings = [0.25, 0.5, 0.75, 1].map((f) => Math.round(R * f));

  return (
    <svg className="radar" viewBox={`${-R - pad} ${-R - pad} ${size} ${size}`} role="img" aria-label="Χάρτης βροχής γύρω από την περιοχή σάρωσης">
      <defs>
        <marker id="arrowhead" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto">
          <path d="M0 0 L10 5 L0 10 z" className="radar-arrowhead" />
        </marker>
      </defs>
      <circle r={R} className="radar-area" />
      {rings.map((r) => (
        <g key={r}>
          <circle r={r} className="radar-ring" />
          <text x={1.5} y={-r - 1} className="radar-label">
            {r} km
          </text>
        </g>
      ))}
      <line x1={-R} x2={R} y1={0} y2={0} className="radar-ring" />
      <line y1={-R} y2={R} x1={0} x2={0} className="radar-ring" />
      <text x={0} y={-R - 4} textAnchor="middle" className="radar-compass">Β</text>
      <text x={0} y={R + 9} textAnchor="middle" className="radar-compass">Ν</text>
      <text x={R + 3} y={2.5} textAnchor="start" className="radar-compass">Α</text>
      <text x={-R - 3} y={2.5} textAnchor="end" className="radar-compass">Δ</text>

      {/* layer 1: the cells */}
      {scan.cells.map(([lat, lon, rate, speed, fromDeg], i) => {
        const p = toLocalKm(scan.center, { lat, lon });
        const cx = p.x;
        const cy = -p.y;
        if (rate < minRate) return <circle key={i} cx={cx} cy={cy} r={0.8} className="radar-dry" />;
        const cls = `radar-cell ${level(rate)}${approaching.has(`${lat},${lon}`) ? ' approaching' : ''}`;
        return (
          <rect key={i} x={cx - s / 2 + 0.6} y={cy - s / 2 + 0.6} width={s - 1.2} height={s - 1.2} rx={1.5} className={cls}>
            <title>{`${rate.toFixed(1)} mm/h, προς ${Math.round((fromDeg + 180) % 360)}° με ${Math.round(speed)} km/h`}</title>
          </rect>
        );
      })}
      {/* layer 2: the arrows, drawn after every cell so that no neighbouring cell covers them */}
      {scan.cells.map(([lat, lon, rate, speed, fromDeg], i) => {
        if (rate < minRate || speed <= 2) return null;
        const p = toLocalKm(scan.center, { lat, lon });
        const heading = ((fromDeg + 180) * Math.PI) / 180;
        const len = s * (0.5 + Math.min(speed, 60) / 60);
        const x2 = p.x + Math.sin(heading) * len;
        const y2 = -p.y - Math.cos(heading) * len;
        return (
          <g key={i} className="radar-arrow-group">
            <line x1={p.x} y1={-p.y} x2={x2} y2={y2} className="radar-arrow-halo" />
            <line x1={p.x} y1={-p.y} x2={x2} y2={y2} className="radar-arrow" markerEnd="url(#arrowhead)" />
          </g>
        );
      })}

      <line x1={-2} x2={2} y1={0} y2={0} className="radar-center" />
      <line y1={-2} y2={2} x1={0} x2={0} className="radar-center" />
      <circle cx={h.x} cy={-h.y} r={alertRadiusKm} className="radar-alert" />
      <circle cx={h.x} cy={-h.y} r={2.4} className="radar-home" />
      <text x={h.x + 3.5} y={-h.y - 3} className="radar-home-label">
        {homeName}
      </text>
    </svg>
  );
}

export function RadarLegend() {
  return (
    <div className="legend">
      <span>
        <i className="legend-dry" /> χωρίς βροχή
      </span>
      <span>
        <i className="legend-light" /> ασθενής
      </span>
      <span>
        <i className="legend-moderate" /> μέτρια
      </span>
      <span>
        <i className="legend-heavy" /> ισχυρή
      </span>
      <span>
        <i className="legend-approaching" /> έρχεται προς εσάς
      </span>
      <span>→ πορεία</span>
    </div>
  );
}
