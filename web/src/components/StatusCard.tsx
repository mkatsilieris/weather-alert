import { km, minutes, mmh, relative, STATUS_META, timeShort } from '../format';
import type { StatusResponse } from '../types';

interface Props {
  data: StatusResponse;
  onScan: () => void;
  busy: boolean;
}

export function StatusCard({ data, onScan, busy }: Props) {
  const { status, settings, scan, next_scan_at, scan_config } = data;
  const ev = status.detail.evaluation;
  const meta = STATUS_META[ev.status];

  // The ETA was counted from the moment of the evaluation; show what is left of it now.
  const arrival = ev.etaMin !== null ? new Date(new Date(status.evaluated_at).getTime() + ev.etaMin * 60_000) : null;
  const left = arrival ? Math.max(0, (arrival.getTime() - Date.now()) / 60_000) : null;
  const first = ev.threats[0];

  let detail: string;
  switch (ev.status) {
    case 'raining':
      detail = `Βροχή ${mmh(ev.rateNow)} στην περιοχή «${settings.home_name}».`;
      break;
    case 'approaching':
      detail =
        left !== null && left <= 3
          ? `Από ${ev.fromName}, ${km(ev.distanceKm ?? 0)} μακριά, φτάνει από στιγμή σε στιγμή.`
          : `Σε ~${minutes(left ?? 0)} (${timeShort(arrival!)}) από ${ev.fromName}: ${km(ev.distanceKm ?? 0)} μακριά, κινείται με ${Math.round(first?.speedKmh ?? 0)} km/h.`;
      break;
    case 'forecast':
      detail = `Η πρόγνωση δείχνει βροχή γύρω στις ${timeShort(arrival!)} (σε ~${minutes(left ?? 0)}). Δεν κινείται κάποιο κύτταρο βροχής προς εσάς.`;
      break;
    case 'nearby':
      detail = `Πλησιέστερη βροχή ${km(ev.distanceKm ?? 0)} ${ev.fromName}, δεν κατευθύνεται προς εσάς. ${ev.rainCells} σημεί${ev.rainCells === 1 ? 'ο' : 'α'} με βροχή στην περιοχή.`;
      break;
    default:
      detail = `Καμία βροχή σε ακτίνα ${Math.round(scan_config.radius_km)} km γύρω από το κέντρο της σάρωσης.`;
  }

  return (
    <section className={`card status-card status-${ev.status}`}>
      <div className="status-head">
        <span className="status-icon" aria-hidden="true">
          {meta.icon}
        </span>
        <div>
          <div className="status-label">{meta.label}</div>
          <div className="status-detail">{detail}</div>
        </div>
      </div>
      <div className="status-meta muted small">
        <span>📍 {settings.home_name}</span>
        <span>
          Σάρωση {scan ? relative(scan.scanned_at) : '—'}
          {next_scan_at ? `, επόμενη ${relative(next_scan_at)}` : ''}
        </span>
      </div>
      <div className="status-actions">
        <button type="button" className="btn btn-small" onClick={onScan} disabled={busy || data.scan_in_progress}>
          {busy || data.scan_in_progress ? 'Σάρωση…' : 'Σάρωση τώρα'}
        </button>
      </div>
    </section>
  );
}
