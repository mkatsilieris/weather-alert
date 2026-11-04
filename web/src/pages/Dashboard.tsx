import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { compassName } from '../geo';
import { km, minutes, mmh, relative, weatherText } from '../format';
import { pushState, type PushState } from '../push';
import type { StatusResponse } from '../types';
import { AlertItem } from '../components/AlertItem';
import { ForecastChart } from '../components/ForecastChart';
import { RadarLegend, RadarMap } from '../components/RadarMap';
import { StatusCard } from '../components/StatusCard';
import { Empty, ErrorBox, InfoBox, Spinner, WarnBox } from '../components/ui';

const REFRESH_MS = 5 * 60_000;

export default function Dashboard() {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [push, setPush] = useState<PushState | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api<StatusResponse>('/status'));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void load();
    void pushState().then(setPush);
    const timer = setInterval(load, REFRESH_MS);
    const onVisible = () => document.visibilityState === 'visible' && void load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  async function scanNow() {
    setBusy(true);
    setError(null);
    try {
      setData(await api<StatusResponse>('/scan', { method: 'POST' }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <div className="page">
        <ErrorBox error={error} />
        {!error && <Spinner full />}
      </div>
    );
  }

  const { scan, status, settings, scan_config } = data;
  const ev = status.detail.evaluation;
  const forecast = status.detail.forecast;
  const threats = ev.threats.slice(0, 8);

  return (
    <div className="page">
      <ErrorBox error={error} />
      <StatusCard data={data} onScan={scanNow} busy={busy} />

      {data.scan_failed && (
        <WarnBox>
          Η σάρωση {relative(data.scan_failed.scanned_at)} απέτυχε ({data.scan_failed.error}). Εμφανίζεται η προηγούμενη.
        </WarnBox>
      )}
      {status.detail.forecast_error && (
        <WarnBox>Η πρόγνωση για το σημείο σας δεν ήταν διαθέσιμη, η εκτίμηση βασίζεται μόνο στο πλέγμα.</WarnBox>
      )}
      {settings.notify_push && push === 'off' && (
        <InfoBox>
          Οι ειδοποιήσεις push δεν είναι ενεργές σε αυτή τη συσκευή. <Link to="/settings">Ενεργοποίηση</Link>
        </InfoBox>
      )}

      {scan ? (
        <section className="card stack">
          <div className="row between">
            <h2>Χάρτης βροχής</h2>
            <span className="muted small">
              {scan.rain_count} από {scan.point_count} σημεία με βροχή
            </span>
          </div>
          <RadarMap
            scan={scan}
            home={{ lat: settings.home_lat, lon: settings.home_lon }}
            homeName={settings.home_name}
            alertRadiusKm={settings.alert_radius_km}
            threats={ev.threats}
            minRate={scan_config.min_rate}
          />
          <RadarLegend />
        </section>
      ) : (
        <section className="card">
          <Empty title="Δεν έχει γίνει ακόμη σάρωση">
            <p className="small">Η πρώτη σάρωση γίνεται λίγο μετά την εκκίνηση. Πατήστε «Σάρωση τώρα» για να μην περιμένετε.</p>
          </Empty>
        </section>
      )}

      <section className="card stack">
        <h2>Κύτταρα βροχής</h2>
        {threats.length === 0 ? (
          <p className="muted small">Κανένα σημείο με βροχή πάνω από {scan_config.min_rate} mm/h στην περιοχή σάρωσης.</p>
        ) : (
          <ul className="list plain">
            {threats.map((t) => (
              <li key={`${t.lat},${t.lon}`} className="list-item static">
                <div className="list-main">
                  <div className="list-title">
                    {km(t.distanceKm)} {t.bearingName} · {mmh(t.rate)}
                  </div>
                  <div className="muted small">
                    κινείται προς {compassName(t.headingDeg)} με {Math.round(t.speedKmh)} km/h
                    {t.etaMin !== null
                      ? t.approaching
                        ? `, φτάνει σε ~${minutes(t.etaMin)}`
                        : `, θα έφτανε σε ${minutes(t.etaMin)}`
                      : `, δεν έρχεται (πλησιέστερα ${km(t.closestKm)})`}
                  </div>
                </div>
                {t.approaching && <span className="chip warn">έρχεται</span>}
              </li>
            ))}
          </ul>
        )}
        {ev.threats.length > threats.length && (
          <p className="muted small">… και άλλα {ev.threats.length - threats.length} σημεία με βροχή.</p>
        )}
      </section>

      {forecast && (
        <section className="card stack">
          <div className="row between">
            <h2>Πρόγνωση στο σημείο σας</h2>
            <span className="muted small">
              {forecast.current.temperature !== null && `${Math.round(forecast.current.temperature)}°, `}
              {weatherText(forecast.current.weatherCode)}
            </span>
          </div>
          <ForecastChart forecast={forecast} />
          <p className="muted small">Επόμενες 6 ώρες ανά 15 λεπτά και 12 ώρες ανά ώρα (mm και πιθανότητα). Πηγή: Open-Meteo.</p>
        </section>
      )}

      {data.last_alert && (
        <section className="card stack">
          <div className="row between">
            <h2>Τελευταία ειδοποίηση</h2>
            <Link to="/history" className="small">
              Ιστορικό
            </Link>
          </div>
          <AlertItem alert={data.last_alert} />
        </section>
      )}
    </div>
  );
}
