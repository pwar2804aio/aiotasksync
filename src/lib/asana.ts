const ASANA_TOKEN = () => process.env.ASANA_TOKEN || '';

async function asanaGet(endpoint: string) {
  const res = await fetch(`https://app.asana.com/api/1.0${endpoint}`, {
    headers: { Authorization: `Bearer ${ASANA_TOKEN()}` },
    next: { revalidate: 0 },
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
  const endpoint = workspaceId
    ? `/workspaces/${workspaceId}/projects?opt_fields=name,archived&limit=100`
    : '/projects?opt_fields=name,archived&limit=100';
  const data = await asanaGet(endpoint);
  return (data.data as any[]).filter((p: any) => !p.archived);
}

export async function getProjectTasks(projectId: string) {
  const data = await asanaGet(
    `/projects/${projectId}/tasks?opt_fields=name,completed,assignee.name,due_on,notes,tags.name&limit=100`
  );
  return data.data as any[];
}
