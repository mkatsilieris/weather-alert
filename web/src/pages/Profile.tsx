import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { useAuth } from '../auth';
import type { User } from '../types';
import { Avatar, ErrorBox, Field, SuccessBox } from '../components/ui';

export default function Profile() {
  const { user, setUser, logout, viaAccess } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState(user?.name ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function saveName(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const r = await api<{ user: User }>('/auth/me', { method: 'PATCH', body: { name } });
      setUser(r.user);
      setOk('Το όνομα αποθηκεύτηκε');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      await api('/auth/me', { method: 'PATCH', body: { currentPassword, newPassword } });
      setCurrentPassword('');
      setNewPassword('');
      setOk('Ο κωδικός άλλαξε');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!user) return null;

  return (
    <div className="page narrow">
      <div className="profile-head">
        <Avatar name={user.name} size={64} />
        <div>
          <h1>{user.name}</h1>
          <div className="muted">{user.email}</div>
        </div>
      </div>
      <ErrorBox error={error} />
      <SuccessBox message={ok} />

      <section className="card stack">
        <h2>Όνομα</h2>
        <form onSubmit={saveName} className="stack">
          <Field label="Όνομα εμφάνισης">
            <input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <button className="btn btn-primary" disabled={busy || name === user.name}>
            Αποθήκευση
          </button>
        </form>
      </section>

      {viaAccess ? (
        <section className="card stack">
          <h2>Σύνδεση</h2>
          <p className="muted">
            Συνδέεστε με κωδικό μίας χρήσης στο email σας μέσω Cloudflare. Δεν υπάρχει κωδικός εφαρμογής για να αλλάξετε.
          </p>
        </section>
      ) : (
        <section className="card stack">
          <h2>Αλλαγή κωδικού</h2>
          <form onSubmit={savePassword} className="stack">
            <Field label="Τρέχων κωδικός">
              <input type="password" autoComplete="current-password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
            </Field>
            <Field label="Νέος κωδικός" hint="Τουλάχιστον 8 χαρακτήρες">
              <input type="password" autoComplete="new-password" required minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </Field>
            <button className="btn btn-primary" disabled={busy}>
              Αλλαγή κωδικού
            </button>
          </form>
        </section>
      )}

      <button
        className="btn btn-danger btn-block"
        onClick={() => {
          logout();
          navigate('/login');
        }}
      >
        Αποσύνδεση
      </button>
    </div>
  );
}
