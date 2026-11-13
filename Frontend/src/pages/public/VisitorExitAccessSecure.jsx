import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Clock3, Eye, EyeOff } from 'lucide-react';
import PublicLayout from '../../components/layout/PublicLayoutReal';
import { apiErrorMessage, verificationApi } from '../../services/api';
import { toast } from 'sonner';

export default function VisitorExitAccessSecure() {
  const { siteId } = useParams();
  const nav = useNavigate();
  const [form, setForm] = useState({ visitorNumber: '', accessCode: '' });
  const [gps, setGps] = useState(true);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [showAccessCode, setShowAccessCode] = useState(false);

  useEffect(() => {
    verificationApi.getSite(siteId)
      .then(({ data }) => setGps((data.data || data.site || data).geofencingEnabled !== false))
      .catch(() => {});
  }, [siteId]);

  const submit = async event => {
    event.preventDefault();
    setLoading(true);
    try {
      let verificationToken;
      if (gps) {
        const position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(
          resolve,
          reject,
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
        ));
        const location = await verificationApi.verifyLocation({
          siteCode: siteId,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
        verificationToken = location.data.verificationToken;
      }
      const response = await verificationApi.visitorCheckOut({
        siteCode: siteId,
        visitorCode: `VIS-${form.visitorNumber.padStart(3, '0')}`,
        accessCode: form.accessCode,
        ...(verificationToken ? { verificationToken } : {}),
      });
      sessionStorage.setItem('sitepass:lastVisitorVerification', JSON.stringify(response.data));
      setDone(true);
      toast.success('Visitor checked out.');
      nav(`/verify/${siteId}/exit/visitor/success`);
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Visitor exit failed.'));
    } finally {
      setLoading(false);
    }
  };

  return <PublicLayout>
    <button className="flex items-center gap-2 text-sm text-slate-500 mb-6" onClick={() => nav(`/verify/${siteId}/exit`)}>
      <ArrowLeft size={16}/>Back to exit verification
    </button>
    <div className="card p-6 sm:p-8">
      <Clock3 className="text-blue-600"/>
      <h1 className="font-display text-3xl font-bold text-[#102a56] mt-5">Visitor exit</h1>
      <p className="text-slate-500 mt-2">Enter your 3-digit Visitor ID and 6-digit access code.</p>
      {done ? <div className="mt-6 rounded-xl bg-emerald-50 p-4 text-emerald-800">Visitor checked out successfully.</div> : <form className="mt-7 space-y-4" onSubmit={submit}>
        <label className="block">
          <span className="text-sm font-semibold">Visitor ID</span>
          <div className="employee-id-field mt-2">
            <span aria-hidden="true">VIS-</span>
            <input required inputMode="numeric" pattern="[0-9]{1,3}" maxLength={3} autoComplete="off" placeholder="000" aria-label="3-digit Visitor ID" value={form.visitorNumber} onChange={event => setForm({ ...form, visitorNumber: event.target.value.replace(/\D/g, '').slice(0, 3) })}/>
          </div>
        </label>
        <label className="block">
          <span className="text-sm font-semibold">Access code</span>
          <div className="relative mt-2">
            <input className="field pr-12" type={showAccessCode ? 'text' : 'password'} inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="off" value={form.accessCode} onChange={event => setForm({ ...form, accessCode: event.target.value.replace(/\D/g, '').slice(0, 6) })} required />
            <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-500" aria-label={showAccessCode ? 'Hide access code' : 'Show access code'} onClick={() => setShowAccessCode(current => !current)}>
              {showAccessCode ? <EyeOff size={19}/> : <Eye size={19}/>}
            </button>
          </div>
        </label>
        <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{gps ? 'Fresh GPS verification is required.' : 'GPS verification is disabled for this site.'}</p>
        <button className="btn btn-primary w-full" disabled={loading}>{loading ? 'Processing…' : 'Check out visitor'}</button>
      </form>}
    </div>
  </PublicLayout>;
}
