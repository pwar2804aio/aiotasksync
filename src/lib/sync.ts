import { getMappings, getSyncState, saveSyncState, type SyncState } from './store';
import { getProjectTasks, getSubtasks, getProjectInfo } from './asana';
import { createNote, deleteNote, findSyncNotes } from './hubspot';

// Build a rich, readable HTML note from Asana project data
async function buildProjectNote(projectName: string, tasks: any[]): Promise<string | null> {
  if (!tasks.length) return null;

  const incomplete = tasks.filter(t => !t.completed);
  const complete = tasks.filter(t => t.completed);
  const now = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  // Group tasks by section
  const sections: Record<string, any[]> = {};
  for (const t of incomplete) {
    const sectionName = t.memberships?.[0]?.section?.name || 'No Section';
    if (!sections[sectionName]) sections[sectionName] = [];
    sections[sectionName].push(t);
  }

  // Progress bar calculation
  const total = tasks.length;
  const doneCount = complete.length;
  const pct = Math.round((doneCount / total) * 100);
  const barFill = Math.round(pct / 5); // 20 chars wide
  const bar = '█'.repeat(barFill) + '░'.repeat(20 - barFill);

  let html = '';

  // Header
  html += `<h2>📋 ${projectName}</h2>`;
  html += `<p><strong>Last synced:</strong> ${now}</p>`;

  // Progress summary
  html += `<p><strong>Progress:</strong> ${bar} ${pct}% (${doneCount}/${total} tasks)</p>`;
  html += `<p><strong>Open:</strong> ${incomplete.length} | <strong>Completed:</strong> ${complete.length}</p>`;

  // Overdue tasks callout
  const today = new Date().toISOString().split('T')[0];
  const overdue = incomplete.filter(t => t.due_on && t.due_on < today);
  if (overdue.length) {
    html += `<p style="color:#cc0000;font-weight:bold">⚠️ ${overdue.length} overdue task${overdue.length > 1 ? 's' : ''}</p>`;
  }

  // Open tasks by section
  if (incomplete.length) {
    for (const [sectionName, sectionTasks] of Object.entries(sections)) {
      html += `<h3>${sectionName} (${sectionTasks.length})</h3>`;
      html += '<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%">';
      html += '<tr style="background:#f0f0f0"><th style="text-align:left">Task</th><th>Assignee</th><th>Due</th><th>Tags</th></tr>';

      for (const t of sectionTasks) {
        const assignee = t.assignee?.name || '<em>Unassigned</em>';
        const due = t.due_on || '—';
        const isOverdue = t.due_on && t.due_on < today;
        const dueStyle = isOverdue ? 'color:#cc0000;font-weight:bold' : '';
        const tags = (t.tags || []).map((tg: any) => tg.name).join(', ') || '—';

        // Task name with description preview
        let taskCell = `<strong>${t.name}</strong>`;
        if (t.notes) {
          const preview = t.notes.substring(0, 100).replace(/\n/g, ' ');
          taskCell += `<br/><span style="color:#666;font-size:12px">${preview}${t.notes.length > 100 ? '...' : ''}</span>`;
        }

        html += `<tr>`;
        html += `<td>${taskCell}</td>`;
        html += `<td style="text-align:center">${assignee}</td>`;
        html += `<td style="text-align:center;${dueStyle}">${due}</td>`;
        html += `<td style="text-align:center">${tags}</td>`;
        html += `</tr>`;

        // Subtasks (fetch if task has them)
        if (t.num_subtasks > 0) {
          try {
            const subtasks = await getSubtasks(t.gid);
            const subOpen = subtasks.filter(s => !s.completed);
            const subDone = subtasks.filter(s => s.completed);

            html += `<tr><td colspan="4" style="padding-left:24px;background:#fafafa">`;
            html += `<strong>Subtasks:</strong> ${subDone.length}/${subtasks.length} done<br/>`;

            for (const s of subOpen) {
              const sAssignee = s.assignee?.name || '';
              const sDue = s.due_on ? ` (due ${s.due_on})` : '';
              html += `☐ ${s.name}${sAssignee ? ` — ${sAssignee}` : ''}${sDue}<br/>`;
            }
            for (const s of subDone) {
              html += `<span style="color:#888">☑ <s>${s.name}</s></span><br/>`;
            }

            html += `</td></tr>`;
          } catch {
            // Skip subtasks on error
          }
        }
      }
      html += '</table>';
    }
  }

  // Recently completed tasks
  if (complete.length) {
    // Sort by completion date, most recent first
    const sorted = [...complete].sort((a, b) =>
      (b.completed_at || '').localeCompare(a.completed_at || '')
    );

    html += `<h3>✅ Completed (${complete.length})</h3>`;
    html += '<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%">';
    html += '<tr style="background:#f0f8f0"><th style="text-align:left">Task</th><th>Completed By</th><th>Completed</th></tr>';

    for (const t of sorted.slice(0, 30)) {
      const assignee = t.assignee?.name || '—';
      const completedDate = t.completed_at
        ? new Date(t.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : '—';
      html += `<tr><td><s>${t.name}</s></td><td style="text-align:center">${assignee}</td><td style="text-align:center">${completedDate}</td></tr>`;
    }
    if (complete.length > 30) {
      html += `<tr><td colspan="3" style="text-align:center;color:#888"><em>+ ${complete.length - 30} more completed tasks</em></td></tr>`;
    }
    html += '</table>';
  }

  // Team summary
  const assigneeTasks: Record<string, { open: number; done: number }> = {};
  for (const t of tasks) {
    const name = t.assignee?.name || 'Unassigned';
    if (!assigneeTasks[name]) assigneeTasks[name] = { open: 0, done: 0 };
    if (t.completed) assigneeTasks[name].done++;
    else assigneeTasks[name].open++;
  }

  html += '<h3>👥 Team Workload</h3>';
  html += '<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%">';
  html += '<tr style="background:#f0f0f0"><th style="text-align:left">Person</th><th>Open</th><th>Done</th></tr>';
  const sortedAssignees = Object.entries(assigneeTasks).sort((a, b) => b[1].open - a[1].open);
  for (const [name, counts] of sortedAssignees) {
    html += `<tr><td>${name}</td><td style="text-align:center">${counts.open}</td><td style="text-align:center">${counts.done}</td></tr>`;
  }
  html += '</table>';

  html += `<p style="color:#888;font-size:11px;margin-top:12px">Auto-synced by AIO TaskSync</p>`;
  return html;
}

// Sync a single mapping: delete old note, create new one if changed
async function syncOne(
  objectType: 'companies' | 'deals',
  objectId: string,
  mapping: { projectId: string; projectName: string; companyName?: string; dealName?: string },
  syncState: SyncState
): Promise<{ status: string; reason?: string; error?: string }> {
  const key = `${objectType}:${objectId}`;

  // Check if project has changed since last sync
  try {
    const projectInfo = await getProjectInfo(mapping.projectId);
    const lastModified = projectInfo.modified_at;
    const lastSynced = syncState.lastSync?.[key];

    if (lastSynced && lastSynced === lastModified) {
      return { status: 'unchanged', reason: 'No changes since last sync' };
    }

    // Fetch tasks and build note
    const tasks = await getProjectTasks(mapping.projectId);
    const note = await buildProjectNote(mapping.projectName, tasks);

    if (!note) {
      return { status: 'skipped', reason: 'No tasks in project' };
    }

    // Delete old sync notes
    const oldNoteIds = await findSyncNotes(objectType, objectId);
    for (const noteId of oldNoteIds) {
      await deleteNote(noteId);
    }

    // Create new note
    await createNote(objectType, objectId, note);

    // Update sync state
    syncState.lastSync[key] = lastModified;

    return { status: 'success' };
  } catch (err: any) {
    return { status: 'error', error: err.message };
  }
}

export interface SyncResult {
  type: string;
  id: string;
  name: string;
  status: string;
  reason?: string;
  error?: string;
}

export async function runFullSync(): Promise<SyncResult[]> {
  const mappings = await getMappings();
  const syncState = await getSyncState();
  const results: SyncResult[] = [];

  // Sync companies
  for (const [companyId, mapping] of Object.entries(mappings.companies || {})) {
    if (!mapping.projectId) continue;
    const result = await syncOne('companies', companyId, mapping, syncState);
    results.push({
      type: 'company',
      id: companyId,
      name: mapping.companyName || '',
      ...result,
    });
  }

  // Sync deals
  for (const [dealId, mapping] of Object.entries(mappings.deals || {})) {
    if (!mapping.projectId) continue;
    const result = await syncOne('deals', dealId, mapping, syncState);
    results.push({
      type: 'deal',
      id: dealId,
      name: mapping.dealName || '',
      ...result,
    });
  }

  // Save updated sync state
  await saveSyncState(syncState);

  return results;
}
