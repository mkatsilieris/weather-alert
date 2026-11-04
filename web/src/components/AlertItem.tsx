import { dateTime, STATUS_META } from '../format';
import type { Alert } from '../types';

const SUPPRESSED: Record<NonNullable<Alert['suppressed']>, string> = {
  quiet: 'ώρες ησυχίας',
  cooldown: 'πολύ κοντά στην προηγούμενη',
  disabled: 'ειδοποιήσεις ανενεργές',
};

export function AlertItem({ alert }: { alert: Alert }) {
  const meta = STATUS_META[alert.status];
  return (
    <div className="alert-item">
      <div className="row between">
        <span className="alert-title">
          {meta.icon} {alert.title}
        </span>
        <span className="muted small">{dateTime(alert.created_at)}</span>
      </div>
      <div className="small">{alert.body}</div>
      <div className="alert-badges">
        {alert.suppressed ? (
          <span className="chip">δεν στάλθηκε: {SUPPRESSED[alert.suppressed]}</span>
        ) : (
          <>
            {alert.push_sent > 0 && <span className="chip">push ×{alert.push_sent}</span>}
            {alert.email_sent && <span className="chip">email</span>}
            {alert.push_sent === 0 && !alert.email_sent && <span className="chip">καμία συσκευή</span>}
          </>
        )}
      </div>
    </div>
  );
}
