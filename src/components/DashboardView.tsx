"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ScanSearch } from "lucide-react";
import { computeMetrics, needsAttention } from "@/lib/metrics";
import { RISK_ORDER } from "@/lib/risk";
import { useBrandGuard } from "@/context/BrandGuardContext";
import { persistentScanToUiScan } from "@/lib/scanStore";
import PageHeader from "./PageHeader";
import MetricCard from "./MetricCard";
import RiskDistribution from "./RiskDistribution";
import RecentScansTable from "./RecentScansTable";
import FindingItem from "./FindingItem";
import ActivityList from "./ActivityList";
import RiskBadge from "./RiskBadge";

const RANGES = [
  { label: "All records", days: 0 },
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
];

export default function DashboardView() {
  const [filter, setFilter] = useState<{ days: number; cutoff: number }>({ days: 0, cutoff: 0 });
  const { persistentScans, auditEvents } = useBrandGuard();

  // Combine live persistentScans mapped to Scan format (empty by default until user executes scans)
  const allScans = useMemo(() => {
    if (persistentScans && persistentScans.length > 0) {
      return persistentScans.map(persistentScanToUiScan);
    }
    return [];
  }, [persistentScans]);

  const inRange = useMemo(() => {
    if (!filter.days || !filter.cutoff) return allScans;
    return allScans.filter((s) => new Date(s.date).getTime() >= filter.cutoff);
  }, [filter, allScans]);

  const m = useMemo(() => computeMetrics(inRange), [inRange]);
  const attention = useMemo(() => needsAttention(inRange), [inRange]);
  const recent = [...inRange].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  const empty = m.totalScans === 0;

  // Live activities derived strictly from actual audit events
  const liveActivities = useMemo(() => {
    if (auditEvents && auditEvents.length > 0) {
      return auditEvents.slice(0, 6).map((evt) => ({
        id: evt.id,
        text: `${evt.actorName}: ${evt.details}`,
        date: evt.timestamp ? evt.timestamp.slice(0, 10) : 'Today',
      }));
    }
    return [];
  }, [auditEvents]);

  return (
    <>
      <PageHeader
        title="Brand Safety Overview"
        description="Monitor content risks, compliance violations, and brand safety across your recent scans."
        actions={
          <>
            <label className="sr-only" htmlFor="range">Date range</label>
            <select
              id="range"
              value={filter.days}
              onChange={(e) => {
                const d = Number(e.target.value);
                setFilter({ days: d, cutoff: d > 0 ? Date.now() - d * 86400000 : 0 });
              }}
              className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-fg"
            >
              {RANGES.map((r) => <option key={r.days} value={r.days}>{r.label}</option>)}
            </select>
            <Link
              href="/scanner"
              className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
            >
              <ScanSearch size={16} aria-hidden /> Scan New Content
            </Link>
          </>
        }
      />
      <p className="mb-4 rounded-md border border-line bg-surface px-3 py-2 text-xs text-muted">
        Active compliance ledger. Metrics reflect persisted scans, policy evaluations, and audit events.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Brand Safety Score" value={empty ? "–" : m.avgScore} suffix={empty ? undefined : "/ 100"}>
          {!empty && <RiskBadge level={m.scoreLevel} />}
        </MetricCard>
        <MetricCard label="Total Posts Scanned" value={m.totalScans} detail="Completed scans in this period" />
        <MetricCard
          label="Risks Detected"
          value={m.totalFindings}
          detail={RISK_ORDER.map((k) => `${m.findingsBySeverity[k]} ${k.toLowerCase()}`).join(" · ")}
        />
        <MetricCard label="High-Risk Content" value={m.highRiskCount} detail="Scans scoring below 70 (High or Critical)" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3"><RiskDistribution distribution={m.distribution} /></div>
        <section aria-labelledby="attention" className="rounded-lg border border-line bg-surface p-5 lg:col-span-2">
          <h2 id="attention" className="mb-4 text-base font-semibold">Needs Attention</h2>
          {attention.length === 0
            ? <p className="py-6 text-center text-sm text-muted">No critical or high findings in this period.</p>
            : <ul className="divide-y divide-line/60">{attention.map((a) => <FindingItem key={a.scan.id + a.finding.id} {...a} />)}</ul>}
        </section>
      </div>

      <section aria-labelledby="recent" className="mt-6 rounded-lg border border-line bg-surface">
        <div className="flex items-center justify-between px-5 py-4">
          <h2 id="recent" className="text-base font-semibold">Recent Scans</h2>
          <Link href="/scans" className="text-sm text-accent hover:underline">View All Scans</Link>
        </div>
        <RecentScansTable scans={recent} emptyHref="/scanner" />
      </section>

      <div className="mt-6"><ActivityList items={liveActivities} /></div>
    </>
  );
}
