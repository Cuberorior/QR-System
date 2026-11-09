import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarClock, CheckCircle2, Mail, Phone } from 'lucide-react';
import PublicLayout from '../../components/layout/PublicLayoutReal';

function Row({ label, value }) {
  return <div className="flex justify-between gap-4 text-sm"><span className="text-slate-500">{label}</span><strong className="text-right text-[#102a56]">{value || '—'}</strong></div>;
}

function formatDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-AU', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
    timeZone: 'Australia/Sydney', timeZoneName: 'short',
  }).format(date);
}

export default function VerificationSuccessWithContact() {
  const { siteId } = useParams();
  const nav = useNavigate();
  const result = JSON.parse(sessionStorage.getItem('sitepass:lastVerification') || 'null');

  useEffect(() => {
    if (!result) nav(`/verify/${siteId}`);
  }, [result, nav, siteId]);

  if (!result) return null;
  const entry = result.action === 'ENTRY';
  const employee = result.employee || {};
  const attendance = result.attendance || {};
  const contact = result.contact;
  const workerIdExpiry = result.workerIdExpiry;
  const workerIdMessage = workerIdExpiry?.daysRemaining === 0 ? 'Your Worker ID expires today.' : `Your Worker ID expires in ${workerIdExpiry?.daysRemaining} day${workerIdExpiry?.daysRemaining === 1 ? '' : 's'}.`;

  return <PublicLayout><div className="card p-7 sm:p-9 text-center">
    <CheckCircle2 size={68} className="mx-auto text-emerald-500" />
    <p className="text-xs tracking-widest uppercase font-bold text-emerald-600 mt-6">Verification complete</p>
    <h1 className="font-display text-3xl font-bold text-[#102a56] mt-2">{entry ? 'Entry' : 'Exit'} Verified Successfully</h1>
    <div className="text-left bg-slate-50 rounded-xl p-5 mt-7 space-y-3">
      <Row label="Employee" value={employee.fullName} />
      <Row label="Employee ID" value={employee.employeeCode} />
      <Row label="Action" value={result.action} />
      <Row label="Entry date & time" value={formatDateTime(attendance.entryTime)} />
      {!entry && <Row label="Exit date & time" value={formatDateTime(attendance.exitTime)} />}
      <Row label="Status" value={attendance.status} />
    </div>
    {entry && workerIdExpiry?.isExpiringSoon && <section className="mt-6 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-left text-amber-950" role="status">
      <CalendarClock size={23} className="mt-0.5 shrink-0 text-amber-600" />
      <div><h2 className="font-semibold">Worker ID expiry reminder</h2><p className="mt-1 text-sm leading-5">{workerIdMessage} Expiry date: {workerIdExpiry.expiresOn?.replaceAll('-', '.')}.</p></div>
    </section>}
    {contact && (contact.email || contact.phone) && <section className="mt-6 rounded-xl border border-blue-100 bg-blue-50 p-5 text-left">
      <h2 className="font-semibold text-[#102a56]">Need help?</h2>
      <p className="text-sm text-slate-600 mt-1">Contact your site administrator{contact.fullName ? `, ${contact.fullName}` : ''}.</p>
      <div className="mt-4 space-y-3 text-sm">
        {contact.email && <a className="flex items-center gap-3 text-[#102a56] hover:underline" href={`mailto:${contact.email}`}><Mail size={17} /><span>{contact.email}</span></a>}
        {contact.phone && <a className="flex items-center gap-3 text-[#102a56] hover:underline" href={`tel:${contact.phone}`}><Phone size={17} /><span>{contact.phone}</span></a>}
      </div>
    </section>}
    <button className="btn btn-primary w-full mt-7" onClick={() => nav(`/verify/${siteId}`)}><ArrowLeft size={16} />Back to home</button>
  </div></PublicLayout>;
}
