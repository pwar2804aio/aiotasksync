import { getMappings, getSyncState, saveSyncState, type SyncState } from './store';
import { getProjectTasksBySections, getSubtasksDeep, getProjectInfo } from './asana';
import { createNote, deleteNote, findSyncNotes } from './hubspot';

// Render subtasks recursively as indented list
function renderSubtasks(subtasks: any[], indent: number = 0): string {
  let html = '';
  const pad = 16 + (indent * 16);
  for (const s of subtasks) {
    const assignee = s.assignee?.name ? ` — <em>${s.assignee.name}</em>` : '';
    const due = s.due_on ? ` (due ${s.due_on})` : '';
    if (s.completed) {
      const completedDate = s.completed_at
        ? new Date(s.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : '';
      html += `<div style="padding-left:${pad}px;color:#888">`;
      html += `<span style="color:#00a86b">&#10003;</span> <s>${s.name}</s>${assignee}`;
      if (completedDate) html += ` <span style="font-size:11px">(completed ${completedDate})</span>`;
      html += `</div>`;
    } else {
      html += `<div style="padding-left:${pad}px">`;
      html += `&#9744; <strong>${s.name}</strong>${assignee}${due}`;
      html += `</div>`;
    }
    // Nested subtasks
    if (s.subtasks?.length) {
      html += renderSubtasks(s.subtasks, indent + 1);
    }
  }
  return html;
}

// Build the full project note
async function buildProjectNote(
  projectName: string,
  sectionedTasks: { section: string; tasks: any[] }[]
): Promise<string | null> {
  // Flatten all tasks for stats
  const allTasks = sectionedTasks.flatMap(s => s.tasks);
  if (!allTasks.length) return null;

  const incomplete = allTasks.filter(t => !t.completed);
  const complete = allTasks.filter(t => t.completed);
  const now = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  const today = new Date().toISOString().split('T')[0];

  // Progress
  const total = allTasks.length;
  const doneCount = complete.length;
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  let html = '';

  // ===== HEADER =====
  html += `<h2>${projectName}</h2>`;
  html += `<p><strong>Last synced:</strong> ${now}</p>`;
  html += `<p><strong>Progress:</strong> ${pct}% complete (${doneCount} of ${total} tasks done)</p>`;

  // Overdue warning
  const overdue = incomplete.filter(t => t.due_on && t.due_on < today);
  if (overdue.length) {
    html += `<p style="color:#cc0000"><strong>OVERDUE: ${overdue.length} task${overdue.length > 1 ? 's' : ''} past due date</strong></p>`;
  }

  html += '<hr/>';

  // ===== OPEN TASKS BY SECTION =====
  for (const { section, tasks } of sectionedTasks) {
    const sectionOpen = tasks.filter(t => !t.completed);
    const sectionDone = tasks.filter(t => t.completed);

    if (sectionOpen.length === 0 && sectionDone.length === 0) continue;

    html += `<h3>${section} <span style="color:#888;font-weight:normal">(${sectionDone.length}/${tasks.length} done)</span></h3>`;

    // Open tasks in this section
    if (sectionOpen.length > 0) {
      html += '<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;margin-bottom:8px">';
      html += '<tr style="background:#f5f5f5"><th style="text-align:left">Task</th><th style="width:120px">Assignee</th><th style="width:90px">Due</th></tr>';

      for (const t of sectionOpen) {
        const assignee = t.assignee?.name || '<span style="color:#ccc">Unassigned</span>';
        const due = t.due_on || '—';
        const isOverdue = t.due_on && t.due_on < today;
        const dueStyle = isOverdue ? 'color:#cc0000;font-weight:bold' : '';
        const tags = (t.tags || []).map((tg: any) => `<span style="background:#e8e8e8;padding:1px 6px;border-radius:3px;font-size:11px">${tg.name}</span>`).join(' ');

        // Task name
        let taskCell = `<strong>${t.name}</strong>`;
        if (tags) taskCell += ` ${tags}`;

        // Description
        if (t.notes) {
          const preview = t.notes.substring(0, 150).replace(/\n/g, ' ').replace(/</g, '&lt;');
          taskCell += `<br/><span style="color:#666;font-size:12px">${preview}${t.notes.length > 150 ? '...' : ''}</span>`;
        }

        html += `<tr>`;
        html += `<td>${taskCell}</td>`;
        html += `<td style="text-align:center">${assignee}</td>`;
        html += `<td style="text-align:center;${dueStyle}">${due}</td>`;
        html += `</tr>`;

        // Subtasks
        if (t.num_subtasks > 0) {
          try {
            const subtasks = await getSubtasksDeep(t.gid);
            if (subtasks.length > 0) {
              const subDone = subtasks.filter((s: any) => s.completed).length;
              html += `<tr><td colspan="3" style="background:#fafafa;padding:8px 12px">`;
              html += `<strong style="font-size:12px">Subtasks (${subDone}/${subtasks.length} done):</strong>`;
              html += renderSubtasks(subtasks);
              html += `</td></tr>`;
            }
          } catch {
            // Skip subtasks on error
          }
        }
      }
      html += '</table>';
    }

    // Completed tasks in this section (collapsed summary)
    if (sectionDone.length > 0) {
      html += `<div style="margin-bottom:12px;padding:8px 12px;background:#f0f8f0;border-radius:4px">`;
      html += `<strong style="color:#00856f;font-size:13px">Completed in ${section} (${sectionDone.length}):</strong><br/>`;
      for (const t of sectionDone.slice(0, 10)) {
        const assignee = t.assignee?.name || '';
        const completedDate = t.completed_at
          ? new Date(t.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          : '';
        html += `<span style="color:#888;font-size:12px"><span style="color:#00a86b">&#10003;</span> <s>${t.name}</s>`;
        if (assignee) html += ` — ${assignee}`;
        if (completedDate) html += ` (${completedDate})`;
        html += `</span><br/>`;
      }
      if (sectionDone.length > 10) {
        html += `<span style="color:#888;font-size:12px"><em>+ ${sectionDone.length - 10} more</em></span>`;
      }
      html += `</div>`;
    }
  }

  // ===== TEAM WORKLOAD =====
  const assigneeTasks: Record<string, { open: number; done: number; overdue: number }> = {};
  for (const t of allTasks) {
    const name = t.assignee?.name || 'Unassigned';
    if (!assigneeTasks[name]) assigneeTasks[name] = { open: 0, done: 0, overdue: 0 };
    if (t.completed) {
      assigneeTasks[name].done++;
    } else {
      assigneeTasks[name].open++;
      if (t.due_on && t.due_on < today) assigneeTasks[name].overdue++;
    }
  }

  html += '<hr/>';
  html += '<h3>Team Workload</h3>';
  html += '<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%">';
  html += '<tr style="background:#f5f5f5"><th style="text-align:left">Person</th><th style="width:60px">Open</th><th style="width:70px">Overdue</th><th style="width:60px">Done</th></tr>';
  const sortedAssignees = Object.entries(assigneeTasks).sort((a, b) => b[1].open - a[1].open);
  for (const [name, counts] of sortedAssignees) {
    const overdueStyle = counts.overdue > 0 ? 'color:#cc0000;font-weight:bold' : '';
    html += `<tr><td>${name}</td><td style="text-align:center">${counts.open}</td><td style="text-align:center;${overdueStyle}">${counts.overdue}</td><td style="text-align:center">${counts.done}</td></tr>`;
  }
  html += '</table>';

  html += `<p style="color:#888;font-size:11px;margin-top:12px">Auto-synced by AIO TaskSync</p>`;
  return html;
}

// Sync a single mapping
async function syncOne(
  objectType: 'companies' | 'deals',
  objectId: string,
  mapping: { projectId: string; projectName: string; companyName?: string; dealName?: string },
  syncState: SyncState,
  force: boolean = false
): Promise<{ status: string; reason?: string; error?: string }> {
  const key = `${objectType}:${objectId}`;

  try {
    const projectInfo = await getProjectInfo(mapping.projectId);
    const lastModified = projectInfo.modified_at;
    const lastSynced = syncState.lastSync?.[key];

    // Skip if unchanged (unless forced)
    if (!force && lastSynced && lastSynced === lastModified) {
      return { status: 'unchanged', reason: 'No changes since last sync' };
    }

    // Fetch tasks grouped by section
    const sectionedTasks = await getProjectTasksBySections(mapping.projectId);
    const note = await buildProjectNote(mapping.projectName, sectionedTasks);

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

export async function runFullSync(force: boolean = false, runType: 'manual' | 'auto' = 'auto'): Promise<SyncResult[]> {
  const mappings = await getMappings();
  const syncState = await getSyncState();
  const results: SyncResult[] = [];

  for (const [companyId, mapping] of Object.entries(mappings.companies || {})) {
    if (!mapping.projectId) continue;
    const result = await syncOne('companies', companyId, mapping, syncState, force);
    results.push({ type: 'company', id: companyId, name: mapping.companyName || '', ...result });
  }

  for (const [dealId, mapping] of Object.entries(mappings.deals || {})) {
    if (!mapping.projectId) continue;
    const result = await syncOne('deals', dealId, mapping, syncState, force);
    results.push({ type: 'deal', id: dealId, name: mapping.dealName || '', ...result });
  }

  await saveSyncState(syncState, runType);
  return results;
}
