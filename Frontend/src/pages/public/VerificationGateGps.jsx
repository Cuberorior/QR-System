import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { HardHat, ShieldAlert, UserRoundPlus, ArrowRight } from 'lucide-react';
import PublicLayout from '../../components/layout/PublicLayoutReal';
import { verificationApi } from '../../services/api';
import VerificationGateReal from './VerificationGateReal';

export default function VerificationGateGps() {
  const { siteId } = useParams(); const nav = useNavigate(); const [site, setSite] = useState();
  useEffect(() => { verificationApi.getSite(siteId).then(({ data }) => setSite(data.data || data.site || data)).catch(() => setSite(null)); }, [siteId]);
  if (site === undefined) return <PublicLayout><div className="card p-8 text-center text-slate-500">Loading site details…</div></PublicLayout>;
  if (site === null || site.isActive === false || site.geofencingEnabled !== false) return <VerificationGateReal />;
  return <PublicLayout site={site}><div className="card p-7 text-center"><ShieldAlert size={48} className="mx-auto text-amber-500"/><h1 className="font-display text-3xl font-bold text-[#102a56] mt-5">GPS verification is disabled</h1><p className="text-slate-500 mt-3">GPS verification is disabled for this site.</p><div className="space-y-4 mt-7"><button onClick={() => nav(`/verify/${siteId}/employee`)} className="card w-full p-5 text-left flex gap-4 items-center"><HardHat/><span className="flex-1"><strong className="block text-lg text-[#102a56]">Registered Employee</strong><span className="text-sm text-slate-500">Continue to identity verification.</span></span><ArrowRight /></button><button onClick={() => nav(`/verify/${siteId}/visitor`)} className="card w-full p-5 text-left flex gap-4 items-center"><UserRoundPlus/><span className="flex-1"><strong className="block text-lg text-[#102a56]">New Visitor</strong><span className="text-sm text-slate-500">Continue to visitor authorization.</span></span><ArrowRight /></button></div></div></PublicLayout>;
}
