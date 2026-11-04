import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth';
import { Avatar } from './ui';

const tabs = [
  { to: '/', label: 'Τώρα', end: true },
  { to: '/history', label: 'Ιστορικό' },
  { to: '/settings', label: 'Ρυθμίσεις' },
];

export function Layout() {
  const { user } = useAuth();
  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand">
            <img src="/icon.svg" alt="" width={28} height={28} />
            <span>Weather Alert</span>
          </Link>
          <nav className="nav">
            {tabs.map((t) => (
              <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
                {t.label}
              </NavLink>
            ))}
          </nav>
          <Link to="/profile" className="profile-link" aria-label="Προφίλ">
            {user && <Avatar name={user.name} size={32} />}
          </Link>
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
