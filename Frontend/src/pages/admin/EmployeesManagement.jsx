import { useEffect, useMemo, useState } from 'react';
import { Archive, CheckCircle2, Mail, MailCheck, Pencil, Phone, Plus, Power, Search, ShieldAlert, Users, UserCheck, UserX, X } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import StatusBadge from '../../components/common/StatusBadge';
import { apiErrorMessage, verificationApi } from '../../services/api';
import { toast } from 'sonner';
import './employees-management.css';
import './employees-address.css';

const blankForm = { fullName: '', email: '', phone: '', address: '', isActive: true };

function normalizeSriLankanPhone(value) {
  const input = value.trim();
  if (!input) return { value: '', valid: true };
  const compact = input.replace(/[\s().-]/g, '');
  const normal = compact.startsWith('0094') ? `+94${compact.slice(4)}` : compact.startsWith('0') ? `+94${compact.slice(1)}` : compact;
  return { value: normal, valid: /^\+94[1-9]\d{8}$/.test(normal) };
}

function emailDeliveryLabel(status) {
  return status === 'SENT' || status === 'DELIVERED' ? 'Sent' : status === 'FAILED' || status === 'BOUNCED' ? 'Failed' : 'Pending';
}

export default function EmployeesManagement() {
  const [employees, setEmployees] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState(null);
  const [form, setForm] = useState(blankForm);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archiving, setArchiving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const response = await verificationApi.listEmployees();
      setEmployees(response.data?.employees || []);
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Unable to load employees.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return employees;
    return employees.filter((employee) => [employee.fullName, employee.employeeCode, employee.email, employee.phone, employee.address].filter(Boolean).join(' ').toLowerCase().includes(term));
  }, [employees, query]);

  const stats = useMemo(() => ({
    total: employees.length,
    active: employees.filter((employee) => employee.isActive).length,
    inactive: employees.filter((employee) => !employee.isActive).length,
    emailSent: employees.filter((employee) => ['SENT', 'DELIVERED'].includes(employee.emailDelivery?.status)).length,
  }), [employees]);

  const openCreate = () => { setForm(blankForm); setFormError(''); setDialog('create'); };
  const openEdit = (employee) => {
    setForm({ fullName: employee.fullName || '', email: employee.email || '', phone: employee.phone || '', address: employee.address || '', isActive: employee.isActive });
    setFormError('');
    setDialog(employee);
  };
  const closeDialog = () => { if (!saving) setDialog(null); };

  const save = async (event) => {
    event.preventDefault();
    const phone = normalizeSriLankanPhone(form.phone);
    if (!form.fullName.trim() || !form.email.trim()) return setFormError('Employee name and email address are required.');
    if (!phone.valid) return setFormError('Enter a valid Sri Lankan phone number, for example +94771234567 or 0771234567.');
    setSaving(true); setFormError('');
    try {
      if (dialog === 'create') {
        const response = await verificationApi.createEmployee({ fullName: form.fullName.trim(), email: form.email.trim(), phone: phone.value, address: form.address.trim() }, globalThis.crypto.randomUUID());
        toast.success(response.data?.message || 'Employee created successfully.');
      } else {
        const response = await verificationApi.updateEmployee(dialog.id, { fullName: form.fullName.trim(), email: form.email.trim(), phone: phone.value, address: form.address.trim(), isActive: form.isActive });
        toast.success(response.data?.message || 'Employee updated successfully.');
      }
      setDialog(null);
      await load();
    } catch (error) {
      const message = apiErrorMessage(error, 'Unable to save employee.');
      setFormError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (employee) => {
    try {
      await verificationApi.updateEmployeeStatus(employee.id, !employee.isActive);
      toast.success(`Employee ${employee.isActive ? 'deactivated' : 'activated'}.`);
      await load();
    } catch (error) { toast.error(apiErrorMessage(error, 'Unable to update employee status.')); }
  };

  const resendCredentials = async (employee) => {
    try {
      await verificationApi.regenerateEmployeeAccessCode(employee.id);
      toast.success('A new access code was sent to the employee.');
      await load();
    } catch (error) { toast.error(apiErrorMessage(error, 'Unable to send a new access code.')); }
  };

  const archive = async () => {
    if (!archiveTarget) return;
    setArchiving(true);
    try {
      const response = await verificationApi.archiveEmployee(archiveTarget.id);
      toast.success(response.data?.message || 'Employee archived.');
      setArchiveTarget(null);
      await load();
    } catch (error) { toast.error(apiErrorMessage(error, 'Unable to archive employee.')); }
    finally { setArchiving(false); }
  };

  return <main className="content employees-management">
    <PageHeader title="Employees" description="Manage employee identities, credentials, and access status for your construction site." action={<button className="btn btn-primary" onClick={openCreate}><Plus size={17} />Add employee</button>} />

    <section className="employee-stat-grid" aria-label="Employee summary">
      <Metric icon={<Users />} label="Total employees" value={stats.total} tone="blue" />
      <Metric icon={<UserCheck />} label="Active employees" value={stats.active} tone="green" />
      <Metric icon={<UserX />} label="Inactive employees" value={stats.inactive} tone="orange" />
      <Metric icon={<MailCheck />} label="Credentials sent" value={stats.emailSent} tone="purple" />
    </section>

    <section className="employee-list-card" aria-labelledby="employee-list-title">
      <div className="employee-list-toolbar">
        <div><h2 id="employee-list-title">Employee directory</h2><p>Archived employees are hidden from this active directory.</p></div>
        <label className="employee-search"><Search size={17} /><span className="sr-only">Search employees</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, ID, email, phone, or address" /></label>
      </div>
      <div className="table-wrap employee-table-wrap">
        {loading ? <TableLoading /> : <table>
          <thead><tr><th>Employee</th><th>Email address</th><th>Phone number</th><th>Address</th><th>Status</th><th>Email delivery</th><th className="employee-actions-heading">Actions</th></tr></thead>
          <tbody>
            {filtered.map((employee) => <tr key={employee.id}>
              <td><div className="employee-person"><span className="employee-avatar">{employee.fullName?.slice(0, 2).toUpperCase()}</span><div><b>{employee.fullName}</b><small>{employee.employeeCode}</small></div></div></td>
              <td>{employee.email || <span className="muted">Not provided</span>}</td>
              <td>{employee.phone ? <span className="phone-cell"><Phone size={13} />{employee.phone}</span> : <span className="muted">Not provided</span>}</td>
              <td className="address-cell">{employee.address || <span className="muted">Not provided</span>}</td>
              <td><StatusBadge status={employee.isActive ? 'Active' : 'Inactive'} /></td>
              <td><StatusBadge status={emailDeliveryLabel(employee.emailDelivery?.status)} /></td>
              <td><div className="employee-actions">
                <IconButton label="Edit employee" onClick={() => openEdit(employee)}><Pencil size={15} /></IconButton>
                <IconButton label={employee.isActive ? 'Deactivate employee' : 'Activate employee'} onClick={() => changeStatus(employee)}><Power size={15} /></IconButton>
                <IconButton label="Resend credentials" onClick={() => resendCredentials(employee)}><Mail size={15} /></IconButton>
                <IconButton label="Archive employee" tone="danger" onClick={() => setArchiveTarget(employee)}><Archive size={15} /></IconButton>
              </div></td>
            </tr>)}
            {!filtered.length && <tr><td colSpan="7"><div className="employee-empty"><Users size={26} /><b>{query ? 'No matching employees' : 'No employees yet'}</b><span>{query ? 'Try a different name, ID, email, phone number, or address.' : 'Add an employee to issue their SITEPASS credentials.'}</span></div></td></tr>}
          </tbody>
        </table>}
      </div>
    </section>

    {dialog && <EmployeeDialog editing={dialog !== 'create'} form={form} setForm={setForm} error={formError} saving={saving} onClose={closeDialog} onSave={save} />}
    {archiveTarget && <ArchiveDialog employee={archiveTarget} saving={archiving} onClose={() => !archiving && setArchiveTarget(null)} onConfirm={archive} />}
  </main>;
}

function Metric({ icon, label, value, tone }) { return <article className={`employee-metric ${tone}`}><span className="employee-metric-icon">{icon}</span><div><p>{label}</p><strong>{value}</strong></div></article>; }
function IconButton({ label, tone = '', onClick, children }) { return <button type="button" className={`employee-icon-button ${tone}`} onClick={onClick} title={label} aria-label={label}>{children}</button>; }
function TableLoading() { return <div className="employee-table-loading"><span /><span /><span /><span /></div>; }

function EmployeeDialog({ editing, form, setForm, error, saving, onClose, onSave }) {
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  return <div className="employee-modal-backdrop" role="presentation"><section className="employee-modal" role="dialog" aria-modal="true" aria-labelledby="employee-dialog-title">
    <div className="employee-modal-heading"><div><span className="employee-modal-icon"><Users size={19} /></span><div><h2 id="employee-dialog-title">{editing ? 'Edit employee' : 'Add employee'}</h2><p>{editing ? 'Update employee details without changing their ID or access code.' : 'Employee ID and temporary access code will be generated and emailed.'}</p></div></div><button type="button" className="employee-close" onClick={onClose} aria-label="Close dialog"><X size={19} /></button></div>
    <form onSubmit={onSave} className="employee-form">
      <label><span>Employee name</span><input autoFocus required value={form.fullName} onChange={(event) => set('fullName', event.target.value)} placeholder="Full name" /></label>
      <label><span>Email address</span><input required type="email" value={form.email} onChange={(event) => set('email', event.target.value)} placeholder="name@example.com" /></label>
      <label><span>Phone number <em>Optional</em></span><input inputMode="tel" value={form.phone} onChange={(event) => set('phone', event.target.value)} placeholder="+94 77 123 4567" /><small>Use a Sri Lankan number in local or +94 format.</small></label>
      <label className="employee-address-field"><span>Home address <em>Optional</em></span><textarea value={form.address} onChange={(event) => set('address', event.target.value)} placeholder="Street, town, district" maxLength="500" rows="3" /></label>
      {editing && <label className="employee-status-control"><span>Employee status</span><button type="button" className={form.isActive ? 'status-toggle on' : 'status-toggle'} onClick={() => set('isActive', !form.isActive)} aria-pressed={form.isActive}><span /><b>{form.isActive ? 'Active' : 'Inactive'}</b></button></label>}
      {error && <p className="employee-form-error" role="alert"><ShieldAlert size={16} />{error}</p>}
      <div className="employee-modal-footer"><button type="button" className="btn btn-soft" onClick={onClose} disabled={saving}>Cancel</button><button className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Create employee'}</button></div>
    </form>
  </section></div>;
}

function ArchiveDialog({ employee, saving, onClose, onConfirm }) { return <div className="employee-modal-backdrop" role="presentation"><section className="employee-modal archive-modal" role="dialog" aria-modal="true" aria-labelledby="archive-dialog-title">
  <div className="archive-symbol"><Archive size={23} /></div><h2 id="archive-dialog-title">Archive employee?</h2><p><b>{employee.fullName}</b> <span>({employee.employeeCode})</span> will be removed from the active employee directory and will no longer be able to authenticate or check in.</p><p className="archive-note"><CheckCircle2 size={16} />Attendance, safety declarations, delivery history, and audit records will be preserved.</p><div className="employee-modal-footer"><button type="button" className="btn btn-soft" onClick={onClose} disabled={saving}>Cancel</button><button type="button" className="btn archive-confirm" onClick={onConfirm} disabled={saving}>{saving ? 'Archiving…' : 'Archive employee'}</button></div>
</section></div>; }
