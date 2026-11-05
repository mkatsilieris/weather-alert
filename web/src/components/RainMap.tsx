import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { compassName } from '../geo';
import type { LatLon, Scan, Threat } from '../types';

interface Props {
  scan: Scan;
  home: LatLon;
  homeName: string;
  alertRadiusKm: number;
  threats: Threat[];
  minRate: number;
}

const COLORS = { light: '#93c5fd', moderate: '#3b82f6', heavy: '#1e3a8a' };
const level = (rate: number): keyof typeof COLORS => (rate < 1 ? 'light' : rate < 4 ? 'moderate' : 'heavy');

const KM_PER_DEG_LAT = 110.574;
const kmPerDegLon = (lat: number) => 111.32 * Math.cos((lat * Math.PI) / 180);
/** The point `km` away from (lat, lon) in the direction `headingDeg` (0 = north). */
function offset(lat: number, lon: number, headingDeg: number, km: number): L.LatLngTuple {
  const h = (headingDeg * Math.PI) / 180;
  return [lat + (km * Math.cos(h)) / KM_PER_DEG_LAT, lon + (km * Math.sin(h)) / kmPerDegLon(lat)];
}

/** Side of a cell's square, km: stored with the cell since the grid got denser near the centre. */
const sizeOf = (c: number[], fallback: number) => (c[5] > 0 ? c[5] : fallback);
/** Distance between two [lat, lon, ...] cells, km (flat, fine at this scale). */
const flatKm = (a: number[], b: number[]) =>
  Math.hypot((a[0] - b[0]) * KM_PER_DEG_LAT, (a[1] - b[1]) * kmPerDegLon((a[0] + b[0]) / 2));

/**
 * The scan area on an OpenStreetMap background: every grid point as a dot (dry) or a square
 * (raining, darker = heavier) with an arrow showing where the rain is heading, and the person's
 * home with its alert radius. Leaflet draws the overlays in real coordinates, so they stay in
 * place when the map is zoomed or dragged.
 */
const DETAIL_KEY = 'weatheralert.mapDetail';
const readDetail = () => {
  try {
    return localStorage.getItem(DETAIL_KEY) === '1';
  } catch {
    return false;
  }
};

export function RainMap(props: Props) {
  const [detail, setDetail] = useState(readDetail);
  const toggle = () => {
    const next = !detail;
    setDetail(next);
    try {
      localStorage.setItem(DETAIL_KEY, next ? '1' : '0');
    } catch {
      /* storage unavailable */
    }
  };
  return (
    <div className="stack">
      <RainMapCanvas {...props} detail={detail} />
      <div className="row between wrap">
        <RainLegend />
        <button type="button" className="btn btn-small" onClick={toggle}>
          {detail ? 'Λιγότερα' : 'Λεπτομέρειες'}
        </button>
      </div>
    </div>
  );
}

/**
 * OpenStreetMap tiles: free, no key, roads and Greek place names. They are toned down in CSS
 * (.rain-map .leaflet-tile-pane) to an almost grey map so that the rain stands out.
 */
const BASEMAP = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

