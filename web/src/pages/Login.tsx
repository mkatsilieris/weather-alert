import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { useAuth } from '../auth';
import type { User } from '../types';
import { ErrorBox, Field } from '../components/ui';
import { AuthShell } from './AuthShell';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ token: string; user: User }>('/auth/login', { method: 'POST', body: { email, password } });
      login(r.token, r.user);
      navigate(from, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Σύνδεση" subtitle="Για να μάθετε πρώτοι ότι έρχεται βροχή">
      <form onSubmit={submit} className="stack">
        <ErrorBox error={error} />
        <Field label="Email">
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Κωδικός">
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Σύνδεση…' : 'Σύνδεση'}
        </button>
        <div className="auth-links">
          <Link to="/forgot">Ξέχασα τον κωδικό μου</Link>
          <span>
            Δεν έχετε λογαριασμό; <Link to="/signup">Εγγραφή</Link>
          </span>
        </div>
      </form>
    </AuthShell>
  );
}
