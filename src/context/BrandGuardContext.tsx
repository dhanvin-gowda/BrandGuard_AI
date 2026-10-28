'use client';

import React, { createContext, useContext, useState, useMemo, useEffect, useCallback } from 'react';
import {
  BrandPolicy,
  ThreatMention,
  ScanResult,
  ContentSubmission,
  AuditEvent,
  UserProfile,
  ReviewWorkflowStatus,
} from '@/types/brandguard';
import {
  DEFAULT_POLICIES,
  analyzeBrandContent,
} from '@/lib/brandSafetyEngine';
import {
  DEMO_USERS,
  INITIAL_SUBMISSIONS,
  INITIAL_AUDIT_EVENTS,
} from '@/lib/workflowStore';
import { isSupabaseConfigured, getSupabaseClient } from '@/lib/supabase';
import { PersistentScanRecord, INITIAL_PERSISTENT_SCANS } from '@/lib/scanStore';

interface BrandGuardContextType {
  policies: Record<string, BrandPolicy>;
  currentPolicyId: string;
  currentPolicy: BrandPolicy;
  setCurrentPolicyId: (id: string) => void;
  updatePolicy: (updated: BrandPolicy) => Promise<void>;
  inputText: string;
  setInputText: (text: string) => void;
  threats: ThreatMention[];
  updateThreatStatus: (id: string, status: ThreatMention['status']) => void;
  addThreat: (threat: ThreatMention) => void;
  scanResult: ScanResult;
  isScanning: boolean;
  scanError: string | null;
  runScan: (text?: string, targetPolicy?: BrandPolicy, options?: { enableAi?: boolean; persist?: boolean }) => Promise<ScanResult>;
  saveScan: (resultToSave: ScanResult, content: string, policyId?: string) => Promise<string>;
  resetDemoData: () => void;
  isAuditModalOpen: boolean;
  setIsAuditModalOpen: (open: boolean) => void;

  // Persistence & Storage Mode
  storageMode: 'supabase' | 'local_demo';
  isSupabaseConnected: boolean;
  isLoadingData: boolean;
  dataError: string | null;
  refreshData: () => Promise<void>;
  persistentScans: PersistentScanRecord[];

  // Role & Approval Workflow
  currentUser: UserProfile;
  setCurrentUser: (user: UserProfile) => void;
  submissions: ContentSubmission[];
  auditEvents: AuditEvent[];
  createSubmission: (title: string, content: string, policyId?: string) => Promise<ContentSubmission>;
  submitReview: (submissionId: string, decision: 'approved' | 'rejected' | 'changes_requested', comments: string) => Promise<void>;
  reviseSubmission: (submissionId: string, newContent: string) => Promise<ContentSubmission>;
}

const BrandGuardContext = createContext<BrandGuardContextType | undefined>(undefined);

const STORAGE_KEYS = {
  POLICIES: 'bg_policies_v2',
  SUBMISSIONS: 'bg_submissions_v2',
  AUDIT_EVENTS: 'bg_audit_events_v2',
  CURRENT_USER_ROLE: 'bg_user_role_v2',
  SCANS: 'bg_persistent_scans_v2',
};

