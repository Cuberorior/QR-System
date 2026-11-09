import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { LayoutDashboard, Building2, Users, ClipboardCheck, UserRoundCheck, QrCode, History, Settings, LogOut, Menu, X, ChevronRight } from 'lucide-react';
import Brand from '../common/Brand';
import { useAuth } from '../../context/AuthContext';
import { verificationApi } from '../../services/api';
import appzMakersLogo from '../../assets/APPZ New Logo.png';
import './admin-shell.css';

const links = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin/sites', label: 'Construction Sites', icon: Building2 },
  { to: '/admin/employees', label: 'Employees', icon: Users },
  { to: '/admin/attendance', label: 'Attendance', icon: ClipboardCheck },
  { to: '/admin/visitors', label: 'Visitors', icon: UserRoundCheck },
  { to: '/admin/qr-codes', label: 'QR Codes', icon: QrCode },
  { to: '/admin/activity-logs', label: 'Activity Logs', icon: History },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
];

function AppZMakersCredit() {
  const [isPopoverOpen, setPopoverOpen] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState(null);
  const creditRef = useRef(null);
  const popoverRef = useRef(null);
  const closeTimer = useRef(null);

  const showPopover = () => {
    window.clearTimeout(closeTimer.current);
    setPopoverOpen(true);
  };
  const hidePopover = () => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setPopoverOpen(false), 180);
  };

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);
  useEffect(() => {
    if (!isPopoverOpen) {
      setPopoverPosition(null);
      return undefined;
    }

    const updatePosition = () => {
      const credit = creditRef.current?.getBoundingClientRect();
      const sidebar = creditRef.current?.closest('.sidebar')?.getBoundingClientRect();
      if (!credit || !sidebar) return;

      const edge = 12;
      const width = Math.min(250, sidebar.width - edge * 2, window.innerWidth - edge * 2);
      const height = popoverRef.current?.offsetHeight || 205;
      const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), Math.max(minimum, maximum));

      setPopoverPosition({
        placement: 'above',
        width,
        left: clamp(sidebar.left + (sidebar.width - width) / 2, edge, window.innerWidth - width - edge),
        top: clamp(credit.top - height - 12, edge, window.innerHeight - height - edge),
      });
    };

    const frame = window.requestAnimationFrame(updatePosition);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isPopoverOpen]);

  const popover = isPopoverOpen && createPortal(
    <aside
      ref={popoverRef}
      className={`appz-makers-popover appz-makers-popover-${popoverPosition?.placement || 'above'}`}
      style={{ left: popoverPosition?.left || 0, top: popoverPosition?.top || 0, width: popoverPosition?.width || 0, visibility: popoverPosition ? 'visible' : 'hidden' }}
      aria-label="About AppZ Makers"
      onMouseEnter={showPopover}
      onMouseLeave={hidePopover}
      onFocus={showPopover}
      onBlur={hidePopover}
    >
      <img className="appz-makers-logo" src={appzMakersLogo} alt="AppZ Makers" />
      <p>Developed by the<br />AppZ Makers Team</p>
      <a href="https://appzmake.com" target="_blank" rel="noreferrer">https://appzmake.com</a>
      <span className="appz-makers-website-note">Click here to visit our official website.</span>
    </aside>,
    document.body,
  );

  return <div ref={creditRef} className="sidebar-credit" tabIndex={0} aria-label="Developed by AppZ Makers. Visit the AppZ Makers website." onMouseEnter={showPopover} onMouseLeave={hidePopover} onFocus={showPopover} onBlur={hidePopover}>
    <span>Developed by AppZ Makers</span>
    {popover}
  </div>;
}

export default function AdminLayout() {
  const [open, setOpen] = useState(false);
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const menuButton = useRef(null);
  const sidebar = useRef(null);
  const siteQuery = useQuery({ queryKey: ['admin-shell-site', user?.id], queryFn: async () => (await verificationApi.listSites()).data.sites || [], retry: 1 });
  const sites = siteQuery.data || [];
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
      <div className="sidebar-bottom"><div className="sidebar-site"><div className="sidebar-site-icon"><Building2 size={19}/></div><div><p className="sidebar-caption">CONSTRUCTION SITES</p><strong>{siteQuery.isPending ? 'Loading sites…' : siteQuery.isError ? 'Sites unavailable' : `${sites.length} configured`}</strong><span className={`site-presence ${sites.some(site => site.isActive) ? 'is-active' : ''}`}><i/>{sites.filter(site => site.isActive).length} active site{sites.filter(site => site.isActive).length === 1 ? '' : 's'}</span></div></div><button className="nav-item logout-button" onClick={() => { logout(); nav('/admin/login'); }}><LogOut size={18}/>Log out</button><AppZMakersCredit /></div>
    </aside>
    <section className="admin-main" inert={open ? '' : undefined}>
      <header className="admin-topbar"><div className="topbar-location"><button ref={menuButton} className="mobile-menu icon-button" aria-label="Open navigation" aria-expanded={open} aria-controls="admin-navigation" onClick={() => setOpen(true)}><Menu size={21}/></button><span className="topbar-workspace">Workspace</span><ChevronRight size={14}/><strong>{links.find(item => location.pathname.startsWith(item.to))?.label || 'Administration'}</strong></div><div className="admin-profile"><div><strong>{name}</strong><span>{user?.role === 'ADMIN' ? 'Administrator' : user?.role || 'Administrator'}</span></div><div className="profile-initials" aria-hidden="true">{initials}</div></div></header>
      <div id="admin-content" tabIndex={-1}><Outlet/></div>
    </section>
  </div>;
}
