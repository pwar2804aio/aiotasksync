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
  if (!workspaceId) {
    const workspaces = await getWorkspaces();
    if (workspaces.length === 0) throw new Error('No Asana workspaces found');
    workspaceId = workspaces[0].gid;
  }

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

const TASK_FIELDS = [
  'name', 'completed', 'completed_at', 'assignee.name',
  'due_on', 'due_at', 'notes', 'tags.name', 'num_subtasks',
  'created_at', 'modified_at', 'memberships.section.name',
].join(',');

export async function getProjectTasks(projectId: string) {
  const all: any[] = [];
  let offset: string | undefined;
  do {
    let endpoint = `/projects/${projectId}/tasks?opt_fields=${TASK_FIELDS}&limit=100`;
    if (offset) endpoint += `&offset=${offset}`;
    const data = await asanaGet(endpoint);
    all.push(...(data.data || []));
    offset = data.next_page?.offset;
  } while (offset);
  return all;
}

export async function getSubtasks(taskId: string) {
  const data = await asanaGet(
    `/tasks/${taskId}/subtasks?opt_fields=name,completed,assignee.name,due_on`
  );
  return data.data as any[];
}

// Get project metadata for last modified detection
export async function getProjectInfo(projectId: string) {
  const data = await asanaGet(`/projects/${projectId}?opt_fields=name,modified_at`);
  return data.data as { gid: string; name: string; modified_at: string };
}
