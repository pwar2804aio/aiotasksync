import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDeals } from '@/lib/hubspot';

export async function GET() {
  try {
    await requireAuth();
    const deals = await getDeals();
    return NextResponse.json(deals);
  } catch (err: any) {
    const status = err.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: err.message }, { status });
  }
}
