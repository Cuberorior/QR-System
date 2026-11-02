import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { LayoutDashboard, Building2, Users, ClipboardCheck, UserRoundCheck, QrCode, History, Settings, LogOut, Menu, X, ChevronRight } from 'lucide-react';
import Brand from '../common/Brand';
import { useAuth } from '../../context/AuthContext';
import { verificationApi } from '../../services/api';
import './admin-shell.css';

const links = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin/sites', label: 'Construction Site', icon: Building2 },
  { to: '/admin/employees', label: 'Employees', icon: Users },
  { to: '/admin/attendance', label: 'Attendance', icon: ClipboardCheck },
  { to: '/admin/visitors', label: 'Visitors', icon: UserRoundCheck },
  { to: '/admin/qr-codes', label: 'QR Codes', icon: QrCode },
  { to: '/admin/activity-logs', label: 'Activity Logs', icon: History },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
];
export default function AdminLayout() {
  const [open, setOpen] = useState(false);
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const menuButton = useRef(null);
  const sidebar = useRef(null);
  const siteQuery = useQuery({ queryKey: ['admin-shell-site', user?.id], queryFn: async () => (await verificationApi.listSites()).data.sites?.[0] ?? null, retry: 1 });
  const site = siteQuery.data;
  const close = () => { setOpen(false); menuButton.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    sidebar.current?.querySelector('button')?.focus();
    const handleKey = event => {
      if (event.key === 'Escape') close();
      if (event.key === 'Tab') {
        const nodes = [...sidebar.current.querySelectorAll('a, button')].filter(node => node.getClientRects().length);
        const first = nodes[0], last = nodes.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', handleKey);
    const media = window.matchMedia('(min-width: 901px)');
    const onResize = () => { if (media.matches) setOpen(false); };
    media.addEventListener('change', onResize);
    return () => { document.body.style.overflow = previous; document.removeEventListener('keydown', handleKey); media.removeEventListener('change', onResize); };
  }, [open]);
  useEffect(() => {
    if (!user?.id) return;
    const storageKey = `sitepass:screen-lock-minutes:${user.id}`;
    let timer;
    const resetTimer = () => {
      window.clearTimeout(timer);
      const minutes = Number(localStorage.getItem(storageKey) ?? '15');
      if (!Number.isFinite(minutes) || minutes <= 0) return;
      timer = window.setTimeout(() => { logout(); nav('/admin/login', { replace: true, state: { reason: 'screen-lock' } }); }, minutes * 60 * 1000);
    };
    const activityEvents = ['pointerdown', 'keydown', 'touchstart', 'mousemove'];
    activityEvents.forEach(event => window.addEventListener(event, resetTimer, { passive: true }));
    window.addEventListener('sitepass:screen-lock-updated', resetTimer);
    resetTimer();
    return () => { window.clearTimeout(timer); activityEvents.forEach(event => window.removeEventListener(event, resetTimer)); window.removeEventListener('sitepass:screen-lock-updated', resetTimer); };
  }, [user?.id, logout, nav]);
  const name = user?.fullName || 'Administrator';
  const initials = name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  return <div className="admin-shell premium-shell">
    <a className="skip-navigation" href="#admin-content">Skip to content</a>
    {open && <button className="sidebar-backdrop" onClick={close} aria-label="Close navigation" tabIndex={-1} />}
    <aside id="admin-navigation" ref={sidebar} className={`sidebar ${open ? 'open' : ''}`} aria-label="Main navigation">
      <div className="sidebar-brand"><Brand light /><button className="mobile-menu icon-button" aria-label="Close navigation" onClick={close}><X size={20}/></button></div>
      <p className="sidebar-caption">SITE MANAGEMENT</p>
      <nav>{links.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} onClick={() => setOpen(false)} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><Icon size={19}/><span>{label}</span></NavLink>)}</nav>
      <div className="sidebar-bottom"><div className="sidebar-site"><div className="sidebar-site-icon"><Building2 size={19}/></div><div><p className="sidebar-caption">YOUR CONSTRUCTION SITE</p><strong>{siteQuery.isPending ? 'Loading site…' : siteQuery.isError ? 'Site unavailable' : site?.name || 'No site configured'}</strong>{site && <span className={`site-presence ${site.isActive ? 'is-active' : ''}`}><i/>{site.isActive ? 'Active site' : 'Inactive site'}</span>}</div></div><button className="nav-item logout-button" onClick={() => { logout(); nav('/admin/login'); }}><LogOut size={18}/>Log out</button><p className="sidebar-footnote">SITEPASS · Site access, simplified.</p></div>
    </aside>
    <section className="admin-main" inert={open ? '' : undefined}>
      <header className="admin-topbar"><div className="topbar-location"><button ref={menuButton} className="mobile-menu icon-button" aria-label="Open navigation" aria-expanded={open} aria-controls="admin-navigation" onClick={() => setOpen(true)}><Menu size={21}/></button><span className="topbar-workspace">Workspace</span><ChevronRight size={14}/><strong>{links.find(item => location.pathname.startsWith(item.to))?.label || 'Administration'}</strong></div><div className="admin-profile"><div><strong>{name}</strong><span>{user?.role === 'ADMIN' ? 'Administrator' : user?.role || 'Administrator'}</span></div><div className="profile-initials" aria-hidden="true">{initials}</div></div></header>
      <div id="admin-content" tabIndex={-1}><Outlet/></div>
    </section>
  </div>;
}
