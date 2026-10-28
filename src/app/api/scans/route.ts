import { NextRequest, NextResponse } from 'next/server';
import { getPersistentScans } from '@/lib/scanStore';
import { verifyServerSession, isAuthError } from '@/lib/authServer';
import { markDynamic } from '@/lib/dynamicRoute';

export async function GET(req: NextRequest) {
  await markDynamic();
  try {
    let currentUser = undefined;
    if (req.headers.get('authorization')) {
      const authResult = await verifyServerSession(req);
      if (!isAuthError(authResult)) {
        currentUser = authResult.user;
      }
    }

    const scans = await getPersistentScans(currentUser);
    return NextResponse.json({ scans });
  } catch (error) {
    console.error('Error fetching persistent scans:', error);
    return NextResponse.json({ error: 'Failed to retrieve scan records.' }, { status: 500 });
  }
}
