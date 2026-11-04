import { useEffect, useState } from 'react';
import { api, errorMessage } from '../api';
import { dateTime } from '../format';
import type { Alert, ScanSummary } from '../types';
import { AlertItem } from '../components/AlertItem';
import { Empty, ErrorBox, Spinner } from '../components/ui';

export default function History() {
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [scans, setScans] = useState<ScanSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api<{ alerts: Alert[] }>('/alerts?limit=100'), api<{ scans: ScanSummary[] }>('/scans?limit=48')])
      .then(([a, s]) => {
        setAlerts(a.alerts);
        setScans(s.scans);
      })
      .catch((err) => setError(errorMessage(err)));
  }, []);

  if (error) return <ErrorBox error={error} />;
  if (!alerts || !scans) return <Spinner full />;

  return (
    <div className="page">
      <h1>Ιστορικό</h1>
      <section className="card stack">
        <h2>Ειδοποιήσεις</h2>
        {alerts.length === 0 ? (
          <Empty title="Καμία ειδοποίηση ακόμη">
            <p className="small">Θα εμφανιστούν εδώ μόλις η βροχή πλησιάσει την τοποθεσία σας.</p>
          </Empty>
        ) : (
          <ul className="list plain">
            {alerts.map((a) => (
              <li key={a.id} className="list-item static">
                <div className="list-main">
                  <AlertItem alert={a} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="card stack">
        <h2>Σαρώσεις</h2>
        {scans.length === 0 ? (
          <p className="muted small">Δεν έχει γίνει ακόμη σάρωση.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Πότε</th>
                <th className="num">Σημεία με βροχή</th>
                <th className="num">Μέγ. ένταση</th>
                <th className="num">Διάρκεια</th>
              </tr>
            </thead>
            <tbody>
              {scans.map((s) => (
                <tr key={s.id}>
                  <td>
                    {dateTime(s.scanned_at)}
                    {s.reason === 'manual' && <span className="chip small">χειροκίνητη</span>}
                    {s.error && <div className="neg small">{s.error}</div>}
                  </td>
                  <td className="num">{s.error ? '—' : s.rain_count}</td>
                  <td className="num">{s.error ? '—' : `${s.max_rate.toFixed(1)} mm/h`}</td>
                  <td className="num">{(s.duration_ms / 1000).toFixed(1)} s</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
