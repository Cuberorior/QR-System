import { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft, ChevronRight, ClipboardList, Download, Eye, FileText,
  RefreshCw, Search, SlidersHorizontal, X,
} from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import { apiErrorMessage, verificationApi } from '../../services/api';
import { toast } from 'sonner';

const categories = ['Attendance', 'Safety', 'Employee Management', 'Visitor Management', 'Site Management', 'Administration'];
const timezone = import.meta.env.VITE_ADMIN_TIMEZONE || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Colombo';

const formatDate = (value, options = {}) => new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium', timeStyle: 'short', timeZone: timezone, ...options,
}).format(new Date(value));
const toIsoStart = value => value ? new Date(`${value}T00:00:00`).toISOString() : undefined;
const toIsoEnd = value => value ? new Date(`${value}T23:59:59.999`).toISOString() : undefined;
const readable = value => String(value || '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/^./, value => value.toUpperCase());

function CategoryBadge({ category }) {
  const tone = {
    Attendance: 'bg-blue-50 text-blue-700',
    Safety: 'bg-teal-50 text-teal-700',
    'Employee Management': 'bg-violet-50 text-violet-700',
    'Visitor Management': 'bg-amber-50 text-amber-700',
    'Site Management': 'bg-indigo-50 text-indigo-700',
    Administration: 'bg-slate-100 text-slate-700',
  }[category] || 'bg-slate-100 text-slate-700';
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap ${tone}`}>{category}</span>;
}

function Info({ title, value }) {
  return <div><dt className="text-xs font-bold uppercase tracking-wide text-slate-400">{title}</dt><dd className="mt-1 break-words text-sm font-semibold text-slate-700">{value}</dd></div>;
}

function DetailValue({ value }) {
  if (value == null || value === '') return <span className="text-slate-400">Not available</span>;
  return <span>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>;
}

function DetailsDrawer({ log, onClose }) {
  if (!log) return null;
  const entries = log.details && typeof log.details === 'object' ? Object.entries(log.details) : [];
  return <div className="fixed inset-0 z-40 flex justify-end bg-slate-950/30" role="dialog" aria-modal="true" aria-label="Activity details" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <aside className="h-full w-full max-w-xl overflow-y-auto bg-white p-6 shadow-2xl sm:p-8">
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-5">
        <div><p className="text-xs font-bold uppercase tracking-[.18em] text-teal-600">Audit event</p><h2 className="font-display mt-2 text-2xl font-bold text-[#102a56]">{log.actionLabel}</h2><p className="mt-1 text-sm text-slate-500">{formatDate(log.createdAt)}</p></div>
        <button className="btn btn-soft p-2" onClick={onClose} aria-label="Close details"><X size={18}/></button>
      </div>
      <dl className="mt-6 grid gap-4 sm:grid-cols-2">
        <Info title="Performed by" value={log.actorName}/><Info title="Actor type" value={readable(log.actorType)}/>
        <Info title="Category" value={<CategoryBadge category={log.category}/>}/><Info title="Construction site" value={log.siteName || log.siteCode || 'Site unavailable'}/>
        <Info title="Entity" value={`${log.entityLabel}${log.entityId ? ` · ${log.entityId}` : ''}`}/><Info title="Timezone" value={timezone}/>
      </dl>
      <section className="mt-7"><h3 className="font-bold text-[#102a56]">Event information</h3>
        {entries.length ? <dl className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200">{entries.map(([key, value]) => <div className="grid gap-1 px-4 py-3 sm:grid-cols-[minmax(130px,.7fr)_1.3fr] sm:gap-4" key={key}><dt className="text-xs font-bold uppercase tracking-wide text-slate-400">{readable(key)}</dt><dd className="break-words text-sm text-slate-700"><DetailValue value={value}/></dd></div>)}</dl> : <p className="mt-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No additional event details were recorded.</p>}
      </section>
      <details className="mt-6 rounded-xl border border-slate-200 bg-slate-50"><summary className="cursor-pointer px-4 py-3 text-sm font-bold text-[#102a56]">Technical audit metadata</summary><pre className="max-h-72 overflow-auto border-t border-slate-200 p-4 text-xs leading-5 text-slate-600">{JSON.stringify(log.details || {}, null, 2)}</pre></details>
    </aside>
  </div>;
}

export default function ActivityLogsRedesigned() {
  const [filters, setFilters] = useState({ q: '', category: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 25, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedLog, setSelectedLog] = useState(null);
  const [exporting, setExporting] = useState(false);
  const query = useMemo(() => ({
    page, pageSize,
    ...(filters.q ? { q: filters.q } : {}),
    ...(filters.category ? { category: filters.category } : {}),
    ...(filters.from ? { from: toIsoStart(filters.from) } : {}),
    ...(filters.to ? { to: toIsoEnd(filters.to) } : {}),
  }), [filters, page, pageSize]);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const { data } = await verificationApi.listAuditLogs(query);
      setLogs(data.logs || []);
      setPagination(data.pagination || { page, pageSize, total: 0, totalPages: 0 });
    } catch (requestError) {
      setError(apiErrorMessage(requestError, 'Unable to load activity logs.'));
    } finally { setLoading(false); }
  };
  useEffect(() => { const timer = window.setTimeout(load, 250); return () => window.clearTimeout(timer); }, [JSON.stringify(query)]);
  useEffect(() => {
    if (!selectedLog) return undefined;
    const close = event => event.key === 'Escape' && setSelectedLog(null);
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [selectedLog]);

  const changeFilter = (key, value) => { setPage(1); setFilters(current => ({ ...current, [key]: value })); };
  const clearFilters = () => { setPage(1); setFilters({ q: '', category: '', from: '', to: '' }); };
  const exportCsv = async () => {
    setExporting(true);
    try {
      const { data } = await verificationApi.exportAuditLogs({
        ...(filters.q ? { q: filters.q } : {}),
        ...(filters.category ? { category: filters.category } : {}),
        ...(filters.from ? { from: toIsoStart(filters.from) } : {}),
        ...(filters.to ? { to: toIsoEnd(filters.to) } : {}),
      });
      const url = URL.createObjectURL(data); const link = document.createElement('a');
      link.href = url; link.download = 'sitepass-activity-logs.csv'; link.click(); URL.revokeObjectURL(url);
      toast.success('Activity log export downloaded.');
    } catch (requestError) { toast.error(apiErrorMessage(requestError, 'Unable to export activity logs.')); }
    finally { setExporting(false); }
  };

  return <main className="content">
    <PageHeader title="Activity logs" description="Review a read-only audit trail of activity across your SITEPASS workspace." action={<button className="btn btn-primary" onClick={exportCsv} disabled={exporting}><Download size={16}/>{exporting ? 'Preparing…' : 'Export CSV'}</button>}/>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2 text-sm text-slate-500"><ClipboardList size={17} className="text-teal-600"/><span>{pagination.total.toLocaleString()} recorded events</span><span className="hidden text-slate-300 sm:inline">·</span><span className="hidden sm:inline">Times shown in {timezone}</span></div><button className="btn btn-soft text-sm" onClick={load} disabled={loading}><RefreshCw size={15} className={loading ? 'animate-spin' : ''}/>Refresh</button></div>
    <section className="card overflow-hidden">
      <div className="border-b border-slate-100 bg-slate-50/70 p-4"><div className="flex flex-wrap items-end gap-3">
        <label className="relative min-w-[220px] flex-1"><span className="sr-only">Search activity logs</span><Search size={16} className="absolute left-3 top-3 text-slate-400"/><input className="field pl-9" placeholder="Search activity, actor, or record" value={filters.q} onChange={event => changeFilter('q', event.target.value)}/></label>
        <label className="min-w-[190px]"><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Category</span><select className="field" value={filters.category} onChange={event => changeFilter('category', event.target.value)}><option value="">All categories</option>{categories.map(category => <option key={category}>{category}</option>)}</select></label>
        <label><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">From</span><input className="field" type="date" value={filters.from} onChange={event => changeFilter('from', event.target.value)}/></label>
        <label><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">To</span><input className="field" type="date" value={filters.to} onChange={event => changeFilter('to', event.target.value)}/></label>
        <button className="btn btn-soft" onClick={clearFilters}><SlidersHorizontal size={16}/>Clear</button>
      </div></div>
      <div className="table-wrap overflow-x-auto">
        {loading ? <div className="p-12 text-center text-slate-500"><RefreshCw size={22} className="mx-auto mb-3 animate-spin text-teal-600"/><p>Loading activity logs…</p></div>
          : error ? <div className="p-12 text-center"><FileText size={28} className="mx-auto mb-3 text-red-400"/><p className="font-semibold text-red-700">{error}</p><button className="btn btn-soft mt-4" onClick={load}>Try again</button></div>
          : !logs.length ? <div className="p-12 text-center"><FileText size={30} className="mx-auto mb-3 text-slate-300"/><p className="font-semibold text-[#102a56]">No activity found</p><p className="mt-1 text-sm text-slate-500">Try changing or clearing your filters.</p></div>
          : <table className="min-w-[980px] table-fixed"><colgroup><col className="w-[150px]"/><col className="w-[190px]"/><col className="w-[210px]"/><col className="w-[170px]"/><col className="w-[180px]"/><col className="w-[150px]"/></colgroup><thead><tr><th>Date &amp; Time</th><th>Performed By</th><th>Activity</th><th>Category</th><th>Construction Site</th><th>Details</th></tr></thead><tbody>{logs.map(log => <tr key={log.id}><td className="whitespace-normal"><div className="font-semibold text-slate-700">{formatDate(log.createdAt, { timeStyle: undefined })}</div><div className="mt-1 text-xs text-slate-400">{formatDate(log.createdAt, { dateStyle: undefined, timeStyle: 'short' })}</div></td><td className="whitespace-normal"><div className="truncate font-semibold text-[#102a56]" title={log.actorName}>{log.actorName || 'Actor unavailable'}</div><div className="mt-1 truncate text-xs text-slate-400" title={log.actorReference || log.actorType}>{log.actorReference || readable(log.actorType)}</div></td><td className="whitespace-normal"><div className="truncate font-semibold text-slate-700" title={log.actionLabel}>{log.actionLabel}</div><div className="mt-1 truncate text-xs text-slate-400">{log.entityLabel}</div></td><td><CategoryBadge category={log.category}/></td><td className="whitespace-normal"><div className="truncate font-semibold text-slate-700" title={log.siteName || log.siteCode || 'Site unavailable'}>{log.siteName || 'Site unavailable'}</div><div className="mt-1 truncate text-xs text-slate-400">{log.siteCode || 'No site reference'}</div></td><td><button className="btn btn-soft px-3 py-2 text-xs" onClick={() => setSelectedLog(log)}><Eye size={15}/>View details</button></td></tr>)}</tbody></table>}
      </div>
      {!loading && !error && logs.length > 0 && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-4"><p className="text-sm text-slate-500">Showing {((pagination.page - 1) * pagination.pageSize) + 1}–{Math.min(pagination.page * pagination.pageSize, pagination.total)} of {pagination.total.toLocaleString()}</p><div className="flex items-center gap-2"><select className="field w-auto py-2 text-sm" value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}><option value="25">25 / page</option><option value="50">50 / page</option><option value="100">100 / page</option></select><button className="btn btn-soft p-2" disabled={page <= 1} onClick={() => setPage(current => current - 1)} aria-label="Previous page"><ChevronLeft size={17}/></button><span className="min-w-16 text-center text-sm font-semibold text-slate-600">{pagination.page} / {Math.max(pagination.totalPages, 1)}</span><button className="btn btn-soft p-2" disabled={page >= pagination.totalPages} onClick={() => setPage(current => current + 1)} aria-label="Next page"><ChevronRight size={17}/></button></div></div>}
    </section>
    {selectedLog && <DetailsDrawer log={selectedLog} onClose={() => setSelectedLog(null)}/>}
  </main>;
}
