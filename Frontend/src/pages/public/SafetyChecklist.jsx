import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { apiErrorMessage, verificationApi } from '../../services/api';
import { getVerificationSession } from '../../services/verificationSession';
import { toast } from 'sonner';

const items = [
  ['safetyHelmet', 'Safety Helmet', 'I am wearing the required safety helmet.'],
  ['safetyFootwear', 'Safety Footwear', 'I am wearing appropriate safety boots.'],
  ['highVisibilityClothing', 'High-Visibility Clothing', 'I am wearing the required reflective vest or clothing.'],
  ['protectiveEquipment', 'Protective Equipment', 'I have the gloves, eye protection, and other PPE required for my assigned tasks.'],
  ['siteSafetyInstructions', 'Site Safety Instructions', 'I understand the applicable hazards, restricted areas, and emergency procedures.'],
  ['fitForDuty', 'Fit for Duty', 'I declare that I am fit to perform my assigned work safely.'],
];
const progressClasses = ['w-0', 'w-1/6', 'w-2/6', 'w-3/6', 'w-4/6', 'w-5/6', 'w-full'];

export default function SafetyChecklist({ siteId, gpsEnabled, onComplete, onBack }) {
  const [responses, setResponses] = useState(Object.fromEntries(items.map(([key]) => [key, false]))); const [loading, setLoading] = useState(false); const completed = Object.values(responses).filter(Boolean).length;
  const submit = async event => { event.preventDefault(); if (completed !== items.length) return; setLoading(true); try { const session = gpsEnabled ? getVerificationSession(siteId) : null; const { data } = await verificationApi.submitSafetyDeclaration({ siteCode: siteId, responses, ...(session ? { verificationToken: session.verificationToken } : {}) }); toast.success('Safety declaration recorded. Continue with employee verification.'); onComplete(data.safetyToken); } catch (error) { toast.error(apiErrorMessage(error, 'Unable to submit safety declaration.')); } finally { setLoading(false); } };
  return <div className="card p-6 sm:p-8"><div className="flex items-start gap-3"><ShieldCheck className="text-emerald-600"/><div><h1 className="font-display text-2xl font-bold text-[#102a56]">Worker Safety Verification</h1><p className="text-sm text-slate-500 mt-1">This is a self-declaration, not a safety certification.</p></div></div><div className="mt-6"><div className="flex justify-between text-sm font-semibold"><span>Checklist progress</span><span>{completed}/{items.length}</span></div><div className="h-2 rounded-full bg-slate-100 mt-2"><div className={`h-full bg-emerald-500 ${progressClasses[completed]}`} /></div><form onSubmit={submit} className="mt-6 space-y-3">{items.map(([key, title, text]) => <label key={key} className="flex gap-3 rounded-xl border border-slate-200 p-4 cursor-pointer"><input type="checkbox" className="mt-1 h-5 w-5 accent-emerald-600" checked={responses[key]} onChange={event => setResponses({ ...responses, [key]: event.target.checked })}/><span><strong className="block text-[#102a56]">{title}</strong><span className="text-sm text-slate-600">{text}</span></span></label>)}{completed !== items.length && <p className="text-sm text-amber-700 bg-amber-50 rounded-lg p-3">Confirm every requirement to continue. If you cannot truthfully confirm one, contact your site supervisor and do not proceed.</p>}<div className="flex gap-3"><button type="button" className="btn btn-soft flex-1" onClick={onBack}>Back</button><button className="btn btn-primary flex-1" disabled={loading || completed !== items.length}>{loading ? 'Submitting…' : 'Submit safety declaration'}</button></div></form></div></div>;
}

