import type { ReactNode } from 'react';
import { initials } from '../format';

export function Spinner({ full = false }: { full?: boolean }) {
  return (
    <div className={full ? 'spinner-full' : 'spinner-inline'}>
      <div className="spinner" aria-label="Φόρτωση" />
    </div>
  );
}

export function ErrorBox({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div className="alert alert-error" role="alert">
      {error}
    </div>
  );
}

export function SuccessBox({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="alert alert-success" role="status">
      {message}
    </div>
  );
}

export function InfoBox({ children }: { children: ReactNode }) {
  return <div className="alert alert-info">{children}</div>;
}

export function WarnBox({ children }: { children: ReactNode }) {
  return <div className="alert alert-warn">{children}</div>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Toggle({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label className={`check toggle${disabled ? ' disabled' : ''}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="toggle-label">{label}</span>
        {hint && <span className="field-hint">{hint}</span>}
      </span>
    </label>
  );
}

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = hash % 360;
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, fontSize: size * 0.4, background: `hsl(${hue} 60% 45%)` }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {children}
    </div>
  );
}
