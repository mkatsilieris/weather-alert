import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { useAuth } from '../auth';
import type { User } from '../types';
import { ErrorBox, Field } from '../components/ui';
import { AuthShell } from './AuthShell';

export default function Signup() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
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
      const r = await api<{ token: string; user: User }>('/auth/signup', {
        method: 'POST',
        body: { name, email, password },
      });
      login(r.token, r.user);
      navigate('/', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Εγγραφή" subtitle="Δημιουργήστε λογαριασμό με το email σας">
      <form onSubmit={submit} className="stack">
        <ErrorBox error={error} />
        <Field label="Όνομα">
          <input autoComplete="name" required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Email">
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Κωδικός" hint="Τουλάχιστον 8 χαρακτήρες">
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
          {busy ? 'Δημιουργία…' : 'Δημιουργία λογαριασμού'}
        </button>
        <div className="auth-links">
          <span>
            Έχετε ήδη λογαριασμό; <Link to="/login">Σύνδεση</Link>
          </span>
        </div>
      </form>
    </AuthShell>
  );
}
