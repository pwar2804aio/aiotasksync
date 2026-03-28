import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getMappings } from '@/lib/store';
import { getProjectTasks } from '@/lib/asana';
import { createNote } from '@/lib/hubspot';

function buildNoteHTML(projectName: string, tasks: any[]): string | null {
  if (!tasks.length) return null;

  const incomplete = tasks.filter(t => !t.completed);
  const complete = tasks.filter(t => t.completed);
  const now = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  let html = `<h2>Asana Project Update: ${projectName}</h2>`;
  html += `<p><strong>Synced:</strong> ${now}</p>`;
  html += `<p><strong>Total:</strong> ${tasks.length} | <strong>Open:</strong> ${incomplete.length} | <strong>Done:</strong> ${complete.length}</p>`;

  if (incomplete.length) {
    html += '<h3>Open Tasks</h3>';
    html += '<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%">';
    html += '<tr style="background:#f0f0f0"><th>Task</th><th>Assignee</th><th>Due</th><th>Tags</th></tr>';
    for (const t of incomplete) {
      const assignee = t.assignee?.name || 'Unassigned';
      const due = t.due_on || 'No date';
      const tags = (t.tags || []).map((tg: any) => tg.name).join(', ') || '-';
      html += `<tr><td>${t.name}</td><td>${assignee}</td><td>${due}</td><td>${tags}</td></tr>`;
    }
    html += '</table>';
  }

  if (complete.length) {
    html += `<h3>Completed (${complete.length})</h3><ul>`;
    for (const t of complete.slice(0, 20)) {
      html += `<li><s>${t.name}</s> — ${t.assignee?.name || 'Unassigned'}</li>`;
    }
    if (complete.length > 20) {
      html += `<li><em>...and ${complete.length - 20} more</em></li>`;
    }
    html += '</ul>';
  }

  html += '<p style="color:#888;font-size:12px">Synced by AIO TaskSync</p>';
  return html;
}

export async function POST() {
  try {
    await requireAuth();
    const mappings = await getMappings();
    const results: any[] = [];

    // Sync companies
    for (const [companyId, mapping] of Object.entries(mappings.companies || {})) {
      if (!mapping.projectId) continue;
      try {
        const tasks = await getProjectTasks(mapping.projectId);
        const note = buildNoteHTML(mapping.projectName, tasks);
        if (note) {
          await createNote('companies', companyId, note);
          results.push({ type: 'company', id: companyId, name: mapping.companyName || '', status: 'success' });
        } else {
          results.push({ type: 'company', id: companyId, name: mapping.companyName || '', status: 'skipped', reason: 'No tasks' });
        }
      } catch (err: any) {
        results.push({ type: 'company', id: companyId, name: mapping.companyName || '', status: 'error', error: err.message });
      }
    }

    // Sync deals
    for (const [dealId, mapping] of Object.entries(mappings.deals || {})) {
      if (!mapping.projectId) continue;
      try {
        const tasks = await getProjectTasks(mapping.projectId);
        const note = buildNoteHTML(mapping.projectName, tasks);
        if (note) {
          await createNote('deals', dealId, note);
          results.push({ type: 'deal', id: dealId, name: mapping.dealName || '', status: 'success' });
        } else {
          results.push({ type: 'deal', id: dealId, name: mapping.dealName || '', status: 'skipped', reason: 'No tasks' });
        }
      } catch (err: any) {
        results.push({ type: 'deal', id: dealId, name: mapping.dealName || '', status: 'error', error: err.message });
      }
    }

    return NextResponse.json({ results });
  } catch (err: any) {
    const status = err.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: err.message }, { status });
  }
}
