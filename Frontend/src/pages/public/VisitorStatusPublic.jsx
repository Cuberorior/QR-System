import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Clock3, MapPin } from 'lucide-react';
import PublicLayout from '../../components/layout/PublicLayoutReal';
import { apiErrorMessage, verificationApi } from '../../services/api';
import { toast } from 'sonner';

const GPS_OPTIONS = { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 };

export default function VisitorStatusPublic() {
  const { siteId } = useParams();
  const nav = useNavigate();
  const [visit, setVisit] = useState(() => JSON.parse(sessionStorage.getItem('sitepass:lastVisitor') || 'null'));
  const [loading, setLoading] = useState(false);

  const action = async type => {
    const visitorToken = sessionStorage.getItem('sitepass:visitor-token');
    if (!visitorToken) return toast.error('Visitor authorization is unavailable.');
    if (!navigator.geolocation) return toast.error('This browser does not support location verification.');
    setLoading(true);
    navigator.geolocation.getCurrentPosition(async position => {
      try {
        const location = await verificationApi.verifyLocation({ siteCode: siteId, latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy });
        const payload = { siteCode: siteId, visitorToken, verificationToken: location.data.verificationToken };
        const response = type === 'CHECK_IN' ? await verificationApi.visitorCheckIn(payload) : await verificationApi.visitorCheckOut(payload);
        setVisit(response.data.visit);
        sessionStorage.setItem('sitepass:lastVisitor', JSON.stringify(response.data.visit));
        toast.success(type === 'CHECK_IN' ? 'Visitor checked in.' : 'Visitor checked out.');
      } catch (error) {
        toast.error(apiErrorMessage(error, 'Visitor verification failed.'));
      } finally { setLoading(false); }
    }, geoError => {
      setLoading(false);
      const message = geoError.code === 1 ? 'Location permission was denied. Enable location access and try again.' : geoError.code === 3 ? 'The location request timed out. Please retry.' : geoError.message || 'The browser could not determine your location.';
      toast.error(message);
    }, GPS_OPTIONS);
  };

  return <PublicLayout><button className="flex items-center gap-2 text-sm text-slate-500 mb-6" onClick={() => nav(`/verify/${siteId}`)}><ArrowLeft size={16} />Back to site welcome</button><div className="card p-6 sm:p-8"><div className="flex items-center gap-3"><span className="w-11 h-11 rounded-2xl bg-teal-50 grid place-items-center text-teal-600"><Clock3 /></span><div><h1 className="font-display text-2xl font-bold text-[#102a56]">Visitor registration</h1><p className="text-sm text-slate-500">Keep this browser session for your secure visit credential.</p></div></div>{visit && <div className="bg-slate-50 rounded-xl p-5 mt-6"><p className="font-bold text-[#102a56]">Reference: {visit.id}</p><p className="text-sm text-slate-500 mt-2">Approval: {visit.approvalStatus}</p><p className="text-sm text-slate-500">Visit status: {visit.visitStatus}</p></div>}<div className="mt-6 p-4 rounded-xl bg-amber-50 text-sm text-amber-900 flex gap-2"><MapPin size={18} />Every check-in and check-out requires a fresh backend GPS verification.</div>{visit?.approvalStatus === 'APPROVED' && visit.visitStatus === 'REGISTERED' && <button className="btn btn-primary w-full mt-5" disabled={loading} onClick={() => action('CHECK_IN')}>{loading ? 'Verifying location...' : 'Verify visitor check-in'}</button>}{visit?.approvalStatus === 'APPROVED' && visit.visitStatus === 'CHECKED_IN' && <button className="btn btn-primary w-full mt-5" disabled={loading} onClick={() => action('CHECK_OUT')}>{loading ? 'Verifying location...' : 'Verify visitor check-out'}</button>}</div></PublicLayout>;
}
