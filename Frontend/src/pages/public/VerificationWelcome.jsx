import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Building2, CheckCircle2, ChevronRight, CircleCheck, HardHat, Loader2, MapPin, Navigation, ScanLine, ShieldAlert, ShieldCheck, UserRoundPlus } from 'lucide-react';
import PublicLayout from '../../components/layout/PublicLayoutReal';
import { apiErrorMessage, verificationApi } from '../../services/api';
import { saveVerificationSession } from '../../services/verificationSession';

export default function VerificationWelcome() {
  const { siteId, action } = useParams();
  const nav = useNavigate();
  const [site, setSite] = useState();
  const [status, setStatus] = useState('welcome');
  const [error, setError] = useState('');
  const validAction = action === 'entry' || action === 'exit';
  const isEntry = action === 'entry';

  useEffect(() => {
    verificationApi.getSite(siteId).then(({ data }) => setSite(data.data || data.site || data)).catch(() => setSite(null));
  }, [siteId]);

  const verify = () => {
    setStatus('loading');
    setError('');
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by this browser.');
      setStatus('error');
      return;
    }
    navigator.geolocation.getCurrentPosition(async position => {
      try {
        const { data } = await verificationApi.verifyLocation({ siteCode: siteId, latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy });
        saveVerificationSession({ siteId, verificationToken: data.verificationToken, expiresAt: data.expiresAt, distanceMeters: data.distanceMeters });
        setStatus('success');
      } catch (requestError) {
        setError(apiErrorMessage(requestError, 'Location verification failed.'));
        setStatus('error');
      }
    }, geoError => {
      setError(geoError.message || 'Location permission is required.');
      setStatus('error');
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  };

  if (!validAction) return <PublicLayout><div className="card p-8 text-center"><h1 className="font-display text-2xl font-bold text-[#102a56]">Invalid access link</h1><p className="text-slate-500 mt-2">Use the official SITEPASS QR code provided by your administrator.</p></div></PublicLayout>;
  if (site === undefined) return <PublicLayout><div className="card p-8 text-center text-slate-500">Loading site details…</div></PublicLayout>;
  if (!site || site.isActive === false) return <PublicLayout><div className="card p-8 text-center"><h1 className="font-display text-2xl font-bold text-[#102a56]">Site unavailable</h1><p className="text-slate-500 mt-2">This QR code is no longer active.</p></div></PublicLayout>;

  const actionLabel = isEntry ? 'Entry' : 'Exit';
  const accessChoices = <section className="site-welcome__choices" aria-labelledby="access-type-heading"><div className="site-welcome__section-heading"><div><p className="site-welcome__eyebrow">Step 2 of 2</p><h2 id="access-type-heading">Choose your access type</h2></div><CircleCheck size={22} aria-hidden="true"/></div><button type="button" onClick={() => nav(`/verify/${siteId}/${action}/employee`)} className="site-welcome__choice site-welcome__choice--employee"><span className="site-welcome__choice-icon"><HardHat size={23}/></span><span className="site-welcome__choice-copy"><strong>Employee</strong><small>Verify your credentials and record {isEntry ? 'attendance' : 'your exit'}.</small></span><ChevronRight size={21} aria-hidden="true"/></button><button type="button" onClick={() => nav(`/verify/${siteId}/${action}/visitor`)} className="site-welcome__choice site-welcome__choice--visitor"><span className="site-welcome__choice-icon"><UserRoundPlus size={23}/></span><span className="site-welcome__choice-copy"><strong>Visitor</strong><small>{isEntry ? 'Register your visit and complete the safety requirements.' : 'Verify your visitor credentials to exit.'}</small></span><ChevronRight size={21} aria-hidden="true"/></button></section>;

  return <PublicLayout><section className="site-welcome"><div className="site-welcome__hero"><div className="site-welcome__orbit site-welcome__orbit--one"/><div className="site-welcome__orbit site-welcome__orbit--two"/><div className="site-welcome__topline"><span><ShieldCheck size={15}/>Secure site access</span><span className={`site-welcome__action-chip ${isEntry ? 'is-entry' : 'is-exit'}`}><ScanLine size={14}/>{actionLabel} QR</span></div><div className="site-welcome__mark"><Building2 size={31}/></div><p className="site-welcome__eyebrow">Welcome to</p><h1>SITE<span>PASS</span></h1><p className="site-welcome__lead">A secure, simple way to manage construction-site access for everyone.</p><div className="site-welcome__site"><span className="site-welcome__site-icon"><MapPin size={19}/></span><span><strong>{site.name}</strong><small>{site.location || 'Construction site'}</small></span><span className="site-welcome__site-code">{site.siteCode || siteId}</span></div><div className="site-welcome__trust"><span><ShieldCheck size={17}/>Secure</span><span><Navigation size={17}/>Location checked</span><span><CheckCircle2 size={17}/>Quick access</span></div></div>{(status === 'welcome' || site.geofencingEnabled === false) && <div className="site-welcome__panel">{site.geofencingEnabled === false ? <><div className="site-welcome__panel-icon is-warning"><ShieldAlert size={23}/></div><div><h2>Ready to continue</h2><p>Location verification is not required for this site.</p></div>{accessChoices}</> : <><div className="site-welcome__panel-icon"><Navigation size={23}/></div><div><h2>Start secure verification</h2><p>Allow location access to confirm that you are at the correct site.</p></div><button className="btn btn-primary site-welcome__primary" onClick={verify}><Navigation size={18}/>Verify my location<ArrowRight size={17}/></button><p className="site-welcome__privacy"><ShieldCheck size={15}/>Your location is used only to verify this access request.</p></>}</div>}{status === 'loading' && <div className="site-welcome__panel site-welcome__status"><Loader2 className="animate-spin text-teal-600" size={33}/><h2>Verifying your location</h2><p>Please keep this page open while we securely check the site boundary.</p></div>}{status === 'error' && <div className="site-welcome__panel site-welcome__status is-error"><div className="site-welcome__panel-icon is-error"><ShieldAlert size={23}/></div><h2>Location verification needs attention</h2><p>{error}</p><button className="btn btn-primary site-welcome__primary" onClick={verify}><Navigation size={18}/>Try again</button></div>}{status === 'success' && <><div className="site-welcome__verified"><span><CheckCircle2 size={24}/></span><div><p>Location verified</p><strong>You’re ready to continue.</strong></div></div>{accessChoices}</>}</section></PublicLayout>;
}
