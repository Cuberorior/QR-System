import { useEffect, useState } from 'react';
import { Clock3, LockKeyhole, Mail, Phone, Save, ShieldCheck, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import PageHeader from '../../components/common/PageHeader';
import { apiErrorMessage, verificationApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

const LOCK_OPTIONS = [
  { value: 5, label: '5 minutes' },
  { value: 10, label: '10 minutes' },
  { value: 15, label: '15 minutes' },
  { value: 30, label: '30 minutes' },
  { value: 60, label: '1 hour' },
  { value: 0, label: 'Never' },
];

const lockStorageKey = userId => `sitepass:screen-lock-minutes:${userId}`;
const storedLockMinutes = userId => {
  const value = Number(localStorage.getItem(lockStorageKey(userId)));
  return LOCK_OPTIONS.some(option => option.value === value) ? value : 15;
};

export default function Settings() {
  const { user, updateUser } = useAuth();
  const [profile, setProfile] = useState({ fullName: user?.fullName || '', email: user?.email || '', phone: user?.phone || '' });
  const [password, setPassword] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [lockMinutes, setLockMinutes] = useState(() => storedLockMinutes(user?.id || 'admin'));
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    let active = true;
    verificationApi.getAdminProfile()
      .then(({ data }) => {
        if (active && data.administrator) {
          setProfile({ fullName: data.administrator.fullName, email: data.administrator.email, phone: data.administrator.phone || '' });
          updateUser(data.administrator);
        }
      })
      .catch(error => { if (active) toast.error(apiErrorMessage(error, 'Unable to load your profile.')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [updateUser]);

  const saveProfile = async event => {
    event.preventDefault();
    setSavingProfile(true);
    try {
      const { data } = await verificationApi.updateAdminProfile(profile);
      updateUser(data.administrator);
      setProfile({ fullName: data.administrator.fullName, email: data.administrator.email, phone: data.administrator.phone || '' });
      toast.success('Profile updated successfully.');
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Unable to update your profile.'));
    } finally {
      setSavingProfile(false);
    }
  };

  const changePassword = async event => {
    event.preventDefault();
    if (password.newPassword !== password.confirmPassword) {
      toast.error('New password and confirmation do not match.');
      return;
    }
    setSavingPassword(true);
    try {
      await verificationApi.changeAdminPassword({ currentPassword: password.currentPassword, newPassword: password.newPassword });
      setPassword({ currentPassword: '', newPassword: '', confirmPassword: '' });
      toast.success('Password changed successfully.');
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Unable to change your password.'));
    } finally {
      setSavingPassword(false);
    }
  };

  const saveLockSetting = event => {
    const value = Number(event.target.value);
    setLockMinutes(value);
    localStorage.setItem(lockStorageKey(user?.id || 'admin'), String(value));
    window.dispatchEvent(new Event('sitepass:screen-lock-updated'));
    toast.success(value ? `Screen lock set to ${LOCK_OPTIONS.find(option => option.value === value)?.label}.` : 'Screen lock disabled.');
  };

  return <main className="content">
    <PageHeader title="Settings" description="Manage your administrator profile and security preferences." />
    {loading ? <div className="card p-6 text-slate-500">Loading settings...</div> : <div className="grid xl:grid-cols-2 gap-5">
      <section className="card p-6">
        <div className="flex items-start gap-3"><span className="w-11 h-11 rounded-xl bg-blue-50 text-[#102a56] grid place-items-center"><UserRound size={21} /></span><div><h2 className="font-bold text-[#102a56]">Profile</h2><p className="text-sm text-slate-500 mt-1">Update the administrator contact details shown to employees.</p></div></div>
        <form className="mt-6 space-y-4" onSubmit={saveProfile}>
          <label className="block"><span className="text-sm font-semibold">Full name</span><input required minLength="2" maxLength="120" className="field mt-2" value={profile.fullName} onChange={event => setProfile({ ...profile, fullName: event.target.value })} /></label>
          <label className="block"><span className="text-sm font-semibold">Email address</span><div className="relative mt-2"><Mail size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" /><input required type="email" maxLength="191" className="field !pl-11" value={profile.email} onChange={event => setProfile({ ...profile, email: event.target.value })} /></div></label>
          <label className="block"><span className="text-sm font-semibold">Phone number</span><div className="relative mt-2"><Phone size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" /><input type="tel" inputMode="tel" maxLength="50" className="field !pl-11" placeholder="+94 757 949 092" value={profile.phone} onChange={event => setProfile({ ...profile, phone: event.target.value })} /></div><p className="text-xs text-slate-400 mt-2">Use a country code so employees can contact you.</p></label>
          <button className="btn btn-primary" disabled={savingProfile}><Save size={16} />{savingProfile ? 'Saving...' : 'Save profile'}</button>
        </form>
      </section>

      <section className="card p-6">
        <div className="flex items-start gap-3"><span className="w-11 h-11 rounded-xl bg-orange-50 text-orange-600 grid place-items-center"><LockKeyhole size={21} /></span><div><h2 className="font-bold text-[#102a56]">Change password</h2><p className="text-sm text-slate-500 mt-1">Use at least 12 characters for your new password.</p></div></div>
        <form className="mt-6 space-y-4" onSubmit={changePassword}>
          <label className="block"><span className="text-sm font-semibold">Current password</span><input required type="password" autoComplete="current-password" className="field mt-2" value={password.currentPassword} onChange={event => setPassword({ ...password, currentPassword: event.target.value })} /></label>
          <label className="block"><span className="text-sm font-semibold">New password</span><input required minLength="12" type="password" autoComplete="new-password" className="field mt-2" value={password.newPassword} onChange={event => setPassword({ ...password, newPassword: event.target.value })} /></label>
          <label className="block"><span className="text-sm font-semibold">Confirm new password</span><input required minLength="12" type="password" autoComplete="new-password" className="field mt-2" value={password.confirmPassword} onChange={event => setPassword({ ...password, confirmPassword: event.target.value })} /></label>
          <button className="btn btn-primary" disabled={savingPassword}><ShieldCheck size={16} />{savingPassword ? 'Updating...' : 'Change password'}</button>
        </form>
      </section>

      <section className="card p-6 xl:col-span-2">
        <div className="flex items-start gap-3"><span className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 grid place-items-center"><Clock3 size={21} /></span><div><h2 className="font-bold text-[#102a56]">Screen lock</h2><p className="text-sm text-slate-500 mt-1">Automatically sign out after inactivity to protect administrator data.</p></div></div>
        <div className="mt-6 max-w-md"><label className="block"><span className="text-sm font-semibold">Lock after inactivity</span><select className="field mt-2" value={lockMinutes} onChange={saveLockSetting}>{LOCK_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><p className="text-xs text-slate-400 mt-3">This preference is saved in this browser for your administrator account. Any mouse, keyboard, touch, or pointer activity resets the timer.</p></div>
      </section>
    </div>}
  </main>;
}
