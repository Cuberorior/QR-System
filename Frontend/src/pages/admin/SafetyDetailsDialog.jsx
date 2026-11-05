import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

const responseLabels = {
  safetyHelmet: 'Safety Helmet',
  safetyFootwear: 'Safety Footwear',
  highVisibilityClothing: 'High-Visibility Clothing',
  protectiveEquipment: 'Protective Equipment',
  siteSafetyInstructions: 'Site Safety Instructions',
  fitForDuty: 'Fit for Duty',
};
const time = value => value ? `${new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })} UTC` : 'Not recorded';

export default function SafetyDetailsDialog({ record, onClose }) {
  const dialogRef = useRef(null);
  const declaration = record.safetyDeclaration;
  const responses = Object.entries(declaration?.responses || {});

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  return (
    <dialog ref={dialogRef} aria-labelledby="safety-details-title" className="card m-auto w-[calc(100%-2rem)] max-w-xl max-h-[90vh] overflow-y-auto p-6 backdrop:bg-slate-900/40" onCancel={onClose}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="safety-details-title" className="font-display text-2xl font-bold text-[#102a56]">Safety details</h2>
          <p className="text-sm text-slate-500 mt-1">{record.employeeName} · {record.employeeId}</p>
        </div>
        <button type="button" className="btn btn-soft p-2" aria-label="Close safety details" onClick={onClose}><X size={20}/></button>
      </div>
      <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="font-semibold">Construction site</dt><dd>{record.siteName} ({record.siteCode})</dd>
        <dt className="font-semibold">Entry</dt><dd>{time(record.entryTime)}</dd>
        <dt className="font-semibold">Submitted</dt><dd>{time(declaration?.submittedAt)}</dd>
        <dt className="font-semibold">Checklist version</dt><dd className="break-words">{declaration?.checklistVersion || 'Not recorded'}</dd>
      </dl>
      {declaration ? <>
        <h3 className="font-semibold text-[#102a56] mt-6">Safety checklist responses</h3>
        {responses.length ? <dl className="mt-2 text-sm">{responses.map(([key, value]) => (
          <div key={key} className="flex justify-between gap-4 border-b border-slate-100 py-3">
            <dt>{responseLabels[key] || key.replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ')}</dt>
            <dd className={`font-semibold shrink-0 ${value === true ? 'text-emerald-700' : 'text-amber-700'}`}>{value === true ? 'Confirmed' : value === false ? 'Not confirmed' : 'Not recorded'}</dd>
          </div>
        ))}</dl> : <p className="mt-3 text-sm text-slate-500">No checklist responses were recorded for this declaration.</p>}
        <p className="mt-4 text-xs text-slate-500">These are the employee’s recorded self-declarations, not a safety certification.</p>
      </> : <p className="mt-5 text-sm text-slate-500">No safety declaration was recorded for this attendance.</p>}
      <div className="mt-6 flex justify-end"><button type="button" className="btn btn-primary" onClick={onClose}>Close</button></div>
    </dialog>
  );
}
