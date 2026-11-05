import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Archive, CheckCircle2, Download, Eye, FileText, IdCard, Mail, MailCheck, Pencil, Phone, Plus, Power, Search, ShieldAlert, Trash2, Upload, Users, UserCheck, UserX, X } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import StatusBadge from '../../components/common/StatusBadge';
import SiteSelector, { savedSiteCode } from '../../components/common/SiteSelector';
import { apiErrorMessage, verificationApi } from '../../services/api';
import { toast } from 'sonner';
import { countWords, validateEmployeeForm } from '../../services/employeeValidation';
import './employees-management.css';
import './employees-address.css';
import './employee-documents.css';

const blankForm = { fullName: '', email: '', phone: '', address: '', siteCode: '', isActive: true };
const blankDocumentForm = { documentType: 'WORKER_ID', documentName: 'Worker ID', expiresAt: '', file: null };
const DOCUMENT_LABELS = { WORKER_ID: 'Worker ID', MEDICAL: 'Medical certificate', INSURANCE: 'Insurance', OTHER: 'Other document' };

function emailDeliveryLabel(status) {
  return status === 'SENT' || status === 'DELIVERED' ? 'Sent' : status === 'FAILED' || status === 'BOUNCED' ? 'Failed' : 'Pending';
}

export default function EmployeesManagement() {
  const [employees, setEmployees] = useState([]);
  const [sites, setSites] = useState([]);
  const [siteCode, setSiteCode] = useState(savedSiteCode);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState(null);
  const [form, setForm] = useState(blankForm);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archiving, setArchiving] = useState(false);
  const [editConfirmation, setEditConfirmation] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState(null);
  const [deactivating, setDeactivating] = useState(false);
  const [documentTarget, setDocumentTarget] = useState(null);
  const loadRequest = useRef(0);

  const load = async () => {
    const request = ++loadRequest.current;
    setLoading(true);
    try {
      const [response, siteResponse] = await Promise.all([verificationApi.listEmployees(siteCode), verificationApi.listSites()]);
      if (request !== loadRequest.current) return;
      setEmployees(response.data?.employees || []); setSites(siteResponse.data?.sites || []);
    } catch (error) {
      if (request === loadRequest.current) toast.error(apiErrorMessage(error, 'Unable to load employees.'));
    } finally {
      if (request === loadRequest.current) setLoading(false);
    }
  };

  useEffect(() => { load(); }, [siteCode]);

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

  const openCreate = () => { setForm({ ...blankForm, siteCode }); setFormError(''); setSubmitted(false); setDialog('create'); };
  const openEdit = (employee) => {
    setForm({ fullName: employee.fullName || '', email: employee.email || '', phone: employee.phone || '', address: employee.address || '', siteCode: employee.site?.siteCode || '', isActive: employee.isActive });
    setFormError('');
    setSubmitted(false);
    setDialog(employee);
  };
  const closeDialog = () => { if (!saving) setDialog(null); };

  const persistEmployee = async (data) => {
    setSaving(true); setFormError('');
    try {
      if (dialog === 'create') {
        const response = await verificationApi.createEmployee(data, globalThis.crypto.randomUUID());
        toast.success(response.data?.message || 'Employee created successfully.');
      } else {
        const response = await verificationApi.updateEmployee(dialog.id, { fullName: data.fullName, email: data.email, phone: data.phone, address: data.address, isActive: form.isActive });
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

  const save = (event) => {
    event.preventDefault();
    if (saving) return;
    setSubmitted(true);
    const { errors, data } = validateEmployeeForm(form, sites, dialog !== 'create');
    if (Object.keys(errors).length) {
      const formElement = event.currentTarget;
      requestAnimationFrame(() => formElement.querySelector('[aria-invalid="true"]')?.focus());
      return setFormError('Please correct the highlighted fields.');
    }
    if (dialog !== 'create') return setEditConfirmation(true);
    persistEmployee(data);
  };

  const changeStatus = async (employee) => {
    try {
      await verificationApi.updateEmployeeStatus(employee.id, !employee.isActive);
      toast.success(`Employee ${employee.isActive ? 'deactivated' : 'activated'}.`);
      await load();
    } catch (error) { toast.error(apiErrorMessage(error, 'Unable to update employee status.')); }
  };
  const requestStatusChange = (employee) => employee.isActive ? setDeactivateTarget(employee) : changeStatus(employee);
  const deactivate = async () => {
    if (!deactivateTarget) return;
    setDeactivating(true);
    try {
      await verificationApi.updateEmployeeStatus(deactivateTarget.id, false);
      toast.success('Employee deactivated.');
      setDeactivateTarget(null);
      await load();
    } catch (error) { toast.error(apiErrorMessage(error, 'Unable to deactivate employee.')); }
    finally { setDeactivating(false); }
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

  const openDocuments = (employee) => setDocumentTarget({ employee, documents: [], loading: true });
  const closeDocuments = () => setDocumentTarget(null);
  const loadDocuments = async (employeeId) => {
    try {
      const response = await verificationApi.listEmployeeDocuments(employeeId);
      setDocumentTarget(current => current?.employee.id === employeeId ? { ...current, documents: response.data?.documents || [], loading: false } : current);
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Unable to load employee documents.'));
      setDocumentTarget(current => current?.employee.id === employeeId ? { ...current, loading: false } : current);
    }
  };
  useEffect(() => { if (documentTarget?.loading) loadDocuments(documentTarget.employee.id); }, [documentTarget?.employee.id, documentTarget?.loading]);

  return <main className="content employees-management">
    <PageHeader title="Employees" description="Manage employee identities, credentials, and access status across authorized construction sites." action={<button className="btn btn-primary" onClick={openCreate}><Plus size={17} />Add employee</button>} />

    <section className="employee-stat-grid" aria-label="Employee summary">
      <Metric icon={<Users />} label="Total employees" value={stats.total} tone="blue" />
      <Metric icon={<UserCheck />} label="Active employees" value={stats.active} tone="green" />
      <Metric icon={<UserX />} label="Inactive employees" value={stats.inactive} tone="orange" />
      <Metric icon={<MailCheck />} label="Credentials sent" value={stats.emailSent} tone="purple" />
    </section>

    <section className="employee-list-card" aria-labelledby="employee-list-title">
      <div className="employee-list-toolbar">
        <div><h2 id="employee-list-title">Employee directory</h2><p>Archived employees are hidden from this active directory.</p></div>
        <div className="flex flex-wrap gap-3 items-center"><label className="min-w-[220px]"><span className="sr-only">Construction site</span><SiteSelector sites={sites} value={siteCode} onChange={setSiteCode}/></label><label className="employee-search"><Search size={17} /><span className="sr-only">Search employees</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, ID, email, phone, or address" /></label></div>
      </div>
      <div className="table-wrap employee-table-wrap">
        {loading ? <TableLoading /> : <table>
          <colgroup><col className="employee-col-person"/><col className="employee-col-site"/><col className="employee-col-email"/><col className="employee-col-phone"/><col className="employee-col-address"/><col className="employee-col-status"/><col className="employee-col-delivery"/><col className="employee-col-actions"/></colgroup>
          <thead><tr><th>Employee</th><th>Site</th><th>Email address</th><th>Phone number</th><th>Address</th><th>Status</th><th>Email delivery</th><th className="employee-actions-heading">Actions</th></tr></thead>
          <tbody>
            {filtered.map((employee) => <tr key={employee.id}>
              <td><div className="employee-person"><span className="employee-avatar">{employee.fullName?.slice(0, 2).toUpperCase()}</span><div><b className="employee-text-preview" title={employee.fullName}>{employee.fullName}</b><small>{employee.employeeCode}</small></div></div></td>
              <td><div className="employee-text-preview" title={employee.site?.name}>{employee.site?.name || <span className="muted">Unavailable</span>}</div></td>
              <td><div className="employee-text-preview" title={employee.email}>{employee.email || <span className="muted">Not provided</span>}</div></td>
              <td>{employee.phone ? <span className="phone-cell"><Phone size={13} />{employee.phone}</span> : <span className="muted">Not provided</span>}</td>
              <td className="address-cell"><div className="employee-text-preview" title={employee.address}>{employee.address || <span className="muted">Not provided</span>}</div></td>
              <td><StatusBadge status={employee.isActive ? 'Active' : 'Inactive'} /></td>
              <td><StatusBadge status={emailDeliveryLabel(employee.emailDelivery?.status)} /></td>
              <td><div className="employee-actions">
                <IconButton label="Edit employee" onClick={() => openEdit(employee)}><Pencil size={15} /></IconButton>
                <IconButton label="Manage employee documents" onClick={() => openDocuments(employee)}><FileText size={15} /></IconButton>
                <IconButton label={employee.isActive ? 'Deactivate employee' : 'Activate employee'} onClick={() => requestStatusChange(employee)}><Power size={15} /></IconButton>
                <IconButton label="Resend credentials" onClick={() => resendCredentials(employee)}><Mail size={15} /></IconButton>
                <IconButton label="Archive employee" tone="danger" onClick={() => setArchiveTarget(employee)}><Archive size={15} /></IconButton>
              </div></td>
            </tr>)}
            {!filtered.length && <tr><td colSpan="8"><div className="employee-empty"><Users size={26} /><b>{query ? 'No matching employees' : 'No employees yet'}</b><span>{query ? 'Try a different name, ID, email, phone number, or address.' : 'Add an employee to issue their SITEPASS credentials.'}</span></div></td></tr>}
          </tbody>
        </table>}
      </div>
    </section>

    {dialog && <EmployeeDialog editing={dialog !== 'create'} sites={sites} form={form} setForm={setForm} submitted={submitted} error={formError} saving={saving} onClose={closeDialog} onSave={save} />}
    {editConfirmation && <EditConfirmationDialog employee={dialog} saving={saving} onCancel={() => !saving && setEditConfirmation(false)} onConfirm={() => { const { data } = validateEmployeeForm(form, sites, true); setEditConfirmation(false); persistEmployee(data); }} />}
    {deactivateTarget && <DeactivateEmployeeDialog employee={deactivateTarget} saving={deactivating} onCancel={() => !deactivating && setDeactivateTarget(null)} onConfirm={deactivate} />}
    {archiveTarget && <ArchiveDialog employee={archiveTarget} saving={archiving} onClose={() => !archiving && setArchiveTarget(null)} onConfirm={archive} />}
    {documentTarget && <EmployeeDocumentsDialog employee={documentTarget.employee} documents={documentTarget.documents} loading={documentTarget.loading} onClose={closeDocuments} onReload={() => loadDocuments(documentTarget.employee.id)} />}
  </main>;
}

function Metric({ icon, label, value, tone }) { return <article className={`employee-metric ${tone}`}><span className="employee-metric-icon">{icon}</span><div><p>{label}</p><strong>{value}</strong></div></article>; }
function IconButton({ label, tone = '', onClick, children, disabled = false }) { return <button type="button" className={`employee-icon-button ${tone}`} onClick={onClick} title={label} aria-label={label} disabled={disabled}>{children}</button>; }
function TableLoading() { return <div className="employee-table-loading"><span /><span /><span /><span /></div>; }

function EmployeeDialog({ editing, sites, form, setForm, submitted, error, saving, onClose, onSave }) {
  const [touched, setTouched] = useState({});
  const { errors } = validateEmployeeForm(form, sites, editing);
  const visibleError = name => (submitted || touched[name]) ? errors[name] : '';
  const field = name => ({
    id: `employee-${name}`, name, value: form[name], disabled: saving,
    onChange: event => setForm(current => ({ ...current, [name]: event.target.value })),
    onBlur: () => setTouched(current => ({ ...current, [name]: true })),
    'aria-invalid': Boolean(visibleError(name)),
    'aria-describedby': `employee-${name}-hint${visibleError(name) ? ` employee-${name}-error` : ''}`,
  });
  const issue = name => visibleError(name) && <small id={`employee-${name}-error`} className="employee-field-error" role="alert">{visibleError(name)}</small>;
  return <div className="employee-modal-backdrop" role="presentation"><section className="employee-modal" role="dialog" aria-modal="true" aria-labelledby="employee-dialog-title">
    <div className="employee-modal-heading"><div><span className="employee-modal-icon"><Users size={19} /></span><div><h2 id="employee-dialog-title">{editing ? 'Edit employee' : 'Add employee'}</h2><p>{editing ? 'Update employee details without changing their ID or access code.' : 'Employee ID and temporary access code will be generated and emailed.'}</p></div></div><button type="button" className="employee-close" onClick={onClose} aria-label="Close dialog"><X size={19} /></button></div>
    <form onSubmit={onSave} noValidate className="employee-form">
      <label htmlFor="employee-fullName"><span>Employee name</span><input {...field('fullName')} autoFocus required maxLength={30} autoComplete="name" placeholder="Full name"/><small id="employee-fullName-hint">{form.fullName.length}/30 characters</small>{issue('fullName')}</label>
      <label htmlFor="employee-email"><span>Email address</span><input {...field('email')} required type="email" autoComplete="email" placeholder="name@example.com"/><small id="employee-email-hint">Required for credentials. Maximum 191 characters.</small>{issue('email')}</label>
      <label htmlFor="employee-siteCode"><span>Construction site</span><select {...field('siteCode')} required disabled={editing || saving}><option value="">Select a site</option>{sites.map(site => <option key={site.id} value={site.siteCode} disabled={!editing && !site.isActive}>{site.name} ({site.siteCode}){!site.isActive ? ' — Inactive' : ''}</option>)}</select><small id="employee-siteCode-hint">{editing ? 'Site assignment is preserved to protect attendance history.' : 'Choose an active construction site.'}</small>{issue('siteCode')}</label>
      <label htmlFor="employee-phone"><span>Phone number <em>Optional</em></span><input {...field('phone')} type="tel" autoComplete="tel" placeholder="+94 757 949 092"/><small id="employee-phone-hint">Use any country code, for example +94 757 949 092 or +44 7700 900123.</small>{issue('phone')}</label>
      <label htmlFor="employee-address" className="employee-address-field"><span>Home address <em>Optional</em></span><textarea {...field('address')} autoComplete="street-address" placeholder="Street, town/city, postcode" rows="3"/><small id="employee-address-hint">{countWords(form.address)}/50 words · {form.address.trim().length}/500 characters</small>{issue('address')}</label>
      {editing && <label className="employee-status-control"><span>Employee status</span><button type="button" disabled={saving} className={form.isActive ? 'status-toggle on' : 'status-toggle'} onClick={() => setForm(current => ({ ...current, isActive: !current.isActive }))} aria-pressed={form.isActive}><span /><b>{form.isActive ? 'Active' : 'Inactive'}</b></button></label>}
      {error && <p className="employee-form-error" role="alert"><ShieldAlert size={16} />{error}</p>}
      <div className="employee-modal-footer"><button type="button" className="btn btn-soft" onClick={onClose} disabled={saving}>Cancel</button><button className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Create employee'}</button></div>
    </form>
  </section></div>;
}

function ArchiveDialog({ employee, saving, onClose, onConfirm }) { return <div className="employee-modal-backdrop" role="presentation"><section className="employee-modal archive-modal" role="dialog" aria-modal="true" aria-labelledby="archive-dialog-title">
  <div className="archive-symbol"><Archive size={23} /></div><h2 id="archive-dialog-title">Archive employee?</h2><p><b>{employee.fullName}</b> <span>({employee.employeeCode})</span> will be removed from the active employee directory and will no longer be able to authenticate or check in.</p><p className="archive-note"><CheckCircle2 size={16} />Attendance, safety declarations, delivery history, and audit records will be preserved.</p><div className="employee-modal-footer"><button type="button" className="btn btn-soft" onClick={onClose} disabled={saving}>Cancel</button><button type="button" className="btn archive-confirm" onClick={onConfirm} disabled={saving}>{saving ? 'Archiving…' : 'Archive employee'}</button></div>
</section></div>; }

function EditConfirmationDialog({ employee, saving, onCancel, onConfirm }) { return <div className="employee-modal-backdrop" role="presentation"><section className="employee-modal archive-modal" role="dialog" aria-modal="true" aria-labelledby="edit-confirmation-title"><div className="archive-symbol"><AlertTriangle size={23} /></div><h2 id="edit-confirmation-title">Save employee changes?</h2><p>Apply the updated details for <b>{employee.fullName}</b> <span>({employee.employeeCode})</span>?</p><div className="employee-modal-footer"><button type="button" className="btn btn-soft" onClick={onCancel} disabled={saving}>Cancel</button><button type="button" className="btn btn-primary" onClick={onConfirm} disabled={saving}>{saving ? 'Saving…' : 'Yes, save changes'}</button></div></section></div>; }

function DeactivateEmployeeDialog({ employee, saving, onCancel, onConfirm }) { return <div className="employee-modal-backdrop" role="presentation"><section className="employee-modal archive-modal" role="dialog" aria-modal="true" aria-labelledby="deactivate-employee-title"><div className="archive-symbol"><Power size={23} /></div><h2 id="deactivate-employee-title">Deactivate employee?</h2><p><b>{employee.fullName}</b> <span>({employee.employeeCode})</span> will not be able to authenticate or check in until reactivated.</p><div className="employee-modal-footer"><button type="button" className="btn btn-soft" onClick={onCancel} disabled={saving}>Cancel</button><button type="button" className="btn archive-confirm" onClick={onConfirm} disabled={saving}>{saving ? 'Deactivating…' : 'Yes, deactivate'}</button></div></section></div>; }

function EmployeeDocumentsDialog({ employee, documents, loading, onClose, onReload }) {
  const [form, setForm] = useState(blankDocumentForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [removingId, setRemovingId] = useState('');
  const fileInput = useRef(null);
  const workerIdDocument = documents.find(document => document.documentType === 'WORKER_ID') || null;
  const isExistingWorkerId = form.documentType === 'WORKER_ID' && Boolean(workerIdDocument);
  const workerIdExpiry = workerIdDocument?.expiresAt ? new Date(workerIdDocument.expiresAt).toISOString().slice(0, 10) : '';
  useEffect(() => {
    if (form.documentType !== 'WORKER_ID' || !workerIdDocument) return;
    setForm(current => ({ ...current, documentName: 'Worker ID', expiresAt: workerIdExpiry, file: null }));
    if (fileInput.current) fileInput.current.value = '';
  }, [form.documentType, workerIdDocument?.id, workerIdExpiry]);
  const updateType = (documentType) => setForm(current => ({
    ...current,
    documentType,
    documentName: current.documentName === DOCUMENT_LABELS[current.documentType] ? DOCUMENT_LABELS[documentType] : current.documentName,
    expiresAt: documentType === 'WORKER_ID' && workerIdDocument ? workerIdExpiry : current.expiresAt,
    file: documentType === 'WORKER_ID' && workerIdDocument ? null : current.file,
  }));
  const upload = async (event) => {
    event.preventDefault();
    if (isExistingWorkerId) return setError('This employee already has a Worker ID. Delete it before uploading a replacement.');
    if (!form.file) return setError('Choose a PDF, JPG, or PNG document to upload.');
    setSaving(true); setError('');
    try {
      const dataBase64 = await fileAsBase64(form.file);
      const response = await verificationApi.uploadEmployeeDocument(employee.id, {
        documentType: form.documentType, documentName: form.documentName.trim() || DOCUMENT_LABELS[form.documentType],
        expiresAt: form.expiresAt ? new Date(`${form.expiresAt}T00:00:00.000Z`).toISOString() : null,
        fileName: form.file.name, mimeType: form.file.type, dataBase64,
      });
      toast.success(response.data?.message || 'Employee document uploaded.');
      setForm(blankDocumentForm); if (fileInput.current) fileInput.current.value = '';
      onReload();
    } catch (uploadError) {
      const message = apiErrorMessage(uploadError, 'Unable to upload the document.');
      setError(message); toast.error(message);
    } finally { setSaving(false); }
  };
  const saveWorkerIdExpiry = async () => {
    if (!workerIdDocument) return;
    setSaving(true); setError('');
    try {
      const response = await verificationApi.updateEmployeeDocumentExpiry(workerIdDocument.id, {
        expiresAt: form.expiresAt ? new Date(`${form.expiresAt}T00:00:00.000Z`).toISOString() : null,
      });
      toast.success(response.data?.message || 'Worker ID expiry date saved.');
      onReload();
    } catch (saveError) {
      const message = apiErrorMessage(saveError, 'Unable to save the Worker ID expiry date.');
      setError(message); toast.error(message);
    } finally { setSaving(false); }
  };
  const download = async (employeeDocument) => {
    try {
      const response = await verificationApi.downloadEmployeeDocument(employeeDocument.id);
      const url = URL.createObjectURL(new Blob([response.data], { type: employeeDocument.mimeType }));
      const link = globalThis.document.createElement('a'); link.href = url; link.download = employeeDocument.fileName; link.click(); URL.revokeObjectURL(url);
    } catch (downloadError) { toast.error(apiErrorMessage(downloadError, 'Unable to download the document.')); }
  };
  const view = async (employeeDocument) => {
    const previewWindow = window.open('', '_blank');
    try {
      const response = await verificationApi.downloadEmployeeDocument(employeeDocument.id);
      const url = URL.createObjectURL(new Blob([response.data], { type: employeeDocument.mimeType }));
      if (previewWindow) previewWindow.location.href = url;
      else window.open(url, '_blank', 'noopener');
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (viewError) {
      previewWindow?.close();
      toast.error(apiErrorMessage(viewError, 'Unable to open the document.'));
    }
  };
  const remove = async (document) => {
    if (!window.confirm(`Delete ${document.documentName}? This cannot be undone.`)) return;
    setRemovingId(document.id);
    try { const response = await verificationApi.deleteEmployeeDocument(document.id); toast.success(response.data?.message || 'Employee document deleted.'); onReload(); }
    catch (removeError) { toast.error(apiErrorMessage(removeError, 'Unable to delete the document.')); }
    finally { setRemovingId(''); }
  };
  return <div className="employee-modal-backdrop" role="presentation"><section className="employee-modal employee-documents-modal" role="dialog" aria-modal="true" aria-labelledby="employee-documents-title">
    <div className="employee-modal-heading"><div><span className="employee-modal-icon"><IdCard size={19} /></span><div><h2 id="employee-documents-title">Employee documents</h2><p>Manage Worker ID, medical certificates, insurance, and other records for {employee.fullName}.</p></div></div><button type="button" className="employee-close" onClick={onClose} disabled={saving} aria-label="Close dialog"><X size={19} /></button></div>
    <form onSubmit={upload} className="employee-document-form" noValidate>
      <div className="employee-document-types" aria-label="Document type">{Object.entries(DOCUMENT_LABELS).map(([value, label]) => <button type="button" key={value} className={form.documentType === value ? 'selected' : ''} onClick={() => updateType(value)} disabled={saving}>{label}</button>)}</div>
      <label><span>Document name</span><input value={form.documentName} onChange={event => setForm(current => ({ ...current, documentName: event.target.value }))} maxLength="191" disabled={saving || isExistingWorkerId} /></label>
      <label><span>Expiry date <b>Optional</b></span><input type="date" value={form.expiresAt} onChange={event => setForm(current => ({ ...current, expiresAt: event.target.value }))} disabled={saving} /><small>{form.documentType === 'WORKER_ID' ? 'This date controls Worker ID access and the employee countdown.' : 'Optional document expiry date.'}</small></label>
      {isExistingWorkerId ? <p className="employee-document-note">A Worker ID is already saved. Update its expiry date above, or delete it before uploading a replacement.</p> : <label className="employee-document-file"><span>Upload file</span><input ref={fileInput} type="file" accept="application/pdf,image/jpeg,image/png" disabled={saving} onChange={event => { const file = event.target.files?.[0] || null; setForm(current => ({ ...current, file })); setError(file && file.size > 5 * 1024 * 1024 ? 'The file must be 5 MB or smaller.' : ''); }} /><small>PDF, JPG, or PNG · maximum 5 MB</small></label>}
      {error && <p className="employee-form-error" role="alert"><ShieldAlert size={16} />{error}</p>}
      <div className="employee-modal-footer"><button type={isExistingWorkerId ? 'button' : 'submit'} className="btn btn-primary" onClick={isExistingWorkerId ? saveWorkerIdExpiry : undefined} disabled={saving}>{saving ? 'Saving…' : isExistingWorkerId ? 'Save expiry date' : <><Upload size={16} />Upload document</>}</button></div>
    </form>
    <div className="employee-document-list"><h3>Saved documents</h3>{loading ? <p className="employee-document-empty">Loading documents…</p> : !documents.length ? <p className="employee-document-empty">No documents uploaded yet.</p> : documents.map(document => <article key={document.id} className="employee-document-row"><FileText size={20} /><div><strong>{document.documentName}</strong><small>{DOCUMENT_LABELS[document.documentType] || document.documentType} · {formatBytes(document.fileSize)}{document.expiresAt ? ` · Expires ${formatDate(document.expiresAt)}` : ''}</small></div><div className="employee-document-actions"><IconButton label={`View ${document.documentName}`} onClick={() => view(document)}><Eye size={15} /></IconButton><IconButton label={`Download ${document.documentName}`} onClick={() => download(document)}><Download size={15} /></IconButton><IconButton label={`Delete ${document.documentName}`} tone="danger" onClick={() => remove(document)} disabled={removingId === document.id}><Trash2 size={15} /></IconButton></div></article>)}</div>
  </section></div>;
}

function fileAsBase64(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(new Error('The selected file could not be read.')); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.readAsDataURL(file); }); }
function formatBytes(bytes) { return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`; }
function formatDate(value) { return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value)); }
