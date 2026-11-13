import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, UserRoundPlus } from 'lucide-react';
import PublicLayout from '../../components/layout/PublicLayoutReal';
import { apiErrorMessage, verificationApi } from '../../services/api';
import { getVerificationSession } from '../../services/verificationSession';
import { toast } from 'sonner';
import SafetyChecklist from './SafetyChecklist';

const createIdempotencyKey = () => {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  return `visitor-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
};

export default function VisitorRegistrationSelfService() {
  const { siteId } = useParams(); const nav = useNavigate(); const [form, setForm] = useState({ fullName: '', phone: '', email: '', organization: '', purpose: '' }); const [showSafety, setShowSafety] = useState(false); const [loading, setLoading] = useState(false);
  const verifySiteAccess = async () => { const siteResponse = await verificationApi.getSite(siteId); const site = siteResponse.data.data || siteResponse.data.site || siteResponse.data; const session = getVerificationSession(siteId); if (site.geofencingEnabled && !session) throw new Error('Your location verification has expired. Please verify again.'); return { site, session }; };
  const beginRegistration = async event => { event.preventDefault(); setLoading(true); try { await verifySiteAccess(); setShowSafety(true); } catch (error) { toast.error(apiErrorMessage(error, 'Unable to continue visitor registration.')); } finally { setLoading(false); } };
  const completeRegistration = async safetyResponses => { setLoading(true); try { const { site, session } = await verifySiteAccess(); const key = createIdempotencyKey(); const payload = { siteCode: siteId, ...form, safetyResponses, ...(site.geofencingEnabled ? { verificationToken: session.verificationToken } : {}) }; const { data } = await verificationApi.registerVisitor(payload, { headers: { 'Idempotency-Key': key } }); toast.success(data.message || 'Registration complete. Check your email.'); nav(`/verify/${siteId}/status`); } catch (error) { toast.error(apiErrorMessage(error, 'Visitor registration failed.')); } finally { setLoading(false); } };
  return <PublicLayout><button className="flex items-center gap-2 text-sm text-slate-500 mb-6" onClick={() => showSafety ? setShowSafety(false) : nav(`/verify/${siteId}`)}><ArrowLeft size={16}/>Back to {showSafety ? 'visitor information' : 'site verification'}</button>{showSafety ? <SafetyChecklist siteId={siteId} mode="visitor" onComplete={completeRegistration} onBack={() => setShowSafety(false)} externalLoading={loading}/> : <div className="card p-6 sm:p-8"><UserRoundPlus className="text-amber-600"/><h1 className="font-display text-3xl font-bold text-[#102a56] mt-5">Register as a visitor</h1><p className="text-slate-500 mt-2">Your Visitor ID and temporary access code will be sent to your email after registration.</p><form onSubmit={beginRegistration} className="mt-7 space-y-4">{[['fullName','Full name','text',true],['email','Email address','email',true],['phone','Contact number','text',true],['organization','Organization or company','text',false],['purpose','Purpose of visit','text',true]].map(([name,label,type,required]) => <label className="block" key={name}><span className="text-sm font-semibold">{label}{required && ' *'}</span><input className="field mt-2" type={type} value={form[name]} onChange={event => setForm({ ...form, [name]: event.target.value })} required={required}/></label>)}<button className="btn btn-orange w-full" disabled={loading}>{loading ? 'Checking…' : 'Continue to safety requirements'}</button></form></div>}</PublicLayout>;
}
