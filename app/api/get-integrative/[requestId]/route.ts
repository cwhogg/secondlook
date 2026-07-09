import { NextRequest, NextResponse } from 'next/server';
import { getIntegrativeRun } from '@/lib/admin/integrative-runs';

export async function GET(_request: NextRequest, { params }: { params: { requestId: string } }) {
  const { requestId } = params;
  if (!requestId) {
    return NextResponse.json({ error: 'Missing requestId' }, { status: 400 });
  }
  const run = await getIntegrativeRun(requestId);
  if (!run) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ run });
}
