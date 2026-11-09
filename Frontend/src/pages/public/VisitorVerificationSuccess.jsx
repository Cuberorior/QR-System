import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import PublicLayout from '../../components/layout/PublicLayoutReal';

export default function VisitorVerificationSuccess() {
  const { siteId } = useParams();
  const nav = useNavigate();
  const result = JSON.parse(sessionStorage.getItem('sitepass:lastVisitorVerification') || 'null');

  useEffect(() => {
    if (!result) nav(`/verify/${siteId}`);
  }, [result, nav, siteId]);

  if (!result) return null;

  const entry = result.action === 'CHECK_IN';
  const visitor = result.visitor || {};
  const visit = result.visit || {};

  return <PublicLayout>
    <div className="card p-7 sm:p-9 text-center">
      <CheckCircle2 size={68} className="mx-auto text-emerald-500"/>
      <p className="text-xs tracking-widest uppercase font-bold text-emerald-600 mt-6">Verification complete</p>
      <h1 className="font-display text-3xl font-bold text-[#102a56] mt-2">{entry ? 'Entry' : 'Exit'} Verified Successfully</h1>
      <div className="text-left bg-slate-50 rounded-xl p-5 mt-7 space-y-3">
        <Row label="Visitor" value={visitor.fullName}/>
        <Row label="Visitor ID" value={visitor.visitorCode}/>
        <Row label="Action" value={entry ? 'ENTRY' : 'EXIT'}/>
        <Row label="Entry date & time" value={formatDateTime(visit.entryTime)}/>
        {!entry && <Row label="Exit date & time" value={formatDateTime(visit.exitTime)}/>} 
        <Row label="Status" value={visit.status}/>
      </div>
      <button className="btn btn-primary w-full mt-7" onClick={() => nav(`/verify/${siteId}`)}><ArrowLeft size={16}/>Back to home</button>
    </div>
  </PublicLayout>;
}

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
