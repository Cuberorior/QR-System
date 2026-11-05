import { Trash2 } from 'lucide-react';

const clearHistoryEvents = {
  '/admin/attendance': 'sitepass:clear-attendance-history',
  '/admin/visitors': 'sitepass:clear-visitor-history',
  '/admin/activity-logs': 'sitepass:clear-activity-history',
};

export default function PageHeader({ title, description, action }) {
  const clearEvent = clearHistoryEvents[window.location.pathname];
  return <header className="page-header"><div><h1>{title}</h1><p>{description}</p></div>{(action || clearEvent) && <div className="page-header-action"><div className="flex gap-2">{clearEvent && <button type="button" className="btn btn-danger" onClick={() => window.dispatchEvent(new Event(clearEvent))}><Trash2 size={16}/>Clear history</button>}{action}</div></div>}</header>;
}
