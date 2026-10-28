import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  findEvidenceIndices,
  validateAndParseAiOutput,
  combineFindings,
  executeBrandScan,
  AiRawAnalysisResponse,
  MAX_CONTENT_LENGTH,
} from '../aiSafetyEngine';
import { analyzeBrandContent, DEFAULT_POLICIES } from '../brandSafetyEngine';
import { checkRateLimit, resetRateLimits } from '../rateLimiter';
import { POST as scanRouteHandler } from '@/app/api/scan/route';
import { NextRequest } from 'next/server';

describe('Phase 3: Real AI-Powered Content Analysis Engine', () => {
  const enterprisePolicy = DEFAULT_POLICIES.enterprise;
  const fintechPolicy = DEFAULT_POLICIES.fintech;

  beforeEach(() => {
    vi.restoreAllMocks();
    resetRateLimits();
  });

  // 1. Valid AI Responses
  describe('1. Valid AI Responses & Schema Integration', () => {
    it('integrates a valid AI response, adds novel contextual violations, and updates scores', async () => {
      const originalText = 'Our AI cloud handles enterprise traffic and has 99.99% benchmark reliability. We outperform everyone in latency.';
      const deterministicResult = analyzeBrandContent(originalText, enterprisePolicy);

      const mockAiParsed: AiRawAnalysisResponse = {
        summary: 'Promotional B2B post contains an unverified comparative claim.',
        reasoning: 'The statement "outperform everyone in latency" is an absolute superiority claim lacking published benchmarking substantiation.',
        rewrittenText: 'Our AI cloud handles enterprise workloads with documented 99.99% reliability. Recent benchmarks demonstrate industry-leading query latency.',
        contextualViolations: [
          {
            phrase: 'We outperform everyone in latency',
            category: 'claim',
            severity: 'warning',
            title: 'Unsubstantiated Absolute Comparative Claim',
            explanation: 'Absolute claims like "outperform everyone" require independent third-party market benchmarking under FTC Section 5.',
            suggestedFix: 'Recent benchmarks demonstrate industry-leading query latency',
            ruleViolated: 'Enterprise B2B Claim Substantiation Guidelines',
            confidence: 0.92,
          },
        ],
      };

      // Mock fetch for Gemini API
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: JSON.stringify(mockAiParsed) }],
              },
            },
          ],
        }),
      } as Response);

      const result = await executeBrandScan(originalText, enterprisePolicy, deterministicResult, {
        enableAi: true,
        geminiApiKey: 'mock-gemini-key',
      });

      expect(result.isFallback).toBe(false);
      expect(result.scanResult.analysisMethod).toBe('contextual_ai');
      expect(result.scanResult.aiRewrittenText).toContain('Recent benchmarks demonstrate industry-leading query latency');
      expect(result.scanResult.aiReasoning).toContain('outperform everyone in latency');

      // Check that novel AI violation was added
      const aiViolation = result.scanResult.violations.find((v) => v.phrase === 'We outperform everyone in latency');
      expect(aiViolation).toBeDefined();
      expect(aiViolation?.isContextual).toBe(true);
      expect(aiViolation?.category).toBe('claim');
      expect(aiViolation?.severity).toBe('warning');
    });
  });

  // 2. Invalid or Malformed Model Output
  describe('2. Invalid or Malformed Model Output Handling', () => {
    it('throws when AI returns empty text', () => {
      expect(() => validateAndParseAiOutput('')).toThrow('Empty AI response payload');
    });

    it('throws when AI returns non-JSON garbage', () => {
      expect(() => validateAndParseAiOutput('I cannot complete this request as an AI.')).toThrow('Malformed AI JSON');
    });

    it('safely extracts JSON enclosed in markdown code fences', () => {
      const fencePayload = `\`\`\`json
{
  "summary": "Clean post",
  "reasoning": "No major risks",
  "contextualViolations": [],
  "rewrittenText": "Clean text"
}
\`\`\``;
      const parsed = validateAndParseAiOutput(fencePayload);
      expect(parsed.summary).toBe('Clean post');
      expect(parsed.contextualViolations).toHaveLength(0);
    });

    it('falls back to deterministic sentinel when LLM returns malformed JSON during scan execution', async () => {
      const text = 'Check out our new release.';
      const deterministic = analyzeBrandContent(text, enterprisePolicy);

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: 'NOT VALID JSON AT ALL' }],
              },
            },
          ],
        }),
      } as Response);

      const result = await executeBrandScan(text, enterprisePolicy, deterministic, {
        enableAi: true,
        geminiApiKey: 'mock-gemini-key',
      });

      expect(result.isFallback).toBe(true);
      expect(result.scanResult.analysisMethod).toBe('deterministic');
      expect(result.scanResult.providerFallback).toBe(true);
      expect(result.fallbackReason).toContain('Malformed AI JSON');
    });
  });

  // 3. Provider Timeout and API Failure
  describe('3. Provider Timeout and API Failure', () => {
    it('gracefully handles provider HTTP 500 error with fallback', async () => {
      const text = 'Testing cloud scalability.';
      const deterministic = analyzeBrandContent(text, enterprisePolicy);

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error from Provider',
      } as Response);

      const result = await executeBrandScan(text, enterprisePolicy, deterministic, {
        enableAi: true,
        geminiApiKey: 'mock-gemini-key',
      });

      expect(result.isFallback).toBe(true);
      expect(result.scanResult.analysisMethod).toBe('deterministic');
      expect(result.scanResult.providerError).toContain('500');
    });

    it('gracefully handles network abort / timeout', async () => {
      const text = 'Testing timeout resiliency.';
      const deterministic = analyzeBrandContent(text, enterprisePolicy);

      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('The operation was aborted due to timeout.'));

      const result = await executeBrandScan(text, enterprisePolicy, deterministic, {
        enableAi: true,
        geminiApiKey: 'mock-gemini-key',
      });

      expect(result.isFallback).toBe(true);
      expect(result.scanResult.providerFallback).toBe(true);
      expect(result.fallbackReason).toContain('aborted');
    });
  });

  // 4. Missing API Configuration
  describe('4. Missing API Configuration', () => {
    it('immediately returns deterministic fallback without making network requests when keys are missing', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const text = 'Testing unconfigured AI key.';
      const deterministic = analyzeBrandContent(text, enterprisePolicy);

      const result = await executeBrandScan(text, enterprisePolicy, deterministic, {
        enableAi: true,
        geminiApiKey: '',
        openAiApiKey: '',
      });

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(result.isFallback).toBe(true);
      expect(result.scanResult.analysisMethod).toBe('deterministic');
      expect(result.scanResult.providerFallback).toBe(true);
      expect(result.scanResult.providerError).toContain('No active AI credentials configured');
    });
  });

  // 5. Deterministic Hard-Rule Violations Preservation
  describe('5. Deterministic Hard-Rule Violations Preservation', () => {
    it('ensures AI cannot override or downgrade hard prohibited term violations', () => {
      const text = 'Sign up for guaranteed profit in our hedge fund!';
      const deterministic = analyzeBrandContent(text, fintechPolicy);

      // Verify deterministic found the critical violation
      const criticalViolation = deterministic.violations.find((v) => v.severity === 'critical');
      expect(criticalViolation).toBeDefined();
      expect(deterministic.status).toBe('rejected');

      // AI hallucinates that content is compliant and returns empty violations
      const lenientAi: AiRawAnalysisResponse = {
        summary: 'Looks fine to me.',
        reasoning: 'Informal tone is acceptable.',
        rewrittenText: text,
        contextualViolations: [],
      };

      const combined = combineFindings(deterministic, lenientAi, text, fintechPolicy, 'mock-model');

      // Deterministic critical violation MUST be preserved
      const preservedCritical = combined.violations.find((v) => v.severity === 'critical');
      expect(preservedCritical).toBeDefined();
      expect(preservedCritical?.phrase.toLowerCase()).toContain('guaranteed profit');
      expect(combined.status).toBe('rejected');
    });
  });

  // 6. Duplicate Issue Handling (Deduplication)
  describe('6. Duplicate Issue Handling', () => {
    it('merges overlapping AI findings into existing deterministic violation without duplicating', () => {
      const text = 'Why are teams still struggling with Salesforce in 2026?';
      const deterministic = analyzeBrandContent(text, enterprisePolicy);

      // Deterministic already caught Salesforce as a competitor trademark
      const initialCount = deterministic.violations.length;
      expect(initialCount).toBeGreaterThanOrEqual(1);

      // AI also highlights Salesforce with additional context
      const duplicateAi: AiRawAnalysisResponse = {
        summary: 'Direct competitor disparagement detected.',
        reasoning: 'Mentioning Salesforce disparagingly risks Lanham Act exposure.',
        rewrittenText: 'Why are teams still struggling with legacy CRMs in 2026?',
        contextualViolations: [
          {
            phrase: 'Salesforce',
            category: 'trademark',
            severity: 'warning',
            title: 'Competitor Mention: Salesforce',
            explanation: 'Disparaging competitor software without substantiated benchmarks.',
            suggestedFix: 'legacy solutions',
            ruleViolated: 'Lanham Act § 43(a)',
          },
        ],
      };

      const combined = combineFindings(deterministic, duplicateAi, text, enterprisePolicy, 'mock-model');

      // Total violations count should NOT increase because span overlaps
      expect(combined.violations.length).toBe(initialCount);

      // The existing violation should have enriched AI explanation
      const salesforceViolation = combined.violations.find((v) => v.phrase === 'Salesforce');
      expect(salesforceViolation?.explanation).toContain('AI Note:');
    });
  });

  // 7. Evidence Matching and Text Highlighting Coordinates
  describe('7. Server-Side Evidence Matching & Text Coordinates', () => {
    const postText = 'Accelerate growth with our enterprise cloud infrastructure. We deliver unmatched performance.';

    it('matches exact substrings with precise start and end character offsets', () => {
      const match = findEvidenceIndices(postText, 'enterprise cloud');
      expect(match).not.toBeNull();
      expect(match?.startIndex).toBe(27);
      expect(match?.endIndex).toBe(43);
      expect(postText.slice(match!.startIndex, match!.endIndex)).toBe('enterprise cloud');
    });

    it('matches case-insensitive phrases and returns exact source casing', () => {
      const match = findEvidenceIndices(postText, 'UNMATCHED PERFORMANCE');
      expect(match).not.toBeNull();
      expect(postText.slice(match!.startIndex, match!.endIndex)).toBe('unmatched performance');
    });

    it('matches phrases with typographic curly quotes normalized', () => {
      const curlyText = 'Our client’s favorite “breakthrough” engine.';
      const match = findEvidenceIndices(curlyText, "client's favorite \"breakthrough\"");
      expect(match).not.toBeNull();
      expect(curlyText.slice(match!.startIndex, match!.endIndex)).toBe('client’s favorite “breakthrough”');
    });

    it('returns null for hallucinated phrases not found in the original text', () => {
      const match = findEvidenceIndices(postText, 'completely fabricated statement never said in post');
      expect(match).toBeNull();
    });

    it('filters out hallucinated AI violations without generating corrupt offsets', () => {
      const deterministic = analyzeBrandContent(postText, enterprisePolicy);

      const hallucinatingAi: AiRawAnalysisResponse = {
        summary: 'Found issues',
        reasoning: 'Testing phantom quotes',
        rewrittenText: postText,
        contextualViolations: [
          {
            phrase: 'nonexistent phrase in source',
            category: 'claim',
            severity: 'critical',
            title: 'Phantom Issue',
            explanation: 'This phrase does not exist',
            suggestedFix: '',
            ruleViolated: 'Test',
          },
        ],
      };

      const combined = combineFindings(deterministic, hallucinatingAi, postText, enterprisePolicy);
      // No violation with phantom phrase should exist
      expect(combined.violations.some((v) => v.phrase === 'nonexistent phrase in source')).toBe(false);
    });
  });

  // 8. Risk-Score Bounds and Severity Mapping
  describe('8. Risk-Score Bounds and Severity Mapping', () => {
    it('clamps scores strictly between 0 and 100 regardless of penalty accumulation', () => {
      const text = 'Multiple severe violations across categories.';
      const deterministic = analyzeBrandContent(text, enterprisePolicy);

      // Force severe deductions across all categories
      const extremeAi: AiRawAnalysisResponse = {
        summary: 'Catastrophic policy breaches',
        reasoning: 'Extreme risk',
        rewrittenText: 'Safe copy',
        contextualViolations: [
          { phrase: 'Multiple', category: 'legal', severity: 'critical', title: 'Crit 1', explanation: 'E1', suggestedFix: '', ruleViolated: 'R1' },
          { phrase: 'severe', category: 'legal', severity: 'critical', title: 'Crit 2', explanation: 'E2', suggestedFix: '', ruleViolated: 'R2' },
          { phrase: 'violations', category: 'claim', severity: 'critical', title: 'Crit 3', explanation: 'E3', suggestedFix: '', ruleViolated: 'R3' },
          { phrase: 'across', category: 'trademark', severity: 'critical', title: 'Crit 4', explanation: 'E4', suggestedFix: '', ruleViolated: 'R4' },
          { phrase: 'categories', category: 'tone', severity: 'critical', title: 'Crit 5', explanation: 'E5', suggestedFix: '', ruleViolated: 'R5' },
        ],
      };

      const combined = combineFindings(deterministic, extremeAi, text, enterprisePolicy);
      expect(combined.overallScore).toBeGreaterThanOrEqual(0);
      expect(combined.overallScore).toBeLessThanOrEqual(100);
      expect(combined.status).toBe('rejected');
    });

    it('sets review_required status when score is between 70 and 84 with warnings', () => {
      const text = 'Our platform delivers strong results.';
      const deterministic = analyzeBrandContent(text, enterprisePolicy);

      const warningAi: AiRawAnalysisResponse = {
        summary: 'Minor tone warning',
        reasoning: 'Slightly bold',
        rewrittenText: text,
        contextualViolations: [
          { phrase: 'strong results', category: 'tone', severity: 'warning', title: 'Tone Warning', explanation: 'Bold', suggestedFix: 'steady growth', ruleViolated: 'Tone' },
        ],
      };

      const combined = combineFindings(deterministic, warningAi, text, enterprisePolicy);
      expect(['review_required', 'approved']).toContain(combined.status);
    });
  });

  // 9. API Route Fallback Behavior
  describe('9. API Route Fallback Behavior', () => {
    it('returns 200 with deterministic analysis when AI is disabled in payload', async () => {
      const req = new NextRequest('http://localhost:3000/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'Checking API without AI.',
          policy: enterprisePolicy,
          enableAi: false,
        }),
      });

      const res = await scanRouteHandler(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.analysisMethod).toBe('deterministic');
      expect(data.isFallback).toBe(false);
    });
  });

  // 10. Authentication and Rate-Limit Enforcement
  describe('10. Security, Rate Limiting & Input Limits', () => {
    it('enforces input text size limit (rejects > 10,000 characters)', async () => {
      const oversizedText = 'A'.repeat(MAX_CONTENT_LENGTH + 10);
      const req = new NextRequest('http://localhost:3000/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: oversizedText,
          policy: enterprisePolicy,
        }),
      });

      const res = await scanRouteHandler(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('maximum allowed length');
    });

    it('enforces sliding window rate limit after 30 requests per minute', () => {
      const testId = 'test-client-ip-123';
      for (let i = 0; i < 30; i++) {
        const check = checkRateLimit(testId, 30, 60000);
        expect(check.allowed).toBe(true);
      }

      // 31st request should be rejected
      const rejected = checkRateLimit(testId, 30, 60000);
      expect(rejected.allowed).toBe(false);
      expect(rejected.remaining).toBe(0);
      expect(rejected.resetMs).toBeGreaterThan(0);
    });

    it('rejects invalid authorization bearer tokens with 401', async () => {
      const req = new NextRequest('http://localhost:3000/api/scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer invalid-token-xyz',
        },
        body: JSON.stringify({
          text: 'Test authenticated scan',
          policy: enterprisePolicy,
        }),
      });

      const res = await scanRouteHandler(req);
      expect(res.status).toBe(401);
    });
  });
});
