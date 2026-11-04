import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { ErrorBox, Field, SuccessBox } from '../components/ui';
import { AuthShell } from './AuthShell';

export default function Reset() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError('Οι κωδικοί δεν ταιριάζουν');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api('/auth/reset', { method: 'POST', body: { token, password } });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <AuthShell title="Μη έγκυρος σύνδεσμος">
        <p className="muted">Ο σύνδεσμος επαναφοράς δεν είναι πλήρης.</p>
        <Link className="btn btn-block" to="/forgot">
          Ζητήστε νέο σύνδεσμο
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Νέος κωδικός">
      {done ? (
        <div className="stack">
          <SuccessBox message="Ο κωδικός άλλαξε. Μπορείτε να συνδεθείτε." />
          <Link className="btn btn-primary btn-block" to="/login">
            Σύνδεση
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="stack">
          <ErrorBox error={error} />
          <Field label="Νέος κωδικός" hint="Τουλάχιστον 8 χαρακτήρες">
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Field label="Επιβεβαίωση κωδικού">
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>
          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Αποθήκευση…' : 'Αποθήκευση κωδικού'}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
