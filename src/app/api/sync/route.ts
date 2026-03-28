import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { runFullSync } from '@/lib/sync';

// Manual sync (from UI button)
export async function POST() {
  try {
    await requireAuth();
    const results = await runFullSync();
    return NextResponse.json({ results });
  } catch (err: any) {
    const status = err.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: err.message }, { status });
  }
}

// Auto-sync (called by Vercel cron)
export async function GET(req: NextRequest) {
  // Verify cron secret to prevent unauthorized triggers
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const results = await runFullSync();
    const synced = results.filter(r => r.status === 'success').length;
    const unchanged = results.filter(r => r.status === 'unchanged').length;
    const errors = results.filter(r => r.status === 'error').length;
    return NextResponse.json({
      summary: `Synced: ${synced}, Unchanged: ${unchanged}, Errors: ${errors}`,
      results,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
