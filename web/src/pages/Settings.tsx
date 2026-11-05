import { useEffect, useState, type FormEvent } from 'react';
import { api, errorMessage } from '../api';
import { useAuth } from '../auth';
import { haversineKm } from '../geo';
import { minutes } from '../format';
import { disablePush, enablePush, pushState, type PushState } from '../push';
import type { GeoResult, Settings as SettingsRow, SettingsResponse } from '../types';
import { ErrorBox, Field, Spinner, SuccessBox, Toggle } from '../components/ui';

const HORIZONS = [30, 60, 90, 120, 180, 240, 360];
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const round4 = (n: number) => Math.round(n * 1e4) / 1e4;

export default function Settings() {
  const { user } = useAuth();
  const [resp, setResp] = useState<SettingsResponse | null>(null);
  const [form, setForm] = useState<SettingsRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeoResult[]>([]);
  const [searching, setSearching] = useState(false);

  const [push, setPush] = useState<PushState>('off');
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMsg, setPushMsg] = useState<string | null>(null);

  useEffect(() => {
    api<SettingsResponse>('/settings')
      .then((r) => {
        setResp(r);
        setForm(r.settings);
      })
      .catch((err) => setError(errorMessage(err)));
    void pushState().then(setPush);
  }, []);

  // Place search, a moment after typing stops.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await api<{ results: GeoResult[] }>(`/settings/geocode?q=${encodeURIComponent(q)}`);
        setResults(r.results);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [query]);

  const patch = (p: Partial<SettingsRow>) => setForm((f) => (f ? { ...f, ...p } : f));

  function pick(r: GeoResult) {
    const region = r.region.split(',')[0]?.trim();
    patch({ home_name: region ? `${r.name}, ${region}` : r.name, home_lat: round4(r.lat), home_lon: round4(r.lon) });
    setResults([]);
    setQuery('');
  }

  function useMyLocation() {
    if (!('geolocation' in navigator)) {
      setError('Ο browser δεν δίνει τη θέση σας');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        patch({ home_lat: round4(pos.coords.latitude), home_lon: round4(pos.coords.longitude) });
        setOk('Η θέση σας συμπληρώθηκε, δώστε της όνομα και αποθηκεύστε');
      },
      (err) => setError(`Δεν βρέθηκε η θέση σας: ${err.message}`),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const { user_id: _u, updated_at: _t, ...body } = form;
      const r = await api<SettingsResponse>('/settings', { method: 'PUT', body });
      setResp(r);
      setForm(r.settings);
      setOk('Οι ρυθμίσεις αποθηκεύτηκαν');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function withPush(fn: () => Promise<string>) {
    setPushBusy(true);
    setError(null);
    setPushMsg(null);
    try {
      setPushMsg(await fn());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPush(await pushState());
      setPushBusy(false);
    }
  }

  if (error && !form) return <ErrorBox error={error} />;
  if (!resp || !form) return <Spinner full />;

  const distance = haversineKm(resp.scan.center, { lat: form.home_lat, lon: form.home_lon });
  const outside = distance > resp.scan.radius_km;

  return (
    <div className="page narrow">
      <h1>Ρυθμίσεις</h1>
      <ErrorBox error={error} />
      <SuccessBox message={ok} />

      <form onSubmit={save} className="stack">
        <section className="card stack">
          <h2>Τοποθεσία που παρακολουθώ</h2>
          <Field label="Αναζήτηση περιοχής">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="π.χ. Νέος Κόσμος, Γλυφάδα, Κηφισιά"
              autoComplete="off"
            />
          </Field>
          {searching && <p className="muted small">Αναζήτηση…</p>}
          {results.length > 0 && (
            <ul className="geo-results">
              {results.map((r) => (
                <li key={`${r.lat},${r.lon}`}>
                  <button type="button" className="geo-result" onClick={() => pick(r)} disabled={!r.inside}>
                    <span>{r.name}</span>
                    <span className="muted small">
                      {r.region} · {r.distance_km} km από το κέντρο{!r.inside && ' · εκτός περιοχής σάρωσης'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="btn" onClick={useMyLocation}>
            📍 Χρήση της θέσης μου
          </button>
          <Field label="Όνομα τοποθεσίας">
            <input required maxLength={100} value={form.home_name} onChange={(e) => patch({ home_name: e.target.value })} />
          </Field>
          <div className="grid-2">
            <Field label="Γεωγρ. πλάτος (lat)">
              <input type="number" step="0.0001" min={-90} max={90} value={form.home_lat} onChange={(e) => patch({ home_lat: Number(e.target.value) })} />
            </Field>
            <Field label="Γεωγρ. μήκος (lon)">
              <input type="number" step="0.0001" min={-180} max={180} value={form.home_lon} onChange={(e) => patch({ home_lon: Number(e.target.value) })} />
            </Field>
          </div>
          <p className={`small ${outside ? 'neg' : 'muted'}`}>
            {Math.round(distance)} km από το κέντρο της σάρωσης (παρακολουθούνται {resp.scan.radius_km} km γύρω του, ανά {resp.scan.spacing_km} km
            {resp.scan.dense_km && resp.scan.fine_km && resp.scan.fine_km < resp.scan.spacing_km
              ? ` και ανά ${resp.scan.fine_km} km ως ${resp.scan.dense_km} km από το κέντρο`
              : ''}
            , κάθε{' '}
            {minutes(resp.scan.interval_min)}).
          </p>
        </section>

        <section className="card stack">
          <h2>Πότε μετράει ως «έρχεται»</h2>
          <Field
            label={`Ακτίνα ειδοποίησης: ${form.alert_radius_km} km`}
            hint="Βροχή που θα περάσει τόσο κοντά στην τοποθεσία σας θεωρείται ότι έρχεται προς εσάς."
          >
            <input type="range" min={1} max={50} step={1} value={form.alert_radius_km} onChange={(e) => patch({ alert_radius_km: Number(e.target.value) })} />
          </Field>
          <Field label="Πόσο νωρίτερα" hint="Ειδοποίηση όταν η βροχή θα φτάσει μέσα σε αυτό το διάστημα.">
            <select value={form.horizon_min} onChange={(e) => patch({ horizon_min: Number(e.target.value) })}>
              {HORIZONS.map((m) => (
                <option key={m} value={m}>
                  {minutes(m)}
                </option>
              ))}
            </select>
          </Field>
        </section>

        <section className="card stack">
          <h2>Ειδοποιήσεις</h2>
          <div className="push-box stack">
            <div className="toggle-label">Push σε αυτή τη συσκευή</div>
            {push === 'unsupported' && (
              <p className="muted small">
                Ο browser αυτός δεν υποστηρίζει ειδοποιήσεις push. Σε iPhone/iPad προσθέστε πρώτα την εφαρμογή στην αρχική οθόνη
                (Κοινοποίηση → «Προσθήκη στην αρχική οθόνη») και ανοίξτε την από εκεί.
              </p>
            )}
            {push === 'denied' && (
              <p className="muted small">Έχετε απορρίψει τις ειδοποιήσεις για αυτή τη σελίδα. Επιτρέψτε τις από τις ρυθμίσεις του browser.</p>
            )}
            {push === 'off' && (
              <button type="button" className="btn btn-primary" disabled={pushBusy} onClick={() => withPush(async () => (await enablePush(), 'Οι ειδοποιήσεις ενεργοποιήθηκαν σε αυτή τη συσκευή'))}>
                Ενεργοποίηση σε αυτή τη συσκευή
              </button>
            )}
            {push === 'on' && (
              <div className="row gap wrap">
                <span className="chip">✓ ενεργές εδώ</span>
                <button
                  type="button"
                  className="btn btn-small"
                  disabled={pushBusy}
                  onClick={() =>
                    withPush(async () => {
                      const r = await api<{ sent: number; failed: number }>('/push/test', { method: 'POST' });
                      return r.sent > 0 ? `Στάλθηκε δοκιμαστική ειδοποίηση σε ${r.sent} συσκευ${r.sent === 1 ? 'ή' : 'ές'}` : 'Δεν στάλθηκε σε καμία συσκευή';
                    })
                  }
                >
                  Δοκιμή
                </button>
                <button type="button" className="btn btn-small" disabled={pushBusy} onClick={() => withPush(async () => (await disablePush(), 'Οι ειδοποιήσεις απενεργοποιήθηκαν σε αυτή τη συσκευή'))}>
                  Απενεργοποίηση
                </button>
              </div>
            )}
            {pushMsg && <p className="small pos">{pushMsg}</p>}
          </div>
          <Toggle label="Push στις συσκευές μου" hint="Σε όλες τις συσκευές όπου ενεργοποιήσατε τις ειδοποιήσεις." checked={form.notify_push} onChange={(v) => patch({ notify_push: v })} />
          <Toggle
            label="Email"
            hint={resp.mail_configured ? `Στο ${user?.email ?? 'email σας'}` : 'Δεν έχει ρυθμιστεί SMTP στον server (βλ. README).'}
            checked={form.notify_email}
            disabled={!resp.mail_configured}
            onChange={(v) => patch({ notify_email: v })}
          />
          <Toggle
            label="Και όταν μόνο η πρόγνωση δείχνει βροχή"
            hint="Χωρίς κύτταρο βροχής που να έρχεται, μόνο με βάση το μοντέλο. Περισσότερες ειδοποιήσεις, λιγότερο σίγουρες."
            checked={form.notify_forecast}
            onChange={(v) => patch({ notify_forecast: v })}
          />
          <Toggle label="Ενημέρωση όταν η βροχή απομακρυνθεί" checked={form.notify_clear} onChange={(v) => patch({ notify_clear: v })} />
          <div className="grid-2">
            <Field label="Ησυχία από" hint="Καμία ειδοποίηση μέσα σε αυτές τις ώρες.">
              <select value={form.quiet_from ?? ''} onChange={(e) => patch({ quiet_from: e.target.value === '' ? null : Number(e.target.value) })}>
                <option value="">— ποτέ —</option>
                {HOURS.map((h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, '0')}:00
                  </option>
                ))}
              </select>
            </Field>
            <Field label="έως">
              <select value={form.quiet_to ?? ''} onChange={(e) => patch({ quiet_to: e.target.value === '' ? null : Number(e.target.value) })}>
                <option value="">—</option>
                {HOURS.map((h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, '0')}:00
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </section>

        <button className="btn btn-primary btn-block" disabled={busy || outside}>
          {busy ? 'Αποθήκευση…' : 'Αποθήκευση'}
        </button>
      </form>
    </div>
  );
}
