import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as scanPost } from '../../app/api/scan/route';
import { POST as submissionsPost } from '../../app/api/workflow/submissions/route';
import { POST as reviewsPost } from '../../app/api/workflow/reviews/route';
import { GET as auditEventsGet } from '../../app/api/workflow/audit-events/route';
import {
  createOrUpdateSubmission,
  getSubmissionById,
  getWorkflowSubmissions,
  resetWorkflowStateForTesting,
  DEMO_USERS,
} from '../workflowStore';
import {
  persistScanResult,
  getPersistentScans,
  persistentScanToUiScan,
  resetScanStoreForTesting,
} from '../scanStore';
import { analyzeBrandContent, DEFAULT_POLICIES } from '../brandSafetyEngine';
import { executeBrandScan, MAX_CONTENT_LENGTH } from '../aiSafetyEngine';
import { createTestAuthHeader } from '../authServer';
import { computeMetrics, needsAttention } from '../metrics';
import { getScan } from '../mock-data';
import type { BrandPolicy, AuditEvent } from '@/types/brandguard';

describe('Phase 4: Complete End-to-End Workflow & Demo Readiness Suite', () => {
  const originalEnvKey = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'mock-gemini-test-key';
    resetWorkflowStateForTesting();
    resetScanStoreForTesting();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env.GEMINI_API_KEY = originalEnvKey;
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // 1. The Complete 14-Step User Workflow (Live Demo Simulation)
  // ==========================================================================
  describe('1. Complete 14-Step User Workflow (End-to-End)', () => {
    it('executes the complete sequence from creator scan to reviewer decision and dashboard analytics', async () => {
      // ----------------------------------------------------------------------
      // Step 1: Sign in as an authorized user (Content Creator)
      // ----------------------------------------------------------------------
      const creatorAuthHeader = createTestAuthHeader('test-creator-token');
      expect(creatorAuthHeader).toBe('Bearer test-creator-token');

      // ----------------------------------------------------------------------
      // Step 2: Select a brand policy (Fintech Compliant Policy)
      // ----------------------------------------------------------------------
      const fintechPolicy: BrandPolicy = DEFAULT_POLICIES.fintech;
      expect(fintechPolicy.name).toContain('Fintech');
      expect(fintechPolicy.prohibitedTerms.length).toBeGreaterThan(0);

      // ----------------------------------------------------------------------
      // Step 3: Paste a high-risk LinkedIn post into the scanner
      // ----------------------------------------------------------------------
      const originalPost =
        'Earn a guaranteed profit with our new automated trading engine. Outperforms Revolut and Robinhood with zero risk! Invest now before spots close.';

      // ----------------------------------------------------------------------
      // Step 4: Run analysis using deterministic rules + configured AI provider
      // Mock LLM API call to ensure zero external cost and fast deterministic execution
      // ----------------------------------------------------------------------
      const mockLlmResponse = {
        summary: 'Multiple regulatory violations detected including guaranteed returns, competitor slander, and missing disclosures.',
        reasoning: 'Replaces absolute guarantees with factual capabilities and adds required regulatory disclaimers.',
        contextualViolations: [
          {
            phrase: 'guaranteed profit',
            category: 'legal',
            severity: 'critical',
            title: 'Guaranteed Yield Claim',
            explanation: 'Promising guaranteed profit violates SEC Rule 156 and FTC deceptive advertising guidelines.',
            suggestedFix: 'target variable returns (capital at risk)',
            ruleViolated: 'SEC Rule 156',
            confidence: 0.98,
          },
          {
            phrase: 'zero risk',
            category: 'claim',
            severity: 'critical',
            title: 'Absolute Risk-Free Claim',
            explanation: 'Claiming zero risk is prohibited for financial trading products.',
            suggestedFix: 'with automated risk mitigation safeguards',
            ruleViolated: 'FCA / SEC Risk Disclosure Standard',
            confidence: 0.96,
          },
        ],
        rewrittenText:
          'Explore our automated trading engine engineered for modern financial workflows. Capital at risk. Terms apply. #Fintech',
      };

      vi.spyOn(global, 'fetch').mockImplementationOnce(async () => {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [{ text: JSON.stringify(mockLlmResponse) }],
                },
              },
            ],
          }),
        } as unknown as Response;
      });

      const scanReq = new NextRequest('http://localhost:3000/api/scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: creatorAuthHeader,
        },
        body: JSON.stringify({
          text: originalPost,
          policy: fintechPolicy,
          enableAi: true,
          persist: true,
        }),
      });

      const scanRes = await scanPost(scanReq);
      expect(scanRes.status).toBe(200);
      const scanData = await scanRes.json();

      // ----------------------------------------------------------------------
      // Step 5: Verify risk score, severity, findings, evidence, and suggested rewrite
      // ----------------------------------------------------------------------
      expect(scanData.overallScore).toBeLessThanOrEqual(70);
      expect(scanData.status).toBe('rejected');
      expect(scanData.violations.length).toBeGreaterThanOrEqual(2);
      expect(scanData.aiRewrittenText).toBeDefined();
      expect(scanData.usedModel).toBe('gemini-1.5-flash');
      expect(scanData.isFallback).toBe(false);

      // ----------------------------------------------------------------------
      // Step 6: Confirm highlighted text matches the original post
      // ----------------------------------------------------------------------
      for (const v of scanData.violations) {
        if (v.startIndex !== undefined && v.endIndex !== undefined && v.startIndex > 0) {
          const slicedText = originalPost.slice(v.startIndex, v.endIndex);
          expect(slicedText.toLowerCase()).toContain(v.phrase.toLowerCase());
        }
      }

      // ----------------------------------------------------------------------
      // Step 7: Save the scan and verify it appears in scan history
      // ----------------------------------------------------------------------
      expect(scanData.scanId).toBeDefined();
      const savedScanId = scanData.scanId as string;

      const recentScans = await getPersistentScans(15);
      const matchingScan = recentScans.find((s) => s.id === savedScanId);
      expect(matchingScan).toBeDefined();
      expect(matchingScan?.content).toBe(originalPost);
      expect(matchingScan?.score).toBe(scanData.overallScore);

      // Verify dynamic lookup via getScan(id) does not 404
      const retrievedUiScan = getScan(savedScanId);
      expect(retrievedUiScan).toBeDefined();
      expect(retrievedUiScan?.id).toBe(savedScanId);
      expect(retrievedUiScan?.findings.length).toBeGreaterThan(0);

      // ----------------------------------------------------------------------
      // Step 8: Submit the content for review
      // ----------------------------------------------------------------------
      const submitReq = new NextRequest('http://localhost:3000/api/workflow/submissions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: creatorAuthHeader,
        },
        body: JSON.stringify({
          title: 'Q1 Automated Trading Engine Launch',
          content: originalPost,
          policyId: fintechPolicy.id,
        }),
      });

      const submitRes = await submissionsPost(submitReq);
      expect(submitRes.status).toBe(201);
      const { submission } = await submitRes.json();
      expect(submission.id).toMatch(/^sub-/);
      expect(submission.status).toBe('pending_review');
      expect(submission.version).toBe(1);

      // ----------------------------------------------------------------------
      // Step 9: Sign in as an authorized reviewer
      // ----------------------------------------------------------------------
      const reviewerAuthHeader = createTestAuthHeader('test-reviewer-token');
      expect(reviewerAuthHeader).toBe('Bearer test-reviewer-token');

      // ----------------------------------------------------------------------
      // Step 10: Reviewer requests changes with specific compliance feedback
      // ----------------------------------------------------------------------
      const reviewReq1 = new NextRequest('http://localhost:3000/api/workflow/reviews', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: reviewerAuthHeader,
        },
        body: JSON.stringify({
          submissionId: submission.id,
          decision: 'changes_requested',
          comments:
            'Please remove the guaranteed profit claim, eliminate competitor slander against Revolut and Robinhood, and add the required SEC disclaimer.',
        }),
      });

      const reviewRes1 = await reviewsPost(reviewReq1);
      expect(reviewRes1.status).toBe(200);
      const { submission: reviewOutcome1 } = await reviewRes1.json();
      expect(reviewOutcome1.status).toBe('changes_requested');
      expect(reviewOutcome1.reviews.length).toBe(1);
      expect(reviewOutcome1.reviews[0].comments).toContain('Please remove the guaranteed profit');

      // Creator revises the post using the suggested rewrite
      const revisedPost =
        'Introducing our automated trading engine engineered for modern financial workflows. Past performance is not indicative of future returns. Terms apply. #Fintech';

      const reviseReq = new NextRequest('http://localhost:3000/api/workflow/submissions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: creatorAuthHeader,
        },
        body: JSON.stringify({
          id: submission.id,
          title: submission.title,
          content: revisedPost,
          policyId: fintechPolicy.id,
        }),
      });

      const reviseRes = await submissionsPost(reviseReq);
      expect(reviseRes.status).toBe(200);
      const { submission: revisedSubmission } = await reviseRes.json();
      expect(revisedSubmission.version).toBe(2);
      expect(revisedSubmission.status).toBe('pending_review');

      // Reviewer reviews and approves the revision
      const reviewReq2 = new NextRequest('http://localhost:3000/api/workflow/reviews', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: reviewerAuthHeader,
        },
        body: JSON.stringify({
          submissionId: submission.id,
          decision: 'approved',
          comments: 'All SEC disclaimers in place and claims substantiated. Approved for LinkedIn publication.',
        }),
      });

      const reviewRes2 = await reviewsPost(reviewReq2);
      expect(reviewRes2.status).toBe(200);
      const { submission: approvedOutcome } = await reviewRes2.json();
      expect(approvedOutcome.status).toBe('approved');
      expect(approvedOutcome.reviews.length).toBe(2);

      // ----------------------------------------------------------------------
      // Step 11: Verify that the submission status and review comments persist
      // ----------------------------------------------------------------------
      const persistedSub = await getSubmissionById(submission.id);
      expect(persistedSub).not.toBeNull();
      expect(persistedSub?.status).toBe('approved');
      expect(persistedSub?.version).toBe(2);
      expect(persistedSub?.reviews.length).toBe(2);
      expect(persistedSub?.reviews[0].status).toBe('approved');
      expect(persistedSub?.reviews[1].status).toBe('changes_requested');

      // ----------------------------------------------------------------------
      // Step 12: Verify that corresponding audit events are recorded
      // ----------------------------------------------------------------------
      const auditReq = new NextRequest('http://localhost:3000/api/workflow/audit-events', {
        method: 'GET',
        headers: { Authorization: reviewerAuthHeader },
      });
      const auditRes = await auditEventsGet(auditReq);
      expect(auditRes.status).toBe(200);
      const { events: auditEvents } = await auditRes.json();

      expect(auditEvents.length).toBeGreaterThanOrEqual(4);
      const creationEvent = auditEvents.find(
        (e: AuditEvent) => e.targetId === submission.id && e.eventType === 'submission_created'
      );
      const approvalEvent = auditEvents.find(
        (e: AuditEvent) => e.targetId === submission.id && e.eventType === 'review_decided' && e.details?.includes('approved')
      );

      expect(creationEvent).toBeDefined();
      expect(creationEvent.actorRole).toBe('creator');
      expect(approvalEvent).toBeDefined();
      expect(approvalEvent.actorRole).toBe('reviewer');

      // ----------------------------------------------------------------------
      // Step 13: Refresh the application and verify the persisted state
      // ----------------------------------------------------------------------
      const allSubmissions = await getWorkflowSubmissions();
      const loadedSub = allSubmissions.find((s) => s.id === submission.id);
      expect(loadedSub).toBeDefined();
      expect(loadedSub?.status).toBe('approved');
      expect(loadedSub?.content).toBe(revisedPost);

      // ----------------------------------------------------------------------
      // Step 14: Check that dashboard metrics reflect actual saved data
      // ----------------------------------------------------------------------
      const allPersistentScans = await getPersistentScans(50);
      const uiScans = allPersistentScans.map(persistentScanToUiScan);
      const metrics = computeMetrics(uiScans);

      expect(metrics.totalScans).toBe(allPersistentScans.length);
      expect(metrics.avgScore).toBeGreaterThanOrEqual(0);
      expect(metrics.avgScore).toBeLessThanOrEqual(100);
      expect(metrics.highRiskCount).toBe(metrics.distribution.Critical + metrics.distribution.High);

      const attentionItems = needsAttention(uiScans);
      expect(attentionItems.length).toBeLessThanOrEqual(3);
      if (attentionItems.length > 0) {
        expect(['Critical', 'High']).toContain(attentionItems[0].finding.severity);
      }
    });
  });

  // ==========================================================================
  // 2. Scanner Deterministic Rules & Robustness Edge Cases
  // ==========================================================================
  describe('2. Scanner Robustness & Compliance Rules', () => {
    it('evaluates completely clean compliant content with high score and approved status', async () => {
      const cleanPost =
        'Proud of our engineering team for delivering the new high-performance data engine today! Subject to enterprise SLA and master subscription terms.';
      const result = analyzeBrandContent(cleanPost, DEFAULT_POLICIES.enterprise);

      expect(result.overallScore).toBe(100);
      expect(result.status).toBe('approved');
      expect(result.violations.length).toBe(0);
    });

    it('flags prohibited claims with critical severity and penalty', async () => {
      const claimPost =
        'Our platform offers guaranteed profit on all investments with zero risk. Sign up now!';
      const result = analyzeBrandContent(claimPost, DEFAULT_POLICIES.fintech);

      expect(result.overallScore).toBeLessThanOrEqual(75);
      expect(result.violations.some((v) => v.category === 'claim' || v.category === 'legal')).toBe(true);
      expect(result.violations.some((v) => v.phrase.toLowerCase().includes('guaranteed profit'))).toBe(true);
    });

    it('flags competitor mentions according to policy rules', async () => {
      const competitorPost =
        'Why choose Revolut or Robinhood when our platform handles transaction settlements 10x faster?';
      const result = analyzeBrandContent(competitorPost, DEFAULT_POLICIES.fintech);

      const competitorViolation = result.violations.find(
        (v) => v.category === 'trademark' && v.ruleViolated.includes('Competitor')
      );
      expect(competitorViolation).toBeDefined();
    });

    it('flags missing required regulatory disclaimers in promotional content', async () => {
      const missingDisclaimerPost =
        'Announcing our new investment portfolio tools with guaranteed profit opportunities for enterprise funds.';
      const result = analyzeBrandContent(missingDisclaimerPost, DEFAULT_POLICIES.fintech);

      const disclaimerViolation = result.violations.find(
        (v) => v.category === 'legal' && v.title.includes('Notice')
      );
      expect(disclaimerViolation).toBeDefined();
    });

    it('rejects input exceeding the maximum character length of 10,000 characters', async () => {
      const excessivelyLongContent = 'A'.repeat(MAX_CONTENT_LENGTH + 100);
      const req = new NextRequest('http://localhost:3000/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: excessivelyLongContent,
          policy: DEFAULT_POLICIES.enterprise,
        }),
      });

      const res = await scanPost(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain(`maximum allowed length of ${MAX_CONTENT_LENGTH}`);
    });

    it('rejects empty payload or missing required fields', async () => {
      const req = new NextRequest('http://localhost:3000/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const res = await scanPost(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('required');
    });

    it('handles AI provider failure gracefully by falling back to deterministic engine', async () => {
      vi.spyOn(global, 'fetch').mockImplementationOnce(async () => {
        return {
          ok: false,
          status: 503,
          statusText: 'Service Unavailable',
          text: async () => 'AI Gateway Overloaded',
        } as unknown as Response;
      });

      const content = 'Guaranteed profit in our new automated investment vault with zero risk.';
      const deterministic = analyzeBrandContent(content, DEFAULT_POLICIES.fintech);
      const execution = await executeBrandScan(content, DEFAULT_POLICIES.fintech, deterministic, {
        enableAi: true,
        geminiApiKey: 'test-gemini-key',
      });

      expect(execution.isFallback).toBe(true);
      expect(execution.scanResult.analysisMethod).toBe('deterministic');
      expect(execution.fallbackReason).toContain('503');
      expect(execution.scanResult.violations.length).toBeGreaterThan(0);
    });

    it('handles malformed AI JSON output by falling back to deterministic engine', async () => {
      vi.spyOn(global, 'fetch').mockImplementationOnce(async () => {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [{ text: 'Here is your analysis: { invalid json without quotes: true' }],
                },
              },
            ],
          }),
        } as unknown as Response;
      });

      const content = 'Guaranteed profit with zero risk.';
      const deterministic = analyzeBrandContent(content, DEFAULT_POLICIES.fintech);
      const execution = await executeBrandScan(content, DEFAULT_POLICIES.fintech, deterministic, {
        enableAi: true,
        geminiApiKey: 'test-gemini-key',
      });

      expect(execution.isFallback).toBe(true);
      expect(execution.scanResult.analysisMethod).toBe('deterministic');
      expect(execution.scanResult.overallScore).toBe(deterministic.overallScore);
    });
  });

  // ==========================================================================
  // 3. Authentication & Access Control Verification
  // ==========================================================================
  describe('3. Authentication & Access-Control Verification', () => {
    it('blocks unauthenticated requests to review workflow endpoints', async () => {
      const req = new NextRequest('http://localhost:3000/api/workflow/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submissionId: 'sub-101',
          decision: 'approved',
          comments: 'Attempt without auth',
        }),
      });

      const res = await reviewsPost(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toMatch(/Authentication required/i);
    });

    it('enforces Separation of Duties: creator cannot approve their own submission', async () => {
      const creatorAuthHeader = createTestAuthHeader('test-creator-token');
      const sub = await createOrUpdateSubmission({
        title: 'Creator Self-Approval Test',
        content: 'Legitimate announcement for testing.',
        policyId: 'enterprise',
        creator: DEMO_USERS.creator,
      });

      const reviewReq = new NextRequest('http://localhost:3000/api/workflow/reviews', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: creatorAuthHeader,
        },
        body: JSON.stringify({
          submissionId: sub.id,
          decision: 'approved',
          comments: 'Creator approving own post.',
        }),
      });

      const res = await reviewsPost(reviewReq);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toMatch(/authorized|Separation of Duties|Forbidden/i);
    });

    it('ignores client-supplied role tampering in request bodies', async () => {
      // Attacker attempts to pass role: 'admin' in body while using creator token
      const creatorAuthHeader = createTestAuthHeader('test-creator-token');
      const sub = await createOrUpdateSubmission({
        title: 'Tamper Test',
        content: 'Testing privilege escalation.',
        policyId: 'enterprise',
        creator: DEMO_USERS.creator,
      });

      const spoofReq = new NextRequest('http://localhost:3000/api/workflow/reviews', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: creatorAuthHeader,
        },
        body: JSON.stringify({
          submissionId: sub.id,
          decision: 'approved',
          comments: 'Spoofed admin decision.',
          role: 'admin',
          reviewerRole: 'admin',
        }),
      });

      const res = await reviewsPost(spoofReq);
      expect(res.status).toBe(403);
    });
  });

  // ==========================================================================
  // 4. Persistence, Refresh Resilience & Demo Reset
  // ==========================================================================
  describe('4. Persistence Resilience & Demo State Controls', () => {
    it('persists scans and correctly calculates dashboard metrics from saved data', async () => {
      const scan1 = analyzeBrandContent(
        'Proud to announce our enterprise security certification. SLA details available on our portal.',
        DEFAULT_POLICIES.enterprise
      );
      const scan2 = analyzeBrandContent(
        'Earn guaranteed profit with 100% safe, risk-free, unlimited yield and zero risk! Get rich quick with insider alpha.',
        DEFAULT_POLICIES.fintech
      );

      const id1 = await persistScanResult(scan1, 'Safe content post', 'enterprise', DEMO_USERS.creator);
      const id2 = await persistScanResult(scan2, 'Risky content post', 'fintech', DEMO_USERS.creator);

      const all = await getPersistentScans(20);
      expect(all.some((s) => s.id === id1)).toBe(true);
      expect(all.some((s) => s.id === id2)).toBe(true);

      const uiList = all.map(persistentScanToUiScan);
      const metrics = computeMetrics(uiList);

      expect(metrics.totalScans).toBe(all.length);
      expect(metrics.findingsBySeverity.Critical).toBeGreaterThanOrEqual(1);
      expect(metrics.highRiskCount).toBeGreaterThanOrEqual(1);
    });

    it('resets workflow and scan stores cleanly to default demo baseline', async () => {
      await createOrUpdateSubmission({
        title: 'Temporary Scratch Submission',
        content: 'Temporary content for reset test.',
        policyId: 'enterprise',
        creator: DEMO_USERS.creator,
      });

      // Reset
      resetWorkflowStateForTesting();
      resetScanStoreForTesting();

      const freshSubs = await getWorkflowSubmissions();
      // Should be back to initial seed submissions (sub-101, sub-102)
      expect(freshSubs.length).toBe(2);
      expect(freshSubs.some((s) => s.title === 'Temporary Scratch Submission')).toBe(false);

      const freshScans = await getPersistentScans(20);
      expect(freshScans.length).toBe(0); // Clean initial state without mock scans
    });
  });
});
