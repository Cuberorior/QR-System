import { useEffect, useState } from 'react';
import { Building2, MapPin, Save, ShieldCheck } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import StatusBadge from '../../components/common/StatusBadge';
import { mockApi } from '../../mock/store';
import { toast } from 'sonner';

export default function SitesSecure() {
  const [site, setSite] = useState();
  const [form, setForm] = useState();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadSite() {
      try {
        const data = await mockApi.getGeofence('SITE-CMB-01');
        if (!cancelled) { setSite(data); setForm(data); }
      } catch (error) {
        if (!cancelled) toast.error(error.message || 'Unable to load site settings.');
      }
    }
    loadSite();
    return () => { cancelled = true; };
  }, []);

  if (!form) return <main className="content"><div className="card p-8 text-slate-500">Loading site settings…</div></main>;
  const update = (event) => setForm({ ...form, [event.target.name]: event.target.type === 'checkbox' ? event.target.checked : event.target.value });
  const save = async (event) => { event.preventDefault(); setSaving(true); try { const updated = await mockApi.updateGeofence(form.id, { name: form.name, latitude: Number(form.latitude), longitude: Number(form.longitude), radius: Number(form.radius), geofencingEnabled: form.geofencingEnabled, status: form.status }); setSite(updated); setForm(updated); toast.success('Geofence settings saved.'); } catch (error) { toast.error(error.message); } finally { setSaving(false); } };
  return <main className="content"><PageHeader title="Construction sites" description="Manage sites, administrators, and backend-enforced verification access."/><div className="grid xl:grid-cols-[1fr_1.2fr] gap-5"><div className="card p-6"><div className="flex justify-between"><span className="w-11 h-11 rounded-xl bg-blue-50 text-[#102a56] grid place-items-center"><Building2/></span><StatusBadge status={form.status}/></div><h2 className="font-display text-xl font-bold text-[#102a56] mt-6">{form.name}</h2><p className="text-sm text-slate-500 flex items-center gap-1 mt-2"><MapPin size={15}/>{form.location}</p><div className="border-t border-slate-100 mt-5 pt-4 text-sm"><span className="text-slate-400">Site ID</span><p className="font-semibold mt-1">{form.id}</p></div><div className="mt-6 rounded-xl bg-slate-100 h-44 relative overflow-hidden"><div className="absolute inset-0 opacity-40" style={{backgroundImage:'linear-gradient(#cbd5e1 1px, transparent 1px),linear-gradient(90deg,#cbd5e1 1px,transparent 1px)',backgroundSize:'28px 28px'}}/><div className="absolute inset-0 grid place-items-center"><div className="rounded-full border-4 border-teal-400/50 bg-teal-300/30 grid place-items-center" style={{width:Math.min(160,Math.max(80,form.radius/2)),height:Math.min(160,Math.max(80,form.radius/2))}}><MapPin className="text-[#102a56]"/></div></div><span className="absolute bottom-3 left-3 badge badge-blue">Preview · {form.radius} m radius</span></div></div><div className="card p-6"><div className="flex items-start gap-3 mb-6"><ShieldCheck className="text-teal-600"/><div><h2 className="font-bold text-[#102a56]">Geofence settings</h2><p className="text-sm text-slate-500 mt-1">Only authorized administrators can edit these backend validation inputs.</p></div></div><form onSubmit={save} className="grid sm:grid-cols-2 gap-4"><Field label="Site Name" name="name" value={form.name} onChange={update}/><Field label="Site ID" name="id" value={form.id} onChange={()=>{}} disabled/><Field label="Latitude" name="latitude" value={form.latitude} onChange={update} type="number" step="any"/><Field label="Longitude" name="longitude" value={form.longitude} onChange={update} type="number" step="any"/><Field label="Allowed Radius (metres)" name="radius" value={form.radius} onChange={update} type="number" min="10"/><label className="block"><span className="text-sm font-semibold">Site Status</span><select className="field mt-2" name="status" value={form.status} onChange={update}><option>Active</option><option>Inactive</option></select></label><label className="flex items-center gap-3 sm:col-span-2 p-4 rounded-xl bg-slate-50"><input type="checkbox" name="geofencingEnabled" checked={form.geofencingEnabled} onChange={update} className="h-4 w-4 accent-teal-600"/><span><strong className="block text-sm">Geofencing enabled</strong><small className="text-slate-500">Backend must reject location verification when disabled.</small></span></label><button className="btn btn-primary sm:col-span-2" disabled={saving}><Save size={16}/>{saving?'Saving…':'Save geofence settings'}</button></form></div></div></main>;
}
function Field({label,...props}){return <label className="block"><span className="text-sm font-semibold">{label}</span><input className="field mt-2" {...props}/></label>}
