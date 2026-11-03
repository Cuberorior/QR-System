import { useEffect } from 'react';

const STORAGE_KEY = 'sitepass:admin-selected-site';

/** Shared, persisted site filter. An empty value represents the authorized All Sites scope. */
export function savedSiteCode() { return sessionStorage.getItem(STORAGE_KEY) || ''; }

export default function SiteSelector({ sites, value, onChange, allLabel = 'All Sites', disabled = false, className = '' }) {
  useEffect(() => {
    if (value && !sites.some(site => site.siteCode === value)) onChange('');
  }, [sites, value, onChange]);
  const select = event => { const next = event.target.value; if (next) sessionStorage.setItem(STORAGE_KEY, next); else sessionStorage.removeItem(STORAGE_KEY); onChange(next); };
  return <select className={`field ${className}`} value={value} onChange={select} disabled={disabled} aria-label="Construction site"><option value="">{allLabel}</option>{sites.map(site => <option key={site.id} value={site.siteCode}>{site.name} ({site.siteCode})</option>)}</select>;
}
