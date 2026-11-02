import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ChartNoAxesColumnIncreasing, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail, ShieldCheck, Users } from 'lucide-react';
import Brand from '../../components/common/Brand';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'sonner';
import constructionImage from '../../assets/sitepass-login-construction.png';
import './admin-login.css';

export default function AdminLoginReal() {
  const [form, setForm] = useState({ email: '', password: '' });
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAuth();
  const nav = useNavigate();

  const submit = async (event) => {
    event.preventDefault();
    if (loading) return;
    setError('');
    setLoading(true);
    try {
      await login(form);
      toast.success('Signed in successfully');
      nav('/admin/dashboard');
    } catch (failure) {
      setError(failure.message || 'Unable to sign in. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="sitepass-login">
      <section className="login-story" aria-labelledby="login-story-title">
        <img className="login-construction" src={constructionImage} alt="" fetchpriority="high" />
        <div className="login-story-shade" aria-hidden="true" />
        <div className="login-orange-top" aria-hidden="true" />
        <div className="login-orange-bottom" aria-hidden="true" />
        <div className="login-story-content">
          <div className="login-brand"><Brand light /></div>
          <div className="login-story-copy">
            <p className="login-eyebrow">Construction workforce operations</p>
            <h1 id="login-story-title">Manage your <br />construction site <br />with <span>confidence.</span></h1>
            <p className="login-story-description">Secure, centralized administration for people, access, and presence at your construction site.</p>
            <ul className="login-features">
              <li><span><Users aria-hidden="true" /></span><p>Manage<br />workforce</p></li>
              <li><span><ShieldCheck aria-hidden="true" /></span><p>Control<br />site access</p></li>
              <li><span><ChartNoAxesColumnIncreasing aria-hidden="true" /></span><p>Track<br />site presence</p></li>
            </ul>
          </div>
        </div>
      </section>

      <section className="login-form-panel" aria-labelledby="login-title">
        <div className="login-mobile-brand"><Brand /></div>
        <div className="login-card">
          <span className="login-lock-icon"><LockKeyhole size={30} strokeWidth={1.8} aria-hidden="true" /></span>
          <h2 id="login-title">Welcome back</h2>
          <p className="login-intro">Sign in to your SITEPASS administrator account to securely manage your construction site.</p>

          <form onSubmit={submit} className="login-form" aria-busy={loading}>
            <div className="login-field-group">
              <label htmlFor="admin-email"><Mail size={19} aria-hidden="true" />Email address</label>
              <input id="admin-email" name="email" required type="email" autoComplete="username" placeholder="Enter your email address" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} disabled={loading} />
            </div>
            <div className="login-field-group">
              <label htmlFor="admin-password"><LockKeyhole size={19} aria-hidden="true" />Password</label>
              <div className="login-password-field">
                <input id="admin-password" name="password" required type={show ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter your password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} disabled={loading} />
                <button type="button" className="login-password-toggle" aria-label={show ? 'Hide password' : 'Show password'} aria-controls="admin-password" aria-pressed={show} onClick={() => setShow(!show)} disabled={loading}>
                  {show ? <EyeOff size={21} /> : <Eye size={21} />}
                </button>
              </div>
            </div>
            {error && <p className="login-error" role="alert">{error}</p>}
            <button className="login-submit" type="submit" disabled={loading}>
              {loading ? <><LoaderCircle className="login-spinner" size={20} aria-hidden="true" />Signing in...</> : <>Sign in <ArrowRight size={21} aria-hidden="true" /></>}
            </button>
          </form>

          <div className="login-security-note">
            <ShieldCheck size={30} strokeWidth={1.8} aria-hidden="true" />
            <p>Secure administrator access.<br />Use your assigned SITEPASS account to sign in.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
