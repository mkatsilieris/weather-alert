import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { ErrorBox, Field, SuccessBox } from '../components/ui';
import { AuthShell } from './AuthShell';

export default function Forgot() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/auth/forgot', { method: 'POST', body: { email } });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Επαναφορά κωδικού" subtitle="Θα σας στείλουμε σύνδεσμο επαναφοράς στο email σας">
      {done ? (
        <div className="stack">
          <SuccessBox message="Αν υπάρχει λογαριασμός με αυτό το email, θα λάβετε σύνδεσμο επαναφοράς σε λίγα λεπτά." />
          <p className="muted small">
            Αν ο διακομιστής δεν έχει ρυθμισμένο email (SMTP), ο σύνδεσμος εμφανίζεται στα logs του API.
          </p>
          <Link className="btn btn-block" to="/login">
            Πίσω στη σύνδεση
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="stack">
          <ErrorBox error={error} />
          <Field label="Email">
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Αποστολή…' : 'Αποστολή συνδέσμου'}
          </button>
          <div className="auth-links">
            <Link to="/login">Πίσω στη σύνδεση</Link>
          </div>
        </form>
      )}
    </AuthShell>
  );
}
