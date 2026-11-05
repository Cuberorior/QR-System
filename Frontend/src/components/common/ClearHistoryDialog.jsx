import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

export default function ClearHistoryDialog({ title, recordLabel, count, preservationNote, saving, onClose, onConfirm }) {
  const [confirmation, setConfirmation] = useState('');
  const ready = confirmation === 'CLEAR';
  return <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/55 p-4" role="presentation">
    <section className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="clear-history-title">
      <div className="flex items-start justify-between gap-4"><span className="grid h-12 w-12 place-items-center rounded-full bg-red-50 text-red-600"><AlertTriangle size={24}/></span><button type="button" className="btn btn-soft p-2" disabled={saving} onClick={onClose} aria-label="Close confirmation"><X size={18}/></button></div>
      <h2 id="clear-history-title" className="mt-4 font-display text-2xl font-bold text-[#102a56]">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">This permanently removes up to <b>{count.toLocaleString()}</b> matching {recordLabel}. This action cannot be undone.</p>
      {preservationNote && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm leading-5 text-amber-900">{preservationNote}</p>}
      <label className="mt-6 block"><span className="text-sm font-bold text-[#102a56]">Type <code className="rounded bg-slate-100 px-1.5 py-0.5">CLEAR</code> to confirm</span><input autoFocus className="field mt-2 w-full" value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={saving} autoComplete="off" spellCheck="false"/></label>
      <div className="mt-7 flex justify-end gap-2"><button type="button" className="btn btn-soft" disabled={saving} onClick={onClose}>Cancel</button><button type="button" className="btn btn-danger" disabled={!ready || saving} onClick={onConfirm}>{saving ? 'Clearing…' : `Permanently clear ${recordLabel}`}</button></div>
    </section>
  </div>;
}
