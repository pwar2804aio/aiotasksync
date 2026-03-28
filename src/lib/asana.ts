const ASANA_TOKEN = () => process.env.ASANA_TOKEN || '';

async function asanaGet(endpoint: string) {
  const res = await fetch(`https://app.asana.com/api/1.0${endpoint}`, {
    headers: { Authorization: `Bearer ${ASANA_TOKEN()}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Asana ${res.status}: ${text}`);
  }
  return res.json();
}

export async function getWorkspaces() {
  const data = await asanaGet('/workspaces');
  return data.data as { gid: string; name: string }[];
}

export async function getProjects(workspaceId?: string) {
  // Auto-detect workspace if not provided
  if (!workspaceId) {
    const workspaces = await getWorkspaces();
    if (workspaces.length === 0) throw new Error('No Asana workspaces found');
    workspaceId = workspaces[0].gid;
  }

  // Paginate through ALL projects so none are missing
  const all: any[] = [];
  let offset: string | undefined;
  do {
    let endpoint = `/workspaces/${workspaceId}/projects?opt_fields=name,archived&limit=100`;
    if (offset) endpoint += `&offset=${offset}`;
    const data = await asanaGet(endpoint);
    const active = (data.data || []).filter((p: any) => !p.archived);
    all.push(...active);
    offset = data.next_page?.offset;
  } while (offset);

  all.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  return all;
}

export async function getProjectTasks(projectId: string) {
  const data = await asanaGet(
    `/projects/${projectId}/tasks?opt_fields=name,completed,assignee.name,due_on,notes,tags.name&limit=100`
  );
  return data.data as any[];
}
