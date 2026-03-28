import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getCompanies } from '@/lib/hubspot';

export async function GET() {
  try {
    await requireAuth();
    const companies = await getCompanies();
    return NextResponse.json(companies);
  } catch (err: any) {
    const status = err.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: err.message }, { status });
  }
}
