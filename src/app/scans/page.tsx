'use client';

import { useMemo } from 'react';
import DashboardLayout from "@/components/DashboardLayout";
import PageHeader from "@/components/PageHeader";
import RecentScansTable from "@/components/RecentScansTable";
import { useBrandGuard } from "@/context/BrandGuardContext";
import { persistentScanToUiScan } from "@/lib/scanStore";

export default function ScansPage() {
  const { persistentScans } = useBrandGuard();

  const allScans = useMemo(() => {
    if (persistentScans && persistentScans.length > 0) {
      return persistentScans.map(persistentScanToUiScan);
    }
    return [];
  }, [persistentScans]);

  const sorted = useMemo(() => {
    return [...allScans].sort((a, b) => b.date.localeCompare(a.date));
  }, [allScans]);

  return (
    <DashboardLayout>
      <PageHeader
        title="All Content Scans"
        description="Comprehensive audit ledger of all promotional copy, social campaigns, and compliance evaluations."
      />
      <div className="rounded-lg border border-line bg-surface">
        <RecentScansTable scans={sorted} emptyHref="/scanner" />
      </div>
    </DashboardLayout>
  );
}
