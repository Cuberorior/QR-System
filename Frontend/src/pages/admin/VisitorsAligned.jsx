import { useEffect, useState } from 'react';
import { Download, Filter, Mail, Search } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import ClearHistoryDialog from '../../components/common/ClearHistoryDialog';
import StatusBadge from '../../components/common/StatusBadge';
import SiteSelector, { savedSiteCode } from '../../components/common/SiteSelector';
import { apiErrorMessage, verificationApi } from '../../services/api';
import { toast } from 'sonner';

const initial = { siteCode: savedSiteCode(), q: '', email: '', purpose: '', visitStatus: '', from: '', to: '', page: 1, pageSize: 25 };

const requestParams = (filters, pagination = true) => ({
  ...(filters.siteCode ? { siteCode: filters.siteCode } : {}),
  ...(filters.q.trim() ? { q: filters.q.trim() } : {}),
  ...(filters.email.trim() ? { email: filters.email.trim() } : {}),
  ...(filters.purpose.trim() ? { purpose: filters.purpose.trim() } : {}),
  ...(filters.visitStatus ? { visitStatus: filters.visitStatus } : {}),
  ...(filters.from ? { from: `${filters.from}T00:00:00.000Z` } : {}),
  ...(filters.to ? { to: `${filters.to}T23:59:59.999Z` } : {}),
  ...(pagination ? { page: filters.page, pageSize: filters.pageSize } : {}),
});

const time = value => value
  ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })
  : '—';

