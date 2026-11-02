import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowUpRight, ArrowRight, Building2, CalendarDays, Clock3, LogIn, LogOut, RefreshCw, Users, UserRoundCheck, AlertCircle, Activity } from 'lucide-react';
import { apiErrorMessage, verificationApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import constructionHero from '../../assets/sitepass-construction-hero.png';
import './dashboard.css';

const COLORS = { blue: '#4589e8', orange: '#f08b4b', green: '#38a781', purple: '#9473db' };
const dateLabel = value => new Date(`${value}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
function Timestamp({ value, empty, timezone }) {
  if (!value) return <span className="muted-value">{empty}</span>;
  const date = new Date(value);
  return <><span>{date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: timezone })}</span><small>{date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: timezone })}</small></>;
}
function Status({ status }) {
  const labels = { OPEN: 'On site', CLOSED: 'Checked out', CHECKED_IN: 'On site', CHECKED_OUT: 'Completed', REGISTERED: 'Awaiting entry', CANCELLED: 'Cancelled', REVOKED: 'Revoked', EXPIRED: 'Expired' };
  return <span className={`dashboard-status status-${status.toLowerCase()}`}><i/>{labels[status] || status}</span>;
}
function Empty({ children = 'No activity recorded yet.' }) {
  return <div className="dashboard-empty"><Activity size={24}/><p>{children}</p><small>Verified activity will appear here.</small></div>;
}
function DonutCard({ title, subtitle, items, totalLabel, note, className = '' }) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  return <section className={`dashboard-card donut-card ${className}${total ? '' : ' is-empty'}`}><div className="chart-heading"><h2>{title}</h2><p>{subtitle}</p></div>
    {total ? <div className="donut-plot" role="img" aria-label={`${title}: ${items.map(item => `${item.name} ${item.value}`).join(', ')}`}><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={items} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={78} paddingAngle={items.filter(item => item.value > 0).length > 1 ? 4 : 0} stroke="none" isAnimationActive={false}>{items.map(item => <Cell key={item.name} fill={item.color}/>)}</Pie><Tooltip formatter={(value, name) => [`${value} (${Math.round(value / total * 100)}%)`, name]} contentStyle={{ borderRadius: 10, border: '1px solid #e6ebf2', fontSize: 12 }}/></PieChart></ResponsiveContainer><div className="donut-center"><strong>{total.toLocaleString()}</strong><span>{totalLabel}</span></div></div> : <Empty>No sessions to display.</Empty>}
    <ul className="chart-legend">{items.map(item => <li key={item.name}><span className="legend-dot" style={{ background: item.color }}/><span>{item.name}</span><b>{item.value.toLocaleString()}</b><small>{total ? Math.round(item.value / total * 100) : 0}%</small></li>)}</ul><p className="chart-note">{note}</p>
  </section>;
}
function ActivityTable({ title, description, to, columns, children, empty }) {
  return <section className="dashboard-card activity-card"><div className="activity-heading"><div><h2>{title}</h2><p>{description}</p></div><Link to={to}>View all <ArrowRight size={14}/></Link></div>{empty ? <Empty/> : <div className="dashboard-table-scroll" tabIndex={0} role="region" aria-label={`${title} table`}><table><thead><tr>{columns.map(column => <th key={column} scope="col">{column}</th>)}</tr></thead><tbody>{children}</tbody></table></div>}</section>;
}
function DashboardSkeleton() {
  return <div className="dashboard-loading" role="status" aria-label="Loading dashboard"><span className="sr-only">Loading dashboard data…</span><div className="dashboard-skeleton skeleton-banner"/><div className="dashboard-kpis">{[0, 1, 2, 3].map(key => <div key={key} className="dashboard-skeleton skeleton-kpi"/>)}</div><div className="dashboard-charts">{[0, 1, 2].map(key => <div key={key} className="dashboard-skeleton skeleton-chart"/>)}</div><div className="dashboard-tables">{[0, 1].map(key => <div key={key} className="dashboard-skeleton skeleton-table"/>)}</div></div>;
}
export default function DashboardReal() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data, error, isPending, isFetching, refetch } = useQuery({ queryKey: ['admin-dashboard', user?.id], queryFn: async () => (await verificationApi.getDashboard()).data, retry: 1 });
  const refresh = () => { refetch(); queryClient.invalidateQueries({ queryKey: ['admin-shell-site'] }); };
  const timezone = data?.timezone || 'UTC';
  const stats = data?.stats;
  const metrics = stats ? [
    { label: 'Employees on Site', value: stats.checkedInEmployees, detail: 'Currently checked in', icon: Users, color: 'navy', to: '/admin/attendance' },
    { label: "Today's Entries", value: stats.todayEntries, detail: 'Verified employee entries', icon: LogIn, color: 'green', to: '/admin/attendance' },
    { label: "Today's Exits", value: stats.todayExits, detail: 'Verified employee exits', icon: LogOut, color: 'orange', to: '/admin/attendance' },
    { label: 'Active Visitors', value: stats.checkedInVisitors, detail: 'Currently checked in', icon: UserRoundCheck, color: 'purple', to: '/admin/visitors' },
  ] : [];
  return <main className="content sitepass-dashboard">
    {error && <div className="dashboard-error" role="alert"><AlertCircle size={20}/><div><strong>Unable to refresh dashboard</strong><p>{apiErrorMessage(error, 'Please try again.')}{data ? ' Showing the last successfully loaded snapshot.' : ' No statistics are available. Use Refresh to retry.'}</p></div></div>}
    {isPending ? <DashboardSkeleton/> : data && <>
      <section className="dashboard-welcome"><img className="construction-hero" src={constructionHero} alt="" decoding="async"/><div className="welcome-copy"><div className="welcome-actions"><span className="welcome-eyebrow"><span/> SITE ACCESS & ATTENDANCE</span><button className="dashboard-refresh" aria-label="Refresh dashboard" disabled={isFetching} onClick={refresh}><RefreshCw size={15} className={isFetching ? 'refresh-spinning' : ''}/><span>{isFetching ? 'Refreshing…' : 'Refresh'}</span></button></div><h2>Welcome back! <span aria-hidden="true">👋</span></h2><p>Monitor site access, attendance, and visitor activity in real time.</p><div className="welcome-meta"><span className="welcome-site"><Building2 size={15}/>{data.site?.name || 'No site configured'}</span>{data.site && <span className={`site-pill ${data.site.isActive ? 'active' : ''}`}><i/>{data.site.isActive ? 'Active' : 'Inactive'}</span>}<span className="welcome-date"><CalendarDays size={14}/>{new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: timezone })}</span></div></div></section>
      <div className="dashboard-kpis">{metrics.map(({ label, value, detail, icon: Icon, color, to }) => <Link key={label} to={to} className={`dashboard-kpi kpi-${color}`}><div className="kpi-top"><span className="kpi-icon"><Icon size={20}/></span><ArrowUpRight size={17} className="kpi-arrow"/></div><h2>{label}</h2><strong className="kpi-value">{value.toLocaleString()}</strong><p><span/>{detail}</p></Link>)}</div>
      <div className="dashboard-section-label"><h2>Access insights</h2><span><Clock3 size={13}/> All times in {timezone}</span></div>
      <div className="dashboard-charts"><section className="dashboard-card overview-card"><div className="chart-heading overview-heading"><div><h2>Site Access Overview</h2><p>Employee movements over the last seven days</p></div><span className="period-label">Last 7 days</span></div><div className="series-legend"><span><i style={{ background: COLORS.blue }}/>Entries</span><span><i style={{ background: COLORS.orange }}/>Exits</span></div>
        {data.accessOverview.some(day => day.entries || day.exits) ? <div className="overview-plot" role="img" aria-label="Daily employee entries and exits over the last seven days"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data.accessOverview} margin={{ top: 12, right: 12, left: -24, bottom: 0 }} accessibilityLayer><defs><linearGradient id="dashboard-entry-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={COLORS.blue} stopOpacity={0.15}/><stop offset="100%" stopColor={COLORS.blue} stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 5" vertical={false} stroke="#e9eef4"/><XAxis dataKey="date" tickFormatter={dateLabel} tick={{ fill: '#8996a8', fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={18} dy={8}/><YAxis allowDecimals={false} tick={{ fill: '#8996a8', fontSize: 10 }} axisLine={false} tickLine={false}/><Tooltip labelFormatter={dateLabel} contentStyle={{ borderRadius: 10, border: '1px solid #e6ebf2', fontSize: 12 }}/><Area type="linear" dataKey="entries" name="Entries" stroke={COLORS.blue} fill="url(#dashboard-entry-fill)" strokeWidth={2.5} isAnimationActive={false}/><Area type="linear" dataKey="exits" name="Exits" stroke={COLORS.orange} fill="transparent" strokeWidth={2.5} isAnimationActive={false}/></AreaChart></ResponsiveContainer></div> : <Empty>No employee movements in the last seven days.</Empty>}
        <p className="chart-note">Verified entry and exit events · {dateLabel(data.accessOverview[0].date)} – {dateLabel(data.accessOverview[6].date)}</p>
      </section>
      <DonutCard className="attendance-status-card" title="Attendance Status — Today" subtitle="Open and completed employee sessions" totalLabel="sessions" items={[{ name: 'Currently checked in', value: data.attendanceStatus.checkedIn, color: COLORS.blue }, { name: 'Checked out today', value: data.attendanceStatus.checkedOut, color: COLORS.orange }]} note="Open sessions include overnight stays. Each session appears once; a person may have multiple sessions."/>
      <DonutCard title="Visitor Status — Today" subtitle="Current visits and today's completions" totalLabel="visits" items={[{ name: 'Currently on site', value: data.visitorStatus.checkedIn, color: COLORS.purple }, { name: 'Completed today', value: data.visitorStatus.completed, color: COLORS.green }, { name: 'Awaiting entry', value: data.visitorStatus.awaitingEntry, color: COLORS.orange }]} note="Includes overnight visits and unexpired registrations awaiting entry. Each visit appears once."/>
      </div>
      <div className="dashboard-section-label"><h2>Recent activity</h2><span>Current week · {timezone}</span></div>
      <div className="dashboard-tables"><ActivityTable title="Recent Attendance Activity" description="Employee entry sessions from this week" to="/admin/attendance" columns={['Employee / ID', 'Entry', 'Exit', 'Duration', 'Status']} empty={!data.recentAttendance.length}>{data.recentAttendance.map(item => {
        const minutes = Math.max(0, Math.floor((new Date(item.exitTime || data.generatedAt) - new Date(item.entryTime)) / 60000));
        return <tr key={item.id}><td><div className="person-cell"><span className="person-avatar">{item.employeeName.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('')}</span><div><b>{item.employeeName}</b><small>{item.employeeCode}</small></div></div></td><td><Timestamp value={item.entryTime} timezone={timezone}/></td><td><Timestamp value={item.exitTime} empty="Not checked out" timezone={timezone}/></td><td>{Math.floor(minutes / 60)}h {minutes % 60}m{!item.exitTime && <small>Ongoing</small>}</td><td><Status status={item.status}/></td></tr>;
      })}</ActivityTable>
      <ActivityTable title="Recent Visitor Activity" description="Visitor records updated this week" to="/admin/visitors" columns={['Visitor / ID', 'Reason for visit', 'Entry', 'Exit', 'Status']} empty={!data.recentVisitors.length}>{data.recentVisitors.map(item => <tr key={item.id}><td><div className="person-cell"><span className="person-avatar visitor-avatar">{item.visitorName.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('')}</span><div><b>{item.visitorName}</b><small>{item.visitorCode || 'ID unavailable'}</small></div></div></td><td className="visit-purpose">{item.purpose}</td><td><Timestamp value={item.entryTime} empty="Not checked in" timezone={timezone}/></td><td><Timestamp value={item.exitTime} empty={item.entryTime ? 'Not checked out' : 'Not checked in'} timezone={timezone}/></td><td><Status status={item.displayStatus}/></td></tr>)}</ActivityTable></div>
      <footer className="dashboard-footer"><span><span className="snapshot-dot"/> {error ? 'Last successful snapshot' : 'Verified site data'}</span><span>Updated {new Date(data.generatedAt).toLocaleString('en-GB', { timeZone: timezone, dateStyle: 'medium', timeStyle: 'short' })} ({timezone}) · Refresh to update</span></footer>
    </>}
  </main>;
}