export const BrandGuardProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [policies, setPolicies] = useState<Record<string, BrandPolicy>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(STORAGE_KEYS.POLICIES);
        if (saved) return JSON.parse(saved);
      } catch (e) {
        console.warn('Could not load cached policies:', e);
      }
    }
    return DEFAULT_POLICIES;
  });

  const [currentPolicyId, setCurrentPolicyId] = useState<string>('fintech');
  const [inputText, setInputText] = useState<string>('');
  const [threats, setThreats] = useState<ThreatMention[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('bg_threats_v2');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) return parsed;
        }
      } catch (e) {
        console.warn('Could not load cached threats:', e);
      }
    }
    return [];
  });
  const [isAuditModalOpen, setIsAuditModalOpen] = useState<boolean>(false);
  const [isLoadingData, setIsLoadingData] = useState<boolean>(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [persistentScans, setPersistentScans] = useState<PersistentScanRecord[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(STORAGE_KEYS.SCANS);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) return parsed;
        }
      } catch (e) {
        console.warn('Could not load cached persistent scans:', e);
      }
    }
    return INITIAL_PERSISTENT_SCANS;
  });

  const [submissions, setSubmissions] = useState<ContentSubmission[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(STORAGE_KEYS.SUBMISSIONS);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) return parsed;
        }
      } catch (e) {
        console.warn('Could not load cached submissions:', e);
      }
    }
    return INITIAL_SUBMISSIONS;
  });

  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(STORAGE_KEYS.AUDIT_EVENTS);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) return parsed;
        }
      } catch (e) {
        console.warn('Could not load cached audit events:', e);
      }
    }
    return INITIAL_AUDIT_EVENTS;
  });

  const [currentUser, setCurrentUser] = useState<UserProfile>(() => {
    if (typeof window !== 'undefined') {
      try {
        const savedRole = localStorage.getItem(STORAGE_KEYS.CURRENT_USER_ROLE);
        if (savedRole && DEMO_USERS[savedRole]) {
          return DEMO_USERS[savedRole];
        }
      } catch (e) {
        console.warn('Could not load cached user role:', e);
      }
    }
    return DEMO_USERS.creator;
  });

  const storageMode: 'supabase' | 'local_demo' = isSupabaseConfigured ? 'supabase' : 'local_demo';

  // Helper to retrieve current auth headers if in Supabase mode
  const getAuthHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (storageMode === 'supabase') {
      try {
        const supabase = getSupabaseClient();
        const { data: { session } } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
        if (session?.access_token) {
          headers['Authorization'] = `Bearer ${session.access_token}`;
        }
      } catch (e) {
        console.warn('Could not get session token:', e);
      }
    }
    return headers;
  }, [storageMode]);

  // Synchronize data from Supabase backend
  const refreshData = useCallback(async () => {
    if (storageMode !== 'supabase') return;

    setIsLoadingData(true);
    setDataError(null);
    try {
      const headers = await getAuthHeaders();

      // Fetch policies
      const polRes = await fetch('/api/policies');
      if (polRes.ok) {
        const polData = await polRes.json();
        if (polData.policies && Object.keys(polData.policies).length > 0) {
          setPolicies(polData.policies);
        }
      }

      // Fetch submissions
      const subRes = await fetch('/api/workflow/submissions', { headers });
      if (subRes.ok) {
        const subData = await subRes.json();
        if (Array.isArray(subData.submissions)) {
          setSubmissions(subData.submissions);
        }
      }

      // Fetch audit events
      const audRes = await fetch('/api/workflow/audit-events', { headers });
      if (audRes.ok) {
        const audData = await audRes.json();
        if (Array.isArray(audData.events)) {
          setAuditEvents(audData.events);
        }
      }

      // Fetch scan history
      const scanRes = await fetch('/api/scans', { headers });
      if (scanRes.ok) {
        const scanData = await scanRes.json();
        if (Array.isArray(scanData.scans)) {
          setPersistentScans(scanData.scans);
        }
      }
    } catch (err: unknown) {
      console.error('Error refreshing data from Supabase:', err);
      const msg = err instanceof Error ? err.message : 'Failed to synchronize with Supabase.';
      setDataError(msg);
    } finally {
      setIsLoadingData(false);
    }
  }, [storageMode, getAuthHeaders]);

  // Initial data load on mount or mode change
  useEffect(() => {
    if (storageMode !== 'supabase') return;

    let isMounted = true;
    (async () => {
      try {
        const headers = await getAuthHeaders();
        const [polRes, subRes, audRes, scanRes] = await Promise.allSettled([
          fetch('/api/policies'),
          fetch('/api/workflow/submissions', { headers }),
          fetch('/api/workflow/audit-events', { headers }),
          fetch('/api/scans', { headers }),
        ]);

        if (!isMounted) return;

        if (polRes.status === 'fulfilled' && polRes.value.ok) {
          const polData = await polRes.value.json();
          if (polData.policies && Object.keys(polData.policies).length > 0) {
            setPolicies(polData.policies);
          }
        }
        if (subRes.status === 'fulfilled' && subRes.value.ok) {
          const subData = await subRes.value.json();
          if (Array.isArray(subData.submissions)) {
            setSubmissions(subData.submissions);
          }
        }
        if (audRes.status === 'fulfilled' && audRes.value.ok) {
          const audData = await audRes.value.json();
          if (Array.isArray(audData.events)) {
            setAuditEvents(audData.events);
          }
        }
        if (scanRes.status === 'fulfilled' && scanRes.value.ok) {
          const scanData = await scanRes.value.json();
          if (Array.isArray(scanData.scans)) {
            setPersistentScans(scanData.scans);
          }
        }
      } catch (e) {
        console.warn('Initial Supabase fetch failed:', e);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [storageMode, getAuthHeaders]);

  // Cache to localStorage in demo mode only
  useEffect(() => {
    if (storageMode === 'local_demo') {
      try {
        localStorage.setItem(STORAGE_KEYS.POLICIES, JSON.stringify(policies));
        localStorage.setItem(STORAGE_KEYS.SUBMISSIONS, JSON.stringify(submissions));
        localStorage.setItem(STORAGE_KEYS.AUDIT_EVENTS, JSON.stringify(auditEvents));
        localStorage.setItem(STORAGE_KEYS.SCANS, JSON.stringify(persistentScans));
        localStorage.setItem('bg_threats_v2', JSON.stringify(threats));
      } catch (e) {
        console.warn('Could not save to local storage in demo mode:', e);
      }
    }
  }, [policies, submissions, auditEvents, persistentScans, threats, storageMode]);

  const resetDemoData = useCallback(() => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(STORAGE_KEYS.POLICIES);
        localStorage.removeItem(STORAGE_KEYS.SUBMISSIONS);
        localStorage.removeItem(STORAGE_KEYS.AUDIT_EVENTS);
        localStorage.removeItem(STORAGE_KEYS.SCANS);
        localStorage.removeItem('bg_threats_v2');
        localStorage.removeItem(STORAGE_KEYS.CURRENT_USER_ROLE);
      } catch (e) {
        console.warn('Could not clear local storage demo data:', e);
      }
    }
    setPolicies(DEFAULT_POLICIES);
    setCurrentPolicyId('fintech');
    setSubmissions(INITIAL_SUBMISSIONS);
    setAuditEvents(INITIAL_AUDIT_EVENTS);
    setPersistentScans(INITIAL_PERSISTENT_SCANS);
    setThreats([]);
    setCurrentUser(DEMO_USERS.creator);
  }, []);

  const currentPolicy = useMemo(() => {
    return policies[currentPolicyId] || policies.fintech || DEFAULT_POLICIES.fintech;
  }, [policies, currentPolicyId]);

  // API scan result state
  const [apiScanResult, setApiScanResult] = useState<ScanResult | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  // Synchronously derived scanResult: uses API scan result if matching current input text,
  // otherwise immediately evaluates deterministic rules without cascading effect renders.
  const scanResult = useMemo<ScanResult>(() => {
    if (apiScanResult && apiScanResult.originalText === inputText) {
      return apiScanResult;
    }
    return analyzeBrandContent(inputText, currentPolicy);
  }, [inputText, currentPolicy, apiScanResult]);

  const runScan = useCallback(async (
    textToScan?: string,
    targetPolicy?: BrandPolicy,
    options?: { enableAi?: boolean; persist?: boolean }
  ): Promise<ScanResult> => {
    const text = typeof textToScan === 'string' ? textToScan : inputText;
    const policy = targetPolicy || currentPolicy;
    const enableAi = options?.enableAi !== false;
    const shouldPersist = Boolean(options?.persist);

    const baseline = analyzeBrandContent(text, policy);
    if (!text.trim()) {
      setApiScanResult(null);
      return baseline;
    }

    setIsScanning(true);
    setScanError(null);

    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          text,
          policy,
          enableAi,
          persist: shouldPersist,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Scan request failed with HTTP ${res.status}`);
      }

      const data: ScanResult = await res.json();
      setApiScanResult(data);
      return data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('API scan failed, using deterministic sentinel:', msg);
      setScanError(msg);
      const fallbackResult: ScanResult = {
        ...baseline,
        analysisMethod: 'deterministic',
        providerFallback: true,
        providerError: msg,
        scoreExplanation: `Deterministic analysis fallback. Scan API error: ${msg}`,
      };
      setApiScanResult(fallbackResult);
      return fallbackResult;
    } finally {
      setIsScanning(false);
    }
  }, [inputText, currentPolicy, getAuthHeaders]);

  const saveScan = useCallback(async (
    resultToSave: ScanResult,
    content: string,
    policyId?: string
  ): Promise<string> => {
    const targetPolicyId = policyId || currentPolicyId;
    const now = new Date().toISOString();

    if (storageMode === 'supabase') {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          text: content,
          policy: policies[targetPolicyId] || currentPolicy,
          enableAi: resultToSave.analysisMethod === 'contextual_ai',
          persist: true,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed to save scan record (${res.status})`);
      }

      const data = await res.json();
      await refreshData();
      return data.scanId || `scn-${Date.now().toString().slice(-6)}`;
    } else {
      const newScanId = `scn-${Date.now().toString().slice(-6)}`;
      const newRecord: PersistentScanRecord = {
        id: newScanId,
        policyId: targetPolicyId,
        content,
        score: resultToSave.overallScore,
        status: resultToSave.status,
        analysisMethod: resultToSave.analysisMethod,
        summary: resultToSave.summary,
        categories: resultToSave.categories,
        userId: currentUser.id,
        createdAt: now,
        violationsCount: resultToSave.violations?.length || 0,
        violations: resultToSave.violations,
        aiRewrittenText: resultToSave.aiRewrittenText,
      };

      setPersistentScans((prev) => [newRecord, ...prev]);

      const auditItem: AuditEvent = {
        id: `aud-scan-${Date.now()}`,
        eventType: 'scan_executed',
        actorId: currentUser.id,
        actorName: currentUser.name,
        actorRole: currentUser.role,
        targetId: newScanId,
        details: `Saved ${resultToSave.analysisMethod} compliance scan record (Safety Score: ${resultToSave.overallScore}/100, Violations: ${resultToSave.violations?.length || 0}).`,
        timestamp: now,
      };
      setAuditEvents((prev) => [auditItem, ...prev]);

      return newScanId;
    }
  }, [storageMode, currentPolicyId, policies, currentPolicy, currentUser, getAuthHeaders, refreshData]);

  const updatePolicy = useCallback(async (updated: BrandPolicy) => {
    if (storageMode === 'supabase') {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/policies', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ policy: updated }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed to update policy (${res.status})`);
      }

      await refreshData();
    } else {
      setPolicies((prev) => ({
        ...prev,
        [updated.id]: updated,
      }));

      const auditItem: AuditEvent = {
        id: `aud-pol-${Date.now()}`,
        eventType: 'policy_updated',
        actorId: currentUser.id,
        actorName: currentUser.name,
        actorRole: currentUser.role,
        targetId: updated.id,
        details: `Updated brand guidelines & thresholds for "${updated.name}".`,
        timestamp: new Date().toISOString(),
      };
      setAuditEvents((prev) => [auditItem, ...prev]);
    }
  }, [storageMode, getAuthHeaders, refreshData, currentUser]);

  const updateThreatStatus = useCallback((id: string, status: ThreatMention['status']) => {
    setThreats((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status } : t))
    );
  }, []);

  const addThreat = useCallback((newThreat: ThreatMention) => {
    setThreats((prev) => [newThreat, ...prev]);
  }, []);

  const handleSetCurrentUser = useCallback((user: UserProfile) => {
    setCurrentUser(user);
    try {
      localStorage.setItem(STORAGE_KEYS.CURRENT_USER_ROLE, user.role);
    } catch (e) {
      console.warn('Could not cache user role:', e);
    }
  }, []);

  // Submit new content for review (Creator workflow)
  const createSubmission = useCallback(async (
    title: string,
    content: string,
    policyId?: string
  ): Promise<ContentSubmission> => {
    const targetPolicyId = policyId || currentPolicyId;
    const pol = policies[targetPolicyId] || currentPolicy;
    const calculatedScan = analyzeBrandContent(content, pol);
    const now = new Date().toISOString();

    if (storageMode === 'supabase') {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/workflow/submissions', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title: title || 'New Campaign Draft',
          content,
          policyId: targetPolicyId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Submission failed with HTTP ${response.status}`);
      }

      const data = await response.json();
      await refreshData();
      return data.submission;
    } else {
      // Local demo mode
      const newSub: ContentSubmission = {
        id: `sub-${Date.now().toString().slice(-5)}`,
        title: title || 'New Campaign Draft',
        content,
        policyId: targetPolicyId,
        version: 1,
        creatorId: currentUser.id,
        creatorName: currentUser.name,
        status: 'pending_review',
        scanResult: calculatedScan,
        reviews: [],
        createdAt: now,
        updatedAt: now,
      };

      setSubmissions((prev) => [newSub, ...prev]);

      const auditItem: AuditEvent = {
        id: `aud-sub-${Date.now()}`,
        eventType: 'submission_created',
        actorId: currentUser.id,
        actorName: currentUser.name,
        actorRole: currentUser.role,
        targetId: newSub.id,
        details: `Submitted "${newSub.title}" for compliance sign-off (Safety Score: ${calculatedScan.overallScore}/100).`,
        timestamp: now,
      };
      setAuditEvents((prev) => [auditItem, ...prev]);

      return newSub;
    }
  }, [currentPolicyId, policies, currentPolicy, currentUser, storageMode, getAuthHeaders, refreshData]);

  // Submit revised version of an existing submission (Creator workflow)
  const reviseSubmission = useCallback(async (
    submissionId: string,
    newContent: string
  ): Promise<ContentSubmission> => {
    const existing = submissions.find((s) => s.id === submissionId);
    if (!existing) {
      throw new Error(`Submission "${submissionId}" not found.`);
    }

    // Ownership check: Creators cannot modify submissions belonging to others
    if (existing.creatorId && existing.creatorId !== currentUser.id && currentUser.role !== 'admin') {
      throw new Error('Forbidden: You do not have permission to modify a submission created by another user.');
    }

    const pol = policies[existing.policyId] || currentPolicy;
    const calculatedScan = analyzeBrandContent(newContent, pol);
    const now = new Date().toISOString();

    if (storageMode === 'supabase') {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/workflow/submissions', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          id: existing.id,
          title: existing.title,
          content: newContent,
          policyId: existing.policyId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Revision failed with HTTP ${response.status}`);
      }

      const data = await response.json();
      await refreshData();
      return data.submission;
    } else {
      // Local demo mode
      const updatedSub: ContentSubmission = {
        ...existing,
        content: newContent,
        version: existing.version + 1,
        status: 'pending_review',
        scanResult: calculatedScan,
        updatedAt: now,
      };

      setSubmissions((prev) =>
        prev.map((s) => (s.id === submissionId ? updatedSub : s))
      );

      const auditItem: AuditEvent = {
        id: `aud-rev-${Date.now()}`,
        eventType: 'submission_revised',
        actorId: currentUser.id,
        actorName: currentUser.name,
        actorRole: currentUser.role,
        targetId: updatedSub.id,
        details: `Revised "${updatedSub.title}" to version ${updatedSub.version}. Re-evaluated safety score: ${calculatedScan.overallScore}/100.`,
        timestamp: now,
      };
      setAuditEvents((prev) => [auditItem, ...prev]);

      return updatedSub;
    }
  }, [submissions, policies, currentPolicy, currentUser, storageMode, getAuthHeaders, refreshData]);

  // Submit Review Decision (Reviewer workflow - strictly enforced)
  const submitReview = useCallback(async (
    submissionId: string,
    decision: 'approved' | 'rejected' | 'changes_requested',
    comments: string
  ): Promise<void> => {
    // 1. Role verification check
    if (currentUser.role !== 'reviewer' && currentUser.role !== 'admin') {
      throw new Error(
        `Permission Denied: User role "${currentUser.role}" is not authorized to submit reviews. Only authorized reviewers or compliance officers can approve, reject, or request changes.`
      );
    }

    // 2. Separation of Duties verification
    const targetSub = submissions.find((s) => s.id === submissionId);
    if (targetSub?.creatorId && targetSub.creatorId === currentUser.id) {
      throw new Error(
        'Forbidden: Separation of duties violation. Reviewers cannot approve, reject, or request changes on their own submissions.'
      );
    }

    if (storageMode === 'supabase') {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/workflow/reviews', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          submissionId,
          decision,
          comments,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Review submission failed with HTTP ${response.status}`);
      }

      await refreshData();
    } else {
      // Local demo mode
      const now = new Date().toISOString();
      setSubmissions((prev) =>
        prev.map((s) => {
          if (s.id !== submissionId) return s;
          const newReview = {
            id: `rev-${Date.now().toString().slice(-4)}`,
            submissionId: s.id,
            reviewerId: currentUser.id,
            reviewerName: currentUser.name,
            reviewerRole: currentUser.role,
            status: decision as ReviewWorkflowStatus,
            comments: comments.trim(),
            revisionVersion: s.version,
            createdAt: now,
          };
          return {
            ...s,
            status: decision,
            reviews: [newReview, ...s.reviews],
            updatedAt: now,
          };
        })
      );

      const auditItem: AuditEvent = {
        id: `aud-dec-${Date.now()}`,
        eventType: 'review_decided',
        actorId: currentUser.id,
        actorName: currentUser.name,
        actorRole: currentUser.role,
        targetId: submissionId,
        details: `Review decision "${decision}" recorded for submission ${submissionId} by ${currentUser.name}.`,
        timestamp: now,
      };
      setAuditEvents((prev) => [auditItem, ...prev]);
    }
  }, [currentUser, submissions, storageMode, getAuthHeaders, refreshData]);

  return (
    <BrandGuardContext.Provider
      value={{
        policies,
        currentPolicyId,
        currentPolicy,
        setCurrentPolicyId,
        updatePolicy,
        inputText,
        setInputText,
        threats,
        updateThreatStatus,
        addThreat,
        scanResult,
        isScanning,
        scanError,
        runScan,
        saveScan,
        resetDemoData,
        isAuditModalOpen,
        setIsAuditModalOpen,
        storageMode,
        isSupabaseConnected: storageMode === 'supabase',
        isLoadingData,
        dataError,
        refreshData,
        persistentScans,
        currentUser,
        setCurrentUser: handleSetCurrentUser,
        submissions,
        auditEvents,
        createSubmission,
        submitReview,
        reviseSubmission,
      }}
    >
      {children}
    </BrandGuardContext.Provider>
  );
};

export const useBrandGuard = () => {
  const context = useContext(BrandGuardContext);
  if (!context) {
    throw new Error('useBrandGuard must be used within a BrandGuardProvider');
  }
  return context;
};
