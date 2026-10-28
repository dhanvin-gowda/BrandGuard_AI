'use client';

import React, { useState, useMemo } from 'react';
import {
  Download,
  Filter,
  CheckCircle,
  FileSpreadsheet,
  ShieldCheck,
} from 'lucide-react';
import { useBrandGuard } from '@/context/BrandGuardContext';
import { formatDate } from '@/lib/risk';

export const AnalyticsTab: React.FC = () => {
  const { auditEvents, persistentScans, threats, policies } = useBrandGuard();
  const [selectedChannel, setSelectedChannel] = useState<string>('all');
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Derived genuine metrics
  const totalScans = persistentScans.length;
  const avgHealthScore = useMemo(() => {
    if (totalScans === 0) return 100;
    const sum = persistentScans.reduce((acc, s) => acc + s.score, 0);
    return Math.round(sum / totalScans);
  }, [persistentScans, totalScans]);

  const totalViolations = useMemo(() => {
    return persistentScans.reduce((acc, s) => acc + (s.violations?.length || 0), 0);
  }, [persistentScans]);

  const criticalViolations = useMemo(() => {
    return persistentScans.reduce(
      (acc, s) => acc + (s.violations || []).filter((v) => v.severity === 'critical').length,
      0
    );
  }, [persistentScans]);

  const mitigatedThreatsCount = useMemo(() => {
    return threats.filter((t) => t.status === 'mitigated').length;
  }, [threats]);

  // Channel breakdown calculated from genuine persistent scans
  const channelBreakdown = useMemo(() => {
    const channelMap: Record<string, { name: string; scores: number[]; count: number; color: string }> = {
      fintech: { name: 'Paid Ads & Financial Copy', scores: [], count: 0, color: 'bg-emerald-400' },
      enterprise: { name: 'Corporate & PR Releases', scores: [], count: 0, color: 'bg-cyan-400' },
      consumer: { name: 'Social Media & Creator Campaigns', scores: [], count: 0, color: 'bg-indigo-400' },
      healthcare: { name: 'Health & Wellness Communications', scores: [], count: 0, color: 'bg-amber-400' },
    };

    for (const scan of persistentScans) {
      const pId = scan.policyId || 'fintech';
      if (!channelMap[pId]) {
        channelMap[pId] = {
          name: policies[pId]?.name || pId,
          scores: [],
          count: 0,
          color: 'bg-purple-400',
        };
      }
      channelMap[pId].scores.push(scan.score);
      channelMap[pId].count++;
    }

    return Object.values(channelMap).map((ch) => ({
      name: ch.name,
      count: `${ch.count} ${ch.count === 1 ? 'scan' : 'scans'}`,
      score: ch.scores.length > 0
        ? Math.round((ch.scores.reduce((a, b) => a + b, 0) / ch.scores.length) * 10) / 10
        : 100,
      color: ch.color,
    }));
  }, [persistentScans, policies]);

  // Real risk distribution by category
  const riskCategoryPercentages = useMemo(() => {
    let legal = 0;
    let claims = 0;
    let trademark = 0;
    let tone = 0;

    for (const scan of persistentScans) {
      for (const v of scan.violations || []) {
        if (v.category === 'legal') legal++;
        else if (v.category === 'claim') claims++;
        else if (v.category === 'trademark') trademark++;
        else if (v.category === 'tone') tone++;
      }
    }

    const total = legal + claims + trademark + tone;
    if (total === 0) {
      return { legal: 0, claims: 0, trademark: 0, tone: 0, total: 0 };
    }

    return {
      legal: Math.round((legal / total) * 100),
      claims: Math.round((claims / total) * 100),
      trademark: Math.round((trademark / total) * 100),
      tone: Math.round((tone / total) * 100),
      total,
    };
  }, [persistentScans]);

  // Generate authentic CSV export from verified records only
  const handleExportCsv = () => {
    setIsExporting(true);
    try {
      const headers = ['Record ID', 'Type', 'Target / Summary', 'Score', 'Actor / Creator', 'Timestamp', 'Details'];
      
      const auditRows = auditEvents.map((evt) => [
        `"${evt.id}"`,
        `"Audit Event (${evt.eventType})"`,
        `"${evt.targetId || 'Platform Policy'}"`,
        `"N/A"`,
        `"${evt.actorName}"`,
        `"${evt.timestamp}"`,
        `"${(evt.details || '').replace(/"/g, '""')}"`,
      ]);

      const scanRows = persistentScans.map((s) => [
        `"${s.id}"`,
        `"Content Scan"`,
        `"${(s.summary || 'Campaign Scan').replace(/"/g, '""')}"`,
        `"${s.score}/100"`,
        `"${s.userId || 'Verified User'}"`,
        `"${s.createdAt}"`,
        `"${(s.violationsCount || 0)} violations flagged (${s.analysisMethod})"`,
      ]);

      const csvContent = [headers.join(','), ...auditRows.map((r) => r.join(',')), ...scanRows.map((r) => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', url);
      downloadAnchor.setAttribute('download', `brandguard_governance_ledger_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('CSV export failed:', err);
    } finally {
      setIsExporting(false);
    }
  };

  const filteredScans = persistentScans.filter((item) => {
    if (selectedChannel !== 'all' && item.policyId !== selectedChannel) {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="glass-panel rounded-2xl p-5 border border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
              Audit & Governance Analytics
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            <span className="text-xs text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20">
              Live Governance Ledger
            </span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight mt-1">
            Enterprise Brand Health & Compliance Metrics
          </h1>
          <p className="text-sm text-slate-300 mt-0.5">
            Cross-channel compliance velocity, risk incident suppression rates, and verified audit logs computed from live workspace scans.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleExportCsv}
            disabled={isExporting}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            {isExporting ? 'Generating...' : 'Export Audit History (CSV)'}
          </button>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-panel rounded-2xl p-5 border border-white/10">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-slate-400">Global Health Index</span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              {avgHealthScore >= 85 ? 'Optimal' : avgHealthScore >= 70 ? 'Advisory' : 'Action Required'}
            </span>
          </div>
          <div className="text-3xl font-black text-white mt-2">{avgHealthScore}%</div>
          <p className="text-xs text-slate-400 mt-1">Average safety score across {totalScans} verified {totalScans === 1 ? 'scan' : 'scans'}</p>
        </div>

        <div className="glass-panel rounded-2xl p-5 border border-white/10">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-slate-400">Completed Scans</span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
              Active Ledger
            </span>
          </div>
          <div className="text-3xl font-black text-white mt-2">{totalScans}</div>
          <p className="text-xs text-slate-400 mt-1">Evaluated marketing & promotional assets</p>
        </div>

        <div className="glass-panel rounded-2xl p-5 border border-white/10">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-slate-400">Threats Resolved</span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
              Mitigated
            </span>
          </div>
          <div className="text-3xl font-black text-cyan-400 mt-2">{mitigatedThreatsCount}</div>
          <p className="text-xs text-slate-400 mt-1">Mitigated brand trademark incidents</p>
        </div>

        <div className="glass-panel rounded-2xl p-5 border border-white/10">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-slate-400">Critical Infractions</span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
              {criticalViolations === 0 ? 'Zero Infractions' : 'Active Interceptions'}
            </span>
          </div>
          <div className="text-3xl font-black text-rose-400 mt-2">{criticalViolations}</div>
          <p className="text-xs text-slate-400 mt-1">Suppressed regulatory & legal violations</p>
        </div>
      </div>

      {/* Channel Breakdown & Incident Category Radar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Channel Compliance Health */}
        <div className="lg:col-span-6 glass-panel rounded-2xl p-5 border border-white/10 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-white/5">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              Channel Compliance Scorecards
            </h2>
            <span className="text-xs text-slate-400">Live Workspace Analytics</span>
          </div>

          <div className="space-y-3.5">
            {channelBreakdown.map((item, idx) => (
              <div key={idx} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-200 font-semibold">{item.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-400">{item.count}</span>
                    <span className="font-bold text-white font-mono">{item.score}%</span>
                  </div>
                </div>
                <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${item.color}`}
                    style={{ width: `${item.score}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Risk Distribution Breakdown */}
        <div className="lg:col-span-6 glass-panel rounded-2xl p-5 border border-white/10 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-white/5">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              Risk Incident Classification
            </h2>
            <span className="text-xs text-slate-400">{totalViolations} Recorded Violations</span>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-white/5 space-y-1">
              <span className="text-xs font-semibold text-rose-300">Regulatory & Legal Claims</span>
              <div className="text-2xl font-black text-white">{riskCategoryPercentages.legal}%</div>
              <p className="text-[11px] text-slate-400">Disclaimers & prohibited assertions</p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-white/5 space-y-1">
              <span className="text-xs font-semibold text-amber-300">Claim Substantiation</span>
              <div className="text-2xl font-black text-white">{riskCategoryPercentages.claims}%</div>
              <p className="text-[11px] text-slate-400">Guarantees & absolute safety claims</p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-white/5 space-y-1">
              <span className="text-xs font-semibold text-cyan-300">Competitor Trademark Exclusions</span>
              <div className="text-2xl font-black text-white">{riskCategoryPercentages.trademark}%</div>
              <p className="text-[11px] text-slate-400">Competitor marks & unauthorized naming</p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-white/5 space-y-1">
              <span className="text-xs font-semibold text-purple-300">Brand Voice & Tone</span>
              <div className="text-2xl font-black text-white">{riskCategoryPercentages.tone}%</div>
              <p className="text-[11px] text-slate-400">Formality and boldness calibration</p>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Automated checks flag noncompliant phrases before release.</span>
          </div>
        </div>
      </div>

      {/* Real Live Audit Events Log Table */}
      <div className="glass-panel rounded-2xl p-5 border border-white/10 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-white/5 gap-2">
          <div>
            <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-indigo-400" />
              Live Recorded Workflow & Audit Trail ({auditEvents.length} Events)
            </h2>
            <p className="text-xs text-slate-400">
              Derives from actual user actions in the workspace: scan executions, submissions, revisions, and reviewer sign-offs.
            </p>
          </div>
        </div>

        {auditEvents.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-400 border border-dashed border-white/10 rounded-xl">
            No audit events recorded yet. Run content scans or submit reviews to generate verified audit history.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-slate-400 font-semibold uppercase tracking-wider border-b border-white/5">
                <tr>
                  <th className="py-3 px-4">Event ID</th>
                  <th className="py-3 px-4">Action Type</th>
                  <th className="py-3 px-4">Actor</th>
                  <th className="py-3 px-4">Target</th>
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-slate-200 font-mono text-[11px]">
                {auditEvents.slice(0, 10).map((evt) => (
                  <tr key={evt.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 px-4 text-indigo-400 font-bold">{evt.id}</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-slate-300">
                        {evt.eventType}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-white font-sans">{evt.actorName}</td>
                    <td className="py-3 px-4 text-cyan-300">{evt.targetId || '–'}</td>
                    <td className="py-3 px-4 text-slate-400">{formatDate(evt.timestamp)}</td>
                    <td className="py-3 px-4 font-sans text-slate-300 max-w-xs truncate">{evt.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Real Scan History Table */}
      <div className="glass-panel rounded-2xl p-5 border border-white/10 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-white/5 gap-2">
          <div>
            <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Verified Workspace Scan Ledger ({filteredScans.length} Records)
            </h2>
            <p className="text-xs text-slate-400">
              Authentic content scan evaluations executed in this workspace.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-slate-900 px-3 py-1.5 rounded-xl border border-white/10 text-xs">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={selectedChannel}
                onChange={(e) => setSelectedChannel(e.target.value)}
                className="bg-transparent text-slate-200 focus:outline-none cursor-pointer"
              >
                <option value="all" className="bg-slate-900">All Framework Policies</option>
                <option value="fintech" className="bg-slate-900">Fintech & Wealth Security</option>
                <option value="consumer" className="bg-slate-900">Consumer & Skincare</option>
                <option value="enterprise" className="bg-slate-900">Enterprise B2B Cloud & AI</option>
                <option value="healthcare" className="bg-slate-900">Healthcare & Clinical AI</option>
              </select>
            </div>
          </div>
        </div>

        {filteredScans.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-400 border border-dashed border-white/10 rounded-xl">
            No scans logged for the selected policy filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-slate-400 font-semibold uppercase tracking-wider border-b border-white/5">
                <tr>
                  <th className="py-3 px-4">Scan ID</th>
                  <th className="py-3 px-4">Campaign / Summary</th>
                  <th className="py-3 px-4">Policy Framework</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Score</th>
                  <th className="py-3 px-4">Violations</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-slate-200 font-mono text-[11px]">
                {filteredScans.slice(0, 10).map((scan) => (
                  <tr key={scan.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 px-4 text-indigo-400 font-bold">{scan.id}</td>
                    <td className="py-3 px-4 font-sans text-white max-w-xs truncate">{scan.summary || 'Campaign Scan'}</td>
                    <td className="py-3 px-4 text-cyan-300 font-sans">{policies[scan.policyId]?.name || scan.policyId}</td>
                    <td className="py-3 px-4 text-slate-400">{formatDate(scan.createdAt)}</td>
                    <td className="py-3 px-4">
                      <span className={`font-bold ${scan.score >= 85 ? 'text-emerald-400' : scan.score >= 70 ? 'text-amber-400' : 'text-rose-400'}`}>
                        {scan.score}/100
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-300">{scan.violationsCount}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        scan.status === 'approved'
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                          : scan.status === 'rejected'
                          ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                          : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                      }`}>
                        {scan.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
