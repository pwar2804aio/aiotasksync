'use client';

import { useState, useEffect, useCallback } from 'react';
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
  const [mappings, setMappings] = useState<Mappings>({ companies: {}, deals: {} });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResults, setSyncResults] = useState<SyncResult[] | null>(null);
  const [asanaOk, setAsanaOk] = useState(false);
  const [hubspotOk, setHubspotOk] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

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
      const [companiesRes, dealsRes, projectsRes, mappingsRes] = await Promise.all([
        fetch('/api/hubspot/companies'),
        fetch('/api/hubspot/deals'),
        fetch('/api/asana/projects'),
        fetch('/api/mappings'),
      ]);

      if (companiesRes.ok && dealsRes.ok) {
        setCompanies(await companiesRes.json());
        setDeals(await dealsRes.json());
        setHubspotOk(true);
      }

      if (projectsRes.ok) {
        const p = await projectsRes.json();
        if (!p.error) { setProjects(p); setAsanaOk(true); }
      }

      if (mappingsRes.ok) {
        setMappings(await mappingsRes.json());
      }
    } catch (err) {
      console.error('Load error:', err);
    }
    setLoading(false);
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

  const filteredCompanies = companies.filter(c =>
    (c.properties.name || '').toLowerCase().includes(search.toLowerCase())
  );
  const filteredDeals = deals.filter(d =>
    (d.properties.dealname || '').toLowerCase().includes(search.toLowerCase())
  );

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
            {hubspotOk ? `HubSpot: ${companies.length} companies, ${deals.length} deals` : 'HubSpot: Not connected'}
          </span>
          <span style={{ flex: 1 }} />
          <span className="status-text">{mappingCount} mapping{mappingCount !== 1 ? 's' : ''} configured</span>
        </div>

        {/* Tabs */}
        <div className="tabs">
          <div className={`tab ${tab === 'companies' ? 'active' : ''}`} onClick={() => { setTab('companies'); setSearch(''); }}>
            Companies <span className="count">{companies.length}</span>
          </div>
          <div className={`tab ${tab === 'deals' ? 'active' : ''}`} onClick={() => { setTab('deals'); setSearch(''); }}>
            Deals <span className="count">{deals.length}</span>
          </div>
        </div>

        {/* Search */}
        <div className="search-bar">
          <input
            type="text"
            placeholder={`Search ${tab}...`}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
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
              {filteredCompanies.map(c => {
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
                        {projects.map(p => (
                          <option key={p.gid} value={p.gid}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className={`map-status ${isMapped ? 'on' : 'off'}`}>{isMapped ? 'Mapped' : '—'}</div>
                  </div>
                );
              })}
              {filteredCompanies.length === 0 && <div className="empty"><p>No companies found</p></div>}
            </>
          ) : (
            <>
              <div className="mapping-row header">
                <div>HubSpot Deal</div><div /><div>Asana Project</div><div>Status</div>
              </div>
              {filteredDeals.map(d => {
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
                        {projects.map(p => (
                          <option key={p.gid} value={p.gid}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className={`map-status ${isMapped ? 'on' : 'off'}`}>{isMapped ? 'Mapped' : '—'}</div>
                  </div>
                );
              })}
              {filteredDeals.length === 0 && <div className="empty"><p>No deals found</p></div>}
            </>
          )}
        </div>

        {/* Sync Results */}
        {syncResults && (
          <div className="sync-results">
            <h3>Sync Results</h3>
            {syncResults.map((r, i) => (
              <div key={i} className={`result-item ${r.status}`}>
                <span>{r.status === 'success' ? '\u2713' : r.status === 'error' ? '\u2717' : '—'}</span>
                <strong>{r.type === 'company' ? 'Company' : 'Deal'}:</strong> {r.name}
                <span style={{ flex: 1 }} />
                <span>{r.status === 'error' ? r.error : r.status === 'skipped' ? r.reason : 'Note created'}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
