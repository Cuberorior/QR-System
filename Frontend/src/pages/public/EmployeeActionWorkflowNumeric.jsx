import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import PublicLayout from '../../components/layout/PublicLayoutReal';
import SafetyChecklist from './SafetyChecklist';
import { apiErrorMessage, verificationApi } from '../../services/api';
import { clearVerificationSession, getVerificationSession } from '../../services/verificationSession';

export default function EmployeeActionWorkflowNumeric() {
  const { siteId, action } = useParams();
  const nav = useNavigate();
  const isEntry = action === 'entry';
  const [gpsEnabled, setGpsEnabled] = useState(true);
  const [safetyToken, setSafetyToken] = useState(null);
  const [showAccessCode, setShowAccessCode] = useState(false);
  const [form, setForm] = useState({ employeeNumber: '', accessCode: '' });
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    verificationApi.getSite(siteId)
      .then(({ data }) => setGpsEnabled((data.data || data.site || data).geofencingEnabled !== false))
      .catch(() => setGpsEnabled(true));
  }, [siteId]);

  const submit = async event => {
    event.preventDefault();
    setLoading(true);
    setErrorMessage('');
    try {
      const session = getVerificationSession(siteId);
      if (gpsEnabled && !session) throw new Error('Your location verification has expired. Please verify again.');
      const payload = {
        siteCode: siteId,
        employeeCode: `EMP-${form.employeeNumber.trim().padStart(3, '0')}`,
        accessCode: form.accessCode,
        ...(gpsEnabled ? { verificationToken: session.verificationToken } : {}),
        ...(isEntry ? { safetyToken } : {}),
      };
      const { data } = isEntry
        ? await verificationApi.verifyAttendanceEntry(payload)
        : await verificationApi.verifyAttendanceExit(payload);
      sessionStorage.setItem('sitepass:lastVerification', JSON.stringify(data));
      clearVerificationSession();
      nav(`/verify/${siteId}/${action}/success`);
    } catch (error) {
      setErrorMessage(apiErrorMessage(error, 'Employee verification failed.'));
    } finally {
      setLoading(false);
    }
  };

  return <PublicLayout>
    <button className="flex items-center gap-2 text-sm text-slate-500 mb-6" onClick={() => nav(`/verify/${siteId}/${action}`)}>
      <ArrowLeft size={16} />Back to {action} verification
    </button>
    {isEntry && !safetyToken ? <SafetyChecklist siteId={siteId} gpsEnabled={gpsEnabled} onComplete={setSafetyToken} onBack={() => nav(`/verify/${siteId}/${action}`)} /> : <div className="card p-6 sm:p-8">
      <ShieldCheck className="text-[#102a56]" />
      <h1 className="font-display text-3xl font-bold text-[#102a56]">Employee {isEntry ? 'entry' : 'exit'}</h1>
      <p className="text-slate-500 mt-2">Enter the three digits after your Employee ID prefix and your access code.</p>
      <form onSubmit={submit} className="mt-7 space-y-5">
        <label className="block">
          <span className="text-sm font-semibold">Employee ID</span>
          <div className="employee-id-field mt-2">
            <span aria-hidden="true">EMP-</span>
            <input required inputMode="numeric" pattern="[0-9]{1,3}" maxLength={3} autoComplete="off" placeholder="000" aria-label="Employee ID number after EMP prefix" value={form.employeeNumber} onChange={event => setForm({ ...form, employeeNumber: event.target.value.replace(/\D/g, '').slice(0, 3) })} />
          </div>
        </label>
        <label className="block">
          <span className="text-sm font-semibold">Access code</span>
          <div className="relative mt-2">
            <input required className="field pr-12" type={showAccessCode ? 'text' : 'password'} value={form.accessCode} onChange={event => setForm({ ...form, accessCode: event.target.value })} />
            <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" aria-label={showAccessCode ? 'Hide access code' : 'Show access code'} onClick={() => setShowAccessCode(current => !current)}>
              {showAccessCode ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </label>
        {errorMessage && <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-left text-sm text-red-700" role="alert"><AlertCircle size={20} className="mt-0.5 shrink-0"/><p className="leading-6">{errorMessage}</p></div>}
        <button className="btn btn-primary w-full" disabled={loading}>{loading ? 'Verifying…' : `Verify ${isEntry ? 'entry' : 'exit'}`}</button>
      </form>
    </div>}
  </PublicLayout>;
}
