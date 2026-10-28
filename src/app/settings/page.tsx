'use client';

import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Settings, Shield, Sliders, RotateCcw } from "lucide-react";
import { useBrandGuard } from "@/context/BrandGuardContext";

export default function SettingsPage() {
  const { resetDemoData, isSupabaseConnected } = useBrandGuard();
  const [resetDone, setResetDone] = useState(false);

  const handleResetDemo = () => {
    resetDemoData();
    setResetDone(true);
    setTimeout(() => setResetDone(false), 2500);
  };

  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
          <Settings className="w-6 h-6 text-indigo-400" />
          Platform Settings & Engine Configuration
        </h1>
        <p className="text-sm text-slate-400">
          Configure multi-vector sensitivity, API integrations, compliance frameworks, and notification hooks.
        </p>
      </div>

      <div className="space-y-6">
        {/* Compliance Frameworks */}
        <div className="glass-card p-6 rounded-xl border border-white/10">
          <h2 className="text-base font-semibold text-white mb-1 flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-400" />
            Active Regulatory & Compliance Standards
          </h2>
          <p className="text-xs text-slate-400 mb-4">
            Rules and heuristics active during content scans and reputation radar evaluation.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              { name: 'SEC Rule 156', desc: 'Investment & yield claim substantiation', status: 'Enforced' },
              { name: 'FTC Guides 16 CFR § 255', desc: 'Endorsements & mandatory #ad disclosures', status: 'Enforced' },
              { name: 'FDA Section 201(p)', desc: 'Health, cure, and wellness prevention claims', status: 'Enforced' },
              { name: 'Lanham Act § 43(a)', desc: 'Trademark disparagement & competitor slander', status: 'Enforced' },
              { name: 'Truth in Advertising Guidelines', desc: 'Substantiation of absolute guarantees', status: 'Enforced' },
              { name: 'Security Audit Trail', desc: 'Locally computed SHA-256 payload audit records', status: 'Active' },
            ].map((rule) => (
              <div key={rule.name} className="p-3 rounded-lg bg-slate-900/60 border border-white/5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-xs font-bold text-white mb-1">
                    <span>{rule.name}</span>
                    <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                      {rule.status}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">{rule.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Engine Sensitivity */}
        <div className="glass-card p-6 rounded-xl border border-white/10">
          <h2 className="text-base font-semibold text-white mb-1 flex items-center gap-2">
            <Sliders className="w-4 h-4 text-indigo-400" />
            Sentinel Engine Parameters
          </h2>
          <p className="text-xs text-slate-400 mb-4">
            Engine sensitivity weights for multi-vector threat categorization.
          </p>

          <div className="space-y-4 max-w-xl">
            <div>
              <div className="flex justify-between text-xs text-slate-300 mb-1">
                <span>Legal & Regulatory Penalty Weight</span>
                <span className="font-mono text-indigo-400 font-bold">35% (Critical: -35 pts)</span>
              </div>
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                <div className="bg-rose-500 h-full rounded-full" style={{ width: '85%' }}></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs text-slate-300 mb-1">
                <span>Claim Substantiation Weight</span>
                <span className="font-mono text-indigo-400 font-bold">25% (Warning: -15 pts)</span>
              </div>
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                <div className="bg-amber-500 h-full rounded-full" style={{ width: '70%' }}></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs text-slate-300 mb-1">
                <span>Trademark & IP Protection Weight</span>
                <span className="font-mono text-indigo-400 font-bold">20% (Info/Warning)</span>
              </div>
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                <div className="bg-cyan-500 h-full rounded-full" style={{ width: '60%' }}></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs text-slate-300 mb-1">
                <span>Brand Tone & Voice Alignment Weight</span>
                <span className="font-mono text-indigo-400 font-bold">20% (Warning)</span>
              </div>
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                <div className="bg-purple-500 h-full rounded-full" style={{ width: '60%' }}></div>
              </div>
            </div>
          </div>
        </div>

        {/* Demo State & Persistence Management */}
        <div className="glass-card p-6 rounded-xl border border-white/10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-white mb-1 flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-amber-400" />
                Demo State & Sandbox Controls
              </h2>
              <p className="text-xs text-slate-400 max-w-xl">
                Reset local demo scans, reviews, and test policies back to clean defaults for a fresh live demonstration.
                Does not affect remote Supabase production data.
              </p>
              <div className="mt-2 flex items-center gap-2 text-xs">
                <span className="text-slate-500">Active Storage:</span>
                <span className={`px-2 py-0.5 rounded font-mono text-[11px] ${isSupabaseConnected ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}>
                  {isSupabaseConnected ? 'Supabase Connected' : 'Demo LocalStorage Sandbox'}
                </span>
              </div>
            </div>

            <div>
              <button
                type="button"
                onClick={handleResetDemo}
                className="px-4 py-2 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs font-semibold flex items-center gap-2 transition-all hover:scale-[1.02] cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                {resetDone ? 'Reset Successful!' : 'Reset Demo Sandbox'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
