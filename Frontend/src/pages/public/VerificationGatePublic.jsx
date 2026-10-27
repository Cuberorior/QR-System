import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Crosshair, HardHat, Loader2, MapPin, Navigation, RefreshCw, ShieldAlert, UserRoundPlus, ArrowRight } from 'lucide-react';
import PublicLayout from '../../components/layout/PublicLayoutReal';
import { apiErrorMessage, verificationApi } from '../../services/api';
import { saveVerificationSession } from '../../services/verificationSession';

const GPS_OPTIONS = { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 };

function browserLocationError(geoError) {
  if (geoError.code === 1) return { code: 'PERMISSION_DENIED', message: 'Location permission was denied. Enable location access for this site and try again.' };
  if (geoError.code === 3) return { code: 'TIMEOUT', message: 'The location request timed out. Move to an open area and try again.' };
  return { code: 'POSITION_UNAVAILABLE', message: geoError.message || 'The browser could not determine your location.' };
}

export default function VerificationGatePublic() {
  const { siteId } = useParams();
  const nav = useNavigate();
  const [site, setSite] = useState();
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    let cancelled = false;
    verificationApi.getSite(siteId).then(({ data }) => { if (!cancelled) setSite(data.data || data.site || data); }).catch(() => { if (!cancelled) setSite(null); });
    return () => { cancelled = true; };
  }, [siteId]);

  const verify = () => {
    setStatus('loading');
    setError(null);
    if (!navigator.geolocation) {
      setError({ code: 'POSITION_UNAVAILABLE', message: 'Location is not supported by this browser.' });
      setStatus('error');
      return;
    }
    navigator.geolocation.getCurrentPosition(async position => {
      const accuracy = position.coords.accuracy;
      try {
        const { data } = await verificationApi.verifyLocation({ siteCode: siteId, latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy });
        const session = { siteId, verificationToken: data.verificationToken, expiresAt: data.expiresAt, distanceMeters: data.distanceMeters };
        saveVerificationSession(session);
        setResult(session);
        setStatus('success');
      } catch (requestError) {
        setError({ code: requestError.response?.data?.errorCode || 'BACKEND_VALIDATION_FAILED', message: apiErrorMessage(requestError), accuracy });
        setStatus('error');
      }
    }, geoError => {
      setError(browserLocationError(geoError));
      setStatus('error');
    }, GPS_OPTIONS);
  };

  if (site === undefined) return <PublicLayout><div className="card p-8 text-center text-slate-500">Loading site details...</div></PublicLayout>;
  if (site === null || site.isActive === false) return <PublicLayout><div className="card p-8 text-center"><AlertTriangle className="mx-auto text-red-500" /><h1 className="font-display text-2xl font-bold mt-4">Site unavailable</h1><p className="text-slate-500 mt-2">This verification link is inactive or invalid.</p></div></PublicLayout>;

  const errorTitle = { PERMISSION_DENIED: 'Location Permission Required', TIMEOUT: 'Location Request Timed Out', POSITION_UNAVAILABLE: 'Location Unavailable', OUTSIDE_GEOFENCE: 'Outside Site Geofence', POOR_ACCURACY: 'GPS Accuracy Insufficient' }[error?.code] || 'Location Verification Failed';
  const errorMessage = error?.code === 'PERMISSION_DENIED' ? 'Enable location permission for this site in your browser settings, then try again.' : error?.code === 'TIMEOUT' ? 'Move to an open area and try again so your phone can obtain a fresh GPS reading.' : error?.code === 'POSITION_UNAVAILABLE' ? 'Your browser could not determine a location. Check GPS and network access, then retry.' : error?.code === 'OUTSIDE_GEOFENCE' ? 'You are outside the permitted construction site area. Please move closer to the site entrance and try again.' : error?.code === 'POOR_ACCURACY' ? `Your GPS accuracy is ${Math.round(error.accuracy)} meters. Move to an open area and request a fresh reading.` : error?.message;

  return <PublicLayout site={site}><div className="mb-7"><p className="text-sm font-semibold text-teal-600 uppercase tracking-widest">{site.name}</p><div className="flex gap-4 text-sm text-slate-500 mt-3"><span className="flex gap-1 items-center"><MapPin size={15} />{site.location || 'Construction site'}</span><span className="badge badge-blue">Site ID: {site.siteCode || site.id}</span></div></div><div className="mb-7"><h1 className="font-display text-4xl sm:text-5xl font-bold text-[#102a56] leading-tight">Verify Your<br /><span className="text-teal-600">Location</span></h1><p className="text-slate-500 mt-4 text-lg">To continue, please allow location access. You must be physically near the construction site.</p></div>{status === 'success' ? <div><div className="card p-6 sm:p-8 text-center border-emerald-200"><CheckCircle2 size={64} className="mx-auto text-emerald-500" /><h2 className="font-display text-2xl font-bold text-[#102a56] mt-5">Location Verified Successfully</h2><div className="text-left bg-emerald-50 rounded-xl p-4 mt-6 space-y-2 text-sm"><p><span className="text-slate-500">Site</span><strong className="float-right">{site.name}</strong></p><p><span className="text-slate-500">Status</span><strong className="float-right text-emerald-700">Authorized</strong></p>{result.distanceMeters != null && <p><span className="text-slate-500">Approx. distance</span><strong className="float-right">{Math.round(result.distanceMeters)} m</strong></p>}</div></div><div className="space-y-4 mt-5"><button onClick={() => nav(`/verify/${siteId}/employee`)} className="card w-full p-5 text-left hover:shadow-lg transition flex gap-4 items-center"><HardHat /><span className="flex-1"><strong className="block text-lg text-[#102a56]">Registered Employee</strong><span className="text-sm text-slate-500">Verify identity and record entry or exit.</span></span><ArrowRight className="text-slate-400" /></button><button onClick={() => nav(`/verify/${siteId}/visitor`)} className="card w-full p-5 text-left hover:shadow-lg transition flex gap-4 items-center"><UserRoundPlus /><span className="flex-1"><strong className="block text-lg text-[#102a56]">New Visitor</strong><span className="text-sm text-slate-500">Visitor registration requires backend support.</span></span><ArrowRight className="text-slate-400" /></button></div></div> : status === 'error' ? <div className="card p-7 text-center border-red-200"><div className="w-16 h-16 rounded-full bg-red-50 text-red-500 grid place-items-center mx-auto"><MapPin size={32} /></div><h2 className="font-display text-2xl font-bold text-[#102a56] mt-5">{errorTitle}</h2><p className="text-slate-500 mt-2">{errorMessage}</p><button className="btn btn-primary w-full mt-6" onClick={verify}><RefreshCw size={17} />Retry Location Verification</button></div> : <div className="card p-6 sm:p-8"><div className="w-16 h-16 rounded-2xl bg-teal-50 text-teal-600 grid place-items-center"><Crosshair size={32} /></div><h2 className="font-display text-2xl font-bold text-[#102a56] mt-5">Location verification required</h2><p className="text-slate-500 mt-2">Coordinates are validated by the backend. We do not store GPS data permanently in this browser.</p><button className="btn btn-primary w-full mt-7" onClick={verify} disabled={status === 'loading'}>{status === 'loading' ? <><Loader2 className="animate-spin" size={17} />Checking location...</> : <><Navigation size={17} />Verify My Location</>}</button><p className="text-xs text-slate-400 mt-4 flex gap-2"><ShieldAlert size={14} />Location permission is required. GPS spoofing cannot be fully detected by a browser.</p></div>}</PublicLayout>;
}
