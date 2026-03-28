'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

interface Company { id: string; properties: { name: string; domain?: string } }
interface Deal { id: string; properties: { dealname: string; amount?: string; dealstage?: string } }
interface AsanaProject { gid: string; name: string }
interface Mapping { projectId: string; projectName: string; companyName?: string; dealName?: string }
interface Mappings { companies: Record<string, Mapping>; deals: Record<string, Mapping> }
interface SyncResult { type: string; id: string; name: string; status: string; error?: string; reason?: string }

export default function HomePage() {
  const router = useRouter();
  const [user, setUser] = useState<{ email: string; role: string } | null>(null);
  const [tab, setTab] = useState<'companies' | 'deals'>('companies');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [projects, setProjects] = useState<AsanaProject[]>([]);
  const [projectSearch, setProjectSearch] = useState('');
  const [mappings, setMappings] = useState<Mappings>({ companies: {}, deals: {} });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResults, setSyncResults] = useState<SyncResult[] | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [lastSyncType, setLastSyncType] = useState<string | null>(null);
  const [asanaOk, setAsanaOk] = useState(false);
  const [hubspotOk, setHubspotOk] = useState(false);
  const searchTimer = useRef<any>(null);

  useEffect(() => { checkAuth(); }, []);

  async function checkAuth() {
    const res = await fetch('/api/auth/me');
    if (!res.ok) { router.push('/login'); return; }
    const data = await res.json();
    setUser(data);
    loadData();
  }

  async function loadData() {
    setLoading(true);
    try {
      const [companiesRes, dealsRes, projectsRes, mappingsRes, syncStatusRes] = await Promise.all([
        fetch('/api/hubspot/companies'),
        fetch('/api/hubspot/deals'),
        fetch('/api/asana/projects'),
        fetch('/api/mappings'),
        fetch('/api/sync/status'),
      ]);

      if (companiesRes.ok) {
        const c = await companiesRes.json();
        if (!c.error) { setCompanies(c); setHubspotOk(true); }
      }
      if (dealsRes.ok) {
        const d = await dealsRes.json();
        if (!d.error) setDeals(d);
      }
      if (projectsRes.ok) {
        const p = await projectsRes.json();
        if (!p.error) { setProjects(p); setAsanaOk(true); }
      }
      if (mappingsRes.ok) {
        const m = await mappingsRes.json();
        if (!m.error) setMappings(m);
      }
      if (syncStatusRes.ok) {
        const s = await syncStatusRes.json();
        if (s.lastRun) setLastSyncTime(s.lastRun);
        if (s.lastRunType) setLastSyncType(s.lastRunType);
      }
    } catch (err) {
      console.error('Load error:', err);
    }
    setLoading(false);
  }

  // Debounced server-side search for HubSpot
  function handleSearch(value: string) {
    setSearch(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        if (tab === 'companies') {
          const res = await fetch(`/api/hubspot/companies?q=${encodeURIComponent(value)}`);
          if (res.ok) setCompanies(await res.json());
        } else {
          const res = await fetch(`/api/hubspot/deals?q=${encodeURIComponent(value)}`);
          if (res.ok) setDeals(await res.json());
        }
      } catch {}
      setSearching(false);
    }, 400);
  }

  async function saveMappings(updated: Mappings) {
    setMappings(updated);
    await fetch('/api/mappings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
  }

  function setCompanyMapping(companyId: string, companyName: string, projectId: string, projectName: string) {
    const updated = { ...mappings, companies: { ...mappings.companies } };
    if (projectId) {
      updated.companies[companyId] = { projectId, projectName: projectName.trim(), companyName };
    } else {
      delete updated.companies[companyId];
    }
    saveMappings(updated);
  }

  function setDealMapping(dealId: string, dealName: string, projectId: string, projectName: string) {
    const updated = { ...mappings, deals: { ...mappings.deals } };
    if (projectId) {
      updated.deals[dealId] = { projectId, projectName: projectName.trim(), dealName };
    } else {
      delete updated.deals[dealId];
    }
    saveMappings(updated);
  }

  async function runSync() {
    setSyncing(true);
    setSyncResults(null);
    try {
      const res = await fetch('/api/sync', { method: 'POST' });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSyncResults(data.results);
      if (data.syncedAt) setLastSyncTime(data.syncedAt);
      setLastSyncType('manual');
    } catch (err: any) {
      alert('Sync failed: ' + err.message);
    }
    setSyncing(false);
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  const mappingCount = Object.keys(mappings.companies).length + Object.keys(mappings.deals).length;

  // Filter Asana projects by search text
  const filteredProjects = projectSearch
    ? projects.filter(p => p.name.toLowerCase().includes(projectSearch.toLowerCase()))
    : projects;

  if (!user) return null;

  return (
    <>
      <div className="header">
        <div>
          <h1>AIO TaskSync</h1>
          <div className="subtitle">Map Asana projects to HubSpot companies & deals, then sync tasks as timeline notes</div>
        </div>
        <div className="header-actions">
          <span className="header-user">{user.email}</span>
          {user.role === 'admin' && (
            <button className="btn btn-ghost btn-sm" onClick={() => router.push('/admin')}>Users</button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={logout}>Logout</button>
          <button className="btn btn-sync" onClick={runSync} disabled={syncing || mappingCount === 0}>
            {syncing ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>
      </div>

      <div className="container">
        {/* Status bar */}
        <div className="status-bar">
          <span className={`status-dot ${asanaOk ? 'ok' : 'err'}`} />
          <span className="status-text">
            {asanaOk ? `Asana: ${projects.length} projects` : 'Asana: Not connected'}
          </span>
          <span style={{ marginLeft: 16 }} className={`status-dot ${hubspotOk ? 'ok' : 'err'}`} />
          <span className="status-text">
            {hubspotOk ? `HubSpot connected` : 'HubSpot: Not connected'}
          </span>
          <span style={{ flex: 1 }} />
          {lastSyncTime && (
            <span className="status-text" style={{ marginRight: 16 }}>
              Last sync: {new Date(lastSyncTime).toLocaleString()} ({lastSyncType === 'manual' ? 'Manual' : 'Auto'})
            </span>
          )}
          <span className="status-text">{mappingCount} mapping{mappingCount !== 1 ? 's' : ''} configured</span>
          <span className="status-text" style={{ marginLeft: 16, color: '#bbb', fontSize: 11 }}>v2.1</span>
        </div>

        {/* Asana project filter */}
        {asanaOk && (
          <div className="search-bar" style={{ marginBottom: 8 }}>
            <input
              type="text"
              placeholder="Filter Asana projects in dropdowns..."
              value={projectSearch}
              onChange={e => setProjectSearch(e.target.value)}
              style={{ borderColor: '#00bda5' }}
            />
          </div>
        )}

        {/* Tabs */}
        <div className="tabs">
          <div className={`tab ${tab === 'companies' ? 'active' : ''}`} onClick={() => { setTab('companies'); setSearch(''); handleSearch(''); }}>
            Companies <span className="count">{companies.length}</span>
          </div>
          <div className={`tab ${tab === 'deals' ? 'active' : ''}`} onClick={() => { setTab('deals'); setSearch(''); handleSearch(''); }}>
            Deals <span className="count">{deals.length}</span>
          </div>
        </div>

        {/* HubSpot Search */}
        <div className="search-bar">
          <input
            type="text"
            placeholder={`Search HubSpot ${tab}...`}
            value={search}
            onChange={e => handleSearch(e.target.value)}
          />
          {searching && <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>Searching...</div>}
        </div>

        {/* Table */}
        <div className="mapping-table">
          {loading ? (
            <div className="loading">
              <div className="spinner" />
              <p style={{ marginTop: 12 }}>Loading data from Asana & HubSpot...</p>
            </div>
          ) : tab === 'companies' ? (
            <>
              <div className="mapping-row header">
                <div>HubSpot Company</div><div /><div>Asana Project</div><div>Status</div>
              </div>
              {companies.map(c => {
                const m = mappings.companies[c.id];
                const isMapped = !!m?.projectId;
                return (
                  <div key={c.id} className="mapping-row">
                    <div>
                      <div className="hs-name">{c.properties.name || 'Unnamed'}</div>
                      <div className="hs-detail">{c.properties.domain || ''}</div>
                    </div>
                    <div className="arrow">&rarr;</div>
                    <div>
                      <select
                        className={isMapped ? 'mapped' : ''}
                        value={m?.projectId || ''}
                        onChange={e => {
                          const opt = e.target.options[e.target.selectedIndex];
                          setCompanyMapping(c.id, c.properties.name || '', e.target.value, opt.text);
                        }}
                      >
                        <option value="">— Select Asana Project —</option>
                        {filteredProjects.map(p => (
                          <option key={p.gid} value={p.gid}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className={`map-status ${isMapped ? 'on' : 'off'}`}>{isMapped ? 'Mapped' : '—'}</div>
                  </div>
                );
              })}
              {companies.length === 0 && <div className="empty"><p>No companies found</p></div>}
            </>
          ) : (
            <>
              <div className="mapping-row header">
                <div>HubSpot Deal</div><div /><div>Asana Project</div><div>Status</div>
              </div>
              {deals.map(d => {
                const m = mappings.deals[d.id];
                const isMapped = !!m?.projectId;
                const amount = d.properties.amount ? `$${parseFloat(d.properties.amount).toLocaleString()}` : '';
                return (
                  <div key={d.id} className="mapping-row">
                    <div>
                      <div className="hs-name">{d.properties.dealname || 'Unnamed'}</div>
                      <div className="hs-detail">{amount}</div>
                    </div>
                    <div className="arrow">&rarr;</div>
                    <div>
                      <select
                        className={isMapped ? 'mapped' : ''}
                        value={m?.projectId || ''}
                        onChange={e => {
                          const opt = e.target.options[e.target.selectedIndex];
                          setDealMapping(d.id, d.properties.dealname || '', e.target.value, opt.text);
                        }}
                      >
                        <option value="">— Select Asana Project —</option>
                        {filteredProjects.map(p => (
                          <option key={p.gid} value={p.gid}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className={`map-status ${isMapped ? 'on' : 'off'}`}>{isMapped ? 'Mapped' : '—'}</div>
                  </div>
                );
              })}
              {deals.length === 0 && <div className="empty"><p>No deals found</p></div>}
            </>
          )}
        </div>

        {/* Sync Results */}
        {syncResults && (
          <div className="sync-results">
            <h3>Sync Results</h3>
            {lastSyncTime && (
              <p style={{ fontSize: 13, color: '#666', margin: '0 0 8px' }}>
                Synced at {new Date(lastSyncTime).toLocaleString()} — <strong>{lastSyncType === 'manual' ? 'Manual Sync' : 'Auto Sync'}</strong>
              </p>
            )}
            {syncResults.map((r, i) => (
              <div key={i} className={`result-item ${r.status === 'unchanged' ? 'skipped' : r.status}`}>
                <span>{r.status === 'success' ? '\u2713' : r.status === 'error' ? '\u2717' : '—'}</span>
                <strong>{r.type === 'company' ? 'Company' : 'Deal'}:</strong> {r.name}
                <span style={{ flex: 1 }} />
                <span>{
                  r.status === 'success' ? 'Note updated' :
                  r.status === 'unchanged' ? 'No changes' :
                  r.status === 'error' ? r.error :
                  r.reason || r.status
                }</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
