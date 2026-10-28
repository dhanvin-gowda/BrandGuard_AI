import { NextRequest, NextResponse } from 'next/server';
import { analyzeBrandContent } from '@/lib/brandSafetyEngine';
import { executeBrandScan, MAX_CONTENT_LENGTH } from '@/lib/aiSafetyEngine';
import { BrandPolicy } from '@/types/brandguard';
import { persistScanResult } from '@/lib/scanStore';
import { verifyServerSession, isAuthError } from '@/lib/authServer';
import { checkRateLimit } from '@/lib/rateLimiter';

export async function POST(req: NextRequest) {
  try {
    // 1. Rate limiting
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';
    let actor = undefined;

    // Optional user authentication for scan provenance
    if (req.headers.get('authorization')) {
      const authResult = await verifyServerSession(req);
      if (isAuthError(authResult)) {
        return NextResponse.json(
          { error: authResult.error },
          { status: authResult.status }
        );
      }
      actor = authResult.user;
    }

    const rateKey = actor?.id ? `user:${actor.id}` : `ip:${ip}`;
    const rateCheck = checkRateLimit(rateKey, 30, 60000);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Maximum 30 scans per minute allowed.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil(rateCheck.resetMs / 1000)),
          },
        }
      );
    }

    // 2. Payload validation
    const body = await req.json().catch(() => null);

    if (!body || typeof body.text !== 'string' || !body.policy) {
      return NextResponse.json(
        { error: 'Invalid payload. "text" (string) and "policy" (BrandPolicy) are required.' },
        { status: 400 }
      );
    }

    const text = body.text;
    const policy = body.policy as BrandPolicy;
    const enableAi = body.enableAi !== false; // default true if not specified
    const shouldPersist = Boolean(body.persist);

    // Enforce reasonable input size limit
    if (text.length > MAX_CONTENT_LENGTH) {
      return NextResponse.json(
        {
          error: `Content exceeds maximum allowed length of ${MAX_CONTENT_LENGTH} characters. Provided: ${text.length} characters.`,
        },
        { status: 400 }
      );
    }

    // 3. Deterministic heuristic analysis as the rock-solid ground truth
    const deterministicResult = analyzeBrandContent(text, policy);

    // 4. Augment with contextual LLM analysis if enabled
    const executionResult = await executeBrandScan(text, policy, deterministicResult, {
      enableAi,
    });

    const finalResult = executionResult.scanResult;

    // 5. Persist to database if requested or if authenticated and text is non-empty
    let scanId: string | undefined = undefined;
    if (shouldPersist && text.trim().length > 0) {
      scanId = await persistScanResult(finalResult, text, policy.id, actor);
    }

    return NextResponse.json({
      ...finalResult,
      scanId,
      usedModel: executionResult.usedModel,
      isFallback: executionResult.isFallback,
      fallbackReason: executionResult.fallbackReason,
    });
  } catch (error) {
    console.error('Scan API error:', error);
    return NextResponse.json(
      { error: 'Internal server error while evaluating brand safety.' },
      { status: 500 }
    );
  }
}