export default function VisitorsAligned() {
  const [filters, setFilters] = useState(initial);
  const [sites, setSites] = useState([]);
  const [visitors, setVisitors] = useState([]);
  const [page, setPage] = useState({ page: 1, pageSize: 25, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    const open = () => setClearDialogOpen(true);
    window.addEventListener('sitepass:clear-visitor-history', open);
    return () => window.removeEventListener('sitepass:clear-visitor-history', open);
  }, []);

  const update = values => setFilters(current => ({
    ...current,
    ...values,
    ...(values.page === undefined ? { page: 1 } : {}),
  }));

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await verificationApi.listVisitors(requestParams(filters));
      setVisitors(data.visitors || []);
      setPage(data.pagination || { page: 1, pageSize: filters.pageSize, total: 0, totalPages: 0 });
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Unable to load visitors.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    verificationApi.listSites()
      .then(({ data }) => setSites(data.sites || []))
      .catch(error => toast.error(apiErrorMessage(error, 'Unable to load construction sites.')));
  }, []);

  useEffect(() => {
    const timer = setTimeout(load, filters.q || filters.email || filters.purpose ? 300 : 0);
    return () => clearTimeout(timer);
  }, [filters]);

  const revoke = async id => {
    try {
      await verificationApi.revokeVisitor(id);
      toast.success('Visitor access revoked.');
      load();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Unable to revoke visitor access.'));
    }
  };

  const resend = async id => {
    try {
      await verificationApi.regenerateVisitorAccessCode(id);
      toast.success('Visitor credentials sent.');
      load();
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Unable to send visitor credentials.'));
    }
  };

  const download = async () => {
    setExporting(true);
    try {
      const { data, headers } = await verificationApi.exportVisitors(requestParams(filters, false));
      const url = URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = url;
      link.download = /filename[^;=]*=(?:UTF-8'')?[^;\n]*/i.exec(headers['content-disposition'] || '')?.[0]
        .split('=').pop().replaceAll('"', '') || 'SITEPASS_Visitors.pdf';
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Visitor PDF export failed.'));
    } finally {
      setExporting(false);
    }
  };

  const clearHistory = async () => {
    setClearing(true);
    try {
      const { data } = await verificationApi.clearVisitorHistory({
        ...requestParams(filters, false),
        confirmation: 'CLEAR',
      });
      toast.success(data.message || 'Visitor history cleared.');
      setClearDialogOpen(false);
      update({ page: 1 });
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Unable to clear visitor history.'));
    } finally {
      setClearing(false);
    }
  };

  return <>
    {clearDialogOpen && <ClearHistoryDialog
      title="Clear visitor history?"
      recordLabel="visitor records"
      count={page.total}
      preservationNote="Visitors currently checked in are protected and will not be deleted."
      saving={clearing}
      onClose={() => setClearDialogOpen(false)}
      onConfirm={clearHistory}
    />}
    <main className="content">
      <PageHeader
        title="Visitors"
        description="Monitor visitor registration and site presence across authorized construction sites."
        action={<button className="btn btn-primary" disabled={exporting} onClick={download}>
          <Download size={16}/>{exporting ? 'Generating…' : 'PDF report'}
        </button>}
      />
      <section className="card mt-5">
        <div className="p-4 border-b border-slate-100 flex items-center gap-2">
          <Filter size={17} className="text-[#102a56]"/>
          <h2 className="font-bold text-[#102a56]">Filter visitors</h2>
          <button className="btn btn-soft text-xs ml-auto" onClick={() => setFilters(initial)}>Reset filters</button>
        </div>
        <div className="p-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Field label="Construction site">
            <SiteSelector sites={sites} value={filters.siteCode} onChange={siteCode => update({ siteCode })} className="mt-1 w-full"/>
          </Field>
          <Field label="Visitor name or ID">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-3 text-slate-400"/>
              <input className="field pl-9 w-full" value={filters.q} onChange={event => update({ q: event.target.value })}/>
            </div>
          </Field>
          <Field label="Email address">
            <input className="field w-full" value={filters.email} onChange={event => update({ email: event.target.value })}/>
          </Field>
          <Field label="Visit status">
            <select className="field w-full" value={filters.visitStatus} onChange={event => update({ visitStatus: event.target.value })}>
              <option value="">All visit statuses</option>
              <option value="REGISTERED">Registered</option>
              <option value="CHECKED_IN">Checked In</option>
              <option value="CHECKED_OUT">Checked Out</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </Field>
          <Field label="Reason for visit">
            <input className="field w-full" value={filters.purpose} onChange={event => update({ purpose: event.target.value })}/>
          </Field>
          <Field label="From date (UTC)">
            <input className="field w-full" type="date" value={filters.from} onChange={event => update({ from: event.target.value })}/>
          </Field>
          <Field label="To date (UTC)">
            <input className="field w-full" type="date" value={filters.to} onChange={event => update({ to: event.target.value })}/>
          </Field>
        </div>
        <div className="px-4 py-3 text-sm text-slate-500">
          {page.total} matching visitor{page.total === 1 ? '' : 's'} · server-scoped to the selected authorized site.
        </div>
        <div className="table-wrap overflow-x-auto">
          <table className="min-w-[1700px] table-fixed">
            <colgroup>
              <col className="w-[150px]"/>
              <col className="w-[220px]"/>
              <col className="w-[240px]"/>
              <col className="w-[140px]"/>
              <col className="w-[280px]"/>
              <col className="w-[165px]"/>
              <col className="w-[165px]"/>
              <col className="w-[145px]"/>
              <col className="w-[195px]"/>
            </colgroup>
            <thead>
              <tr>
                <th>Visitor name / ID</th><th>Site</th><th>Email</th><th>Phone</th><th>Reason</th>
                <th>Entry</th><th>Exit</th><th>Status</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan="9" className="p-6 text-center">Loading visitors…</td></tr>}
              {!loading && visitors.map(visitor => <tr key={visitor.id}>
                <td className="align-middle"><b>{visitor.fullName}</b><div className="text-xs text-slate-400">{visitor.visitorCode}</div></td>
                <td className="align-middle whitespace-normal break-words">{visitor.siteName || visitor.siteCode}</td>
                <td className="align-middle break-words">{visitor.email || '—'}</td>
                <td className="align-middle">{visitor.phone || '—'}</td>
                <td className="align-middle whitespace-normal">
                  <div className="break-words leading-5" title={visitor.purpose || 'Not provided'}>{visitor.purpose || 'Not provided'}</div>
                </td>
                <td className="align-middle">{time(visitor.entryTime)}</td>
                <td className="align-middle">{time(visitor.exitTime)}</td>
                <td className="align-middle"><StatusBadge status={visitor.visitStatus}/></td>
                <td className="align-middle">
                  <div className="flex min-w-max gap-2 whitespace-nowrap">
                    {visitor.email && visitor.visitStatus !== 'CANCELLED' && <button className="btn btn-soft text-xs" onClick={() => resend(visitor.id)}><Mail size={13}/>Resend</button>}
                    {!['CHECKED_OUT', 'CANCELLED'].includes(visitor.visitStatus) && <button className="btn btn-danger text-xs" onClick={() => revoke(visitor.id)}>Revoke</button>}
                  </div>
                </td>
              </tr>)}
              {!loading && !visitors.length && <tr><td colSpan="9" className="p-6 text-center text-slate-500">No visitors match this site and filter selection.</td></tr>}
            </tbody>
          </table>
        </div>
        {page.totalPages > 1 && <div className="p-4 flex justify-between">
          <button className="btn btn-soft" disabled={page.page <= 1} onClick={() => update({ page: page.page - 1 })}>Previous</button>
          <span className="text-sm">Page {page.page} of {page.totalPages}</span>
          <button className="btn btn-soft" disabled={page.page >= page.totalPages} onClick={() => update({ page: page.page + 1 })}>Next</button>
        </div>}
      </section>
    </main>
  </>;
}

function Field({ label, children }) {
  return <label><span className="text-xs font-semibold text-slate-500 block mb-1">{label}</span>{children}</label>;
}