function RainMapCanvas({ scan, home, homeName, alertRadiusKm, threats, minRate, detail }: Props & { detail: boolean }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const overlay = useRef<L.LayerGroup | null>(null);

  // The map itself is created once; the overlays are redrawn whenever the data changes.
  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, { scrollWheelZoom: false, attributionControl: true });
    L.tileLayer(BASEMAP, {
      maxZoom: 17,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m);
    m.fitBounds(L.latLng(scan.center.lat, scan.center.lon).toBounds(scan.radius_km * 2 * 1000), { padding: [4, 4] });
    map.current = m;
    overlay.current = L.layerGroup().addTo(m);
    return () => {
      m.remove();
      map.current = null;
      overlay.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const g = overlay.current;
    if (!g) return;
    g.clearLayers();
    const approaching = new Set(threats.filter((t) => t.approaching).map((t) => `${t.lat},${t.lon}`));

    // scan area
    L.circle([scan.center.lat, scan.center.lon], {
      radius: scan.radius_km * 1000,
      color: '#64748b',
      weight: 1,
      opacity: 0.5,
      dashArray: '4 6',
      fill: false,
      interactive: false,
    }).addTo(g);

    // cells: each one is a square of its own size (smaller near the centre, where the grid is denser)
    const raining = scan.cells.filter((c) => c[2] >= minRate);
    for (const c of scan.cells) {
      const [lat, lon, rate, speed, fromDeg] = c;
      if (rate < minRate) {
        if (detail) L.circleMarker([lat, lon], { radius: 2, color: '#94a3b8', weight: 1, fillOpacity: 0.6, interactive: false }).addTo(g);
        continue;
      }
      const half = sizeOf(c, scan.spacing_km) * 0.46;
      const dLat = half / KM_PER_DEG_LAT;
      const dLon = half / kmPerDegLon(lat);
      const heading = (fromDeg + 180) % 360;
      L.rectangle(
        [
          [lat - dLat, lon - dLon],
          [lat + dLat, lon + dLon],
        ],
        {
          color: '#f59e0b',
          stroke: approaching.has(`${lat},${lon}`),
          weight: 2,
          fillColor: COLORS[level(rate)],
          fillOpacity: 0.55,
        },
      )
        .bindTooltip(`${rate.toFixed(1)} mm/h, προς ${compassName(heading)} με ${Math.round(speed)} km/h`)
        .addTo(g);
    }

    // Arrows, drawn above every cell so that no neighbouring cell covers them. By default only on
    // the cells coming towards home; with none coming, one on the heaviest cell is enough to show
    // which way the rain moves (they all move with the same wind). Small cells sit close together,
    // so an arrow is skipped when another one already starts nearby.
    const candidates = raining
      .filter((c) => c[3] > 2)
      .map((c) => ({ c, near: approaching.has(`${c[0]},${c[1]}`) }))
      .sort((a, b) => Number(b.near) - Number(a.near) || b.c[2] - a.c[2]);
    const wanted = detail ? candidates : candidates.filter((x) => x.near);
    if (!detail && wanted.length === 0 && candidates.length > 0) wanted.push(candidates[0]);
    const minGapKm = detail ? 9 : 14;
    const drawn: number[][] = [];
    for (const { c } of wanted) {
      const [lat, lon, , speed, fromDeg] = c;
      if (drawn.some((d) => flatKm(d, c) < minGapKm)) continue;
      drawn.push(c);
      const heading = (fromDeg + 180) % 360;
      const len = 7.5 + (15 * Math.min(speed, 60)) / 60;
      const tip = offset(lat, lon, heading, len);
      const left = offset(tip[0], tip[1], heading + 150, len * 0.28);
      const right = offset(tip[0], tip[1], heading - 150, len * 0.28);
      const path: L.LatLngTuple[] = [[lat, lon], tip, left, tip, right];
      L.polyline(path, { color: '#ffffff', weight: 5, opacity: 0.9, interactive: false, lineCap: 'round', lineJoin: 'round' }).addTo(g);
      L.polyline(path, { color: '#0f172a', weight: 2, interactive: false, lineCap: 'round', lineJoin: 'round' }).addTo(g);
    }

    // home
    L.circle([home.lat, home.lon], {
      radius: alertRadiusKm * 1000,
      color: '#f59e0b',
      weight: 1.5,
      dashArray: '6 4',
      fillColor: '#f59e0b',
      fillOpacity: 0.08,
      interactive: false,
    }).addTo(g);
    L.circleMarker([home.lat, home.lon], { radius: 7, color: '#ffffff', weight: 2, fillColor: '#0369a1', fillOpacity: 1 })
      .bindTooltip(homeName, { permanent: true, direction: 'top', offset: [0, -8], className: 'home-label' })
      .addTo(g);
  }, [scan, home, homeName, alertRadiusKm, threats, minRate, detail]);

  return <div ref={el} className="rain-map" role="img" aria-label="Χάρτης βροχής γύρω από την περιοχή σάρωσης" />;
}

function RainLegend() {
  return (
    <div className="legend">
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
