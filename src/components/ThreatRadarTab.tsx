'use client';

import React, { useState } from 'react';
import {
  Activity,
  ShieldAlert,
  Globe,
  Radio,
  CheckCircle,
  Send,
  PlusCircle,
  Eye,
  Filter,
  Shield,
  X,
} from 'lucide-react';
import { ThreatMention } from '../types/brandguard';

interface ThreatRadarTabProps {
  threats: ThreatMention[];
  onUpdateThreatStatus: (id: string, status: ThreatMention['status']) => void;
  onAddThreat: (threat: ThreatMention) => void;
}

export const ThreatRadarTab: React.FC<ThreatRadarTabProps> = ({
  threats,
  onUpdateThreatStatus,
  onAddThreat,
}) => {
  const [filterSource, setFilterSource] = useState<string>('all');
  const [filterThreatLevel, setFilterThreatLevel] = useState<string>('all');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // New threat form state
  const [newSource, setNewSource] = useState<ThreatMention['source']>('Twitter/X');
  const [newAuthor, setNewAuthor] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newType, setNewType] = useState<ThreatMention['type']>('Counterfeit Ad');
  const [newSeverity, setNewSeverity] = useState<'high' | 'medium' | 'low'>('high');

  const showNotification = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleCreateThreat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAuthor.trim() || !newContent.trim()) return;

    const threat: ThreatMention = {
      id: `thm-${Date.now().toString().slice(-4)}`,
      source: newSource,
      author: newAuthor.trim(),
      handle: `@${newAuthor.toLowerCase().replace(/\s+/g, '_')}`,
      timestamp: 'Just now',
      content: newContent.trim(),
      threatLevel: newSeverity,
      type: newType,
      sentimentScore: -0.75,
      status: 'unresolved',
      reachEstimated: 'Active Monitor',
    };

    onAddThreat(threat);
    setIsAddModalOpen(false);
    setNewAuthor('');
    setNewContent('');
    showNotification('New brand threat incident recorded.');
  };

  const filteredThreats = threats.filter((t) => {
    if (filterSource !== 'all' && t.source !== filterSource) return false;
    if (filterThreatLevel !== 'all' && t.threatLevel !== filterThreatLevel) return false;
    return true;
  });

  const highThreatCount = threats.filter((t) => t.threatLevel === 'high' && t.status !== 'mitigated').length;
  const mitigatedCount = threats.filter((t) => t.status === 'mitigated').length;
  const channelCount = Array.from(new Set(threats.map((t) => t.source))).length || 4;
  const mitigationRate = threats.length > 0 ? Math.round((mitigatedCount / threats.length) * 100) : 100;

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 p-4 rounded-xl bg-slate-900 border border-indigo-500/40 text-slate-100 shadow-2xl flex items-center gap-3 animate-bounce">
          <Activity className="w-5 h-5 text-indigo-400" />
          <span className="text-sm font-semibold">{toastMessage}</span>
        </div>
      )}

      {/* Top Banner */}
      <div className="glass-panel rounded-2xl p-5 border border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-rose-400">
              Threat Intelligence Radar
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
            <span className="text-xs text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20">
              Active Perimeter Defense
            </span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight mt-1">
            Brand Reputation & Trademark Defense Radar
          </h1>
          <p className="text-sm text-slate-300 mt-0.5">
            Continuous surveillance of external digital channels, unauthorized trademark usage, typosquatted domains, and brand infringement incidents.
          </p>
        </div>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30 transition-all flex items-center gap-1.5 shrink-0 cursor-pointer"
        >
          <PlusCircle className="w-4 h-4 text-cyan-300" />
          Log Threat Incident
        </button>
      </div>

      {/* Top Threat Intelligence Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="glass-panel rounded-2xl p-4 border border-white/10 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center shrink-0">
            <ShieldAlert className="w-6 h-6 text-rose-400" />
          </div>
          <div>
            <span className="text-xs uppercase tracking-wider font-semibold text-slate-400">
              Active Critical Alerts
            </span>
            <div className="text-2xl font-black text-rose-400">{highThreatCount} Critical</div>
            <span className="text-[11px] text-slate-400">Requires investigation</span>
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-4 border border-white/10 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center shrink-0">
            <Radio className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <span className="text-xs uppercase tracking-wider font-semibold text-slate-400">
              Monitored Channels
            </span>
            <div className="text-2xl font-black text-white">{channelCount} Vectors</div>
            <span className="text-[11px] text-slate-400">Social, Web & Ad Feeds</span>
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-4 border border-white/10 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center shrink-0">
            <Globe className="w-6 h-6 text-cyan-400" />
          </div>
          <div>
            <span className="text-xs uppercase tracking-wider font-semibold text-slate-400">
              Total Incidents
            </span>
            <div className="text-2xl font-black text-white">{threats.length} Logged</div>
            <span className="text-[11px] text-slate-400">Recorded brand events</span>
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-4 border border-white/10 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
            <CheckCircle className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <span className="text-xs uppercase tracking-wider font-semibold text-slate-400">
              Mitigation Rate
            </span>
            <div className="text-2xl font-black text-emerald-400">{mitigationRate}%</div>
            <span className="text-[11px] text-slate-400">{mitigatedCount} Resolved & Taken Down</span>
          </div>
        </div>
      </div>

      {/* Main Section: Radar Visualizer & Threat Stream */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Radar Graphic */}
        <div className="lg:col-span-4 glass-panel rounded-2xl p-5 border border-white/10 flex flex-col items-center justify-center relative overflow-hidden">
          <div className="flex items-center justify-between w-full pb-3 border-b border-white/5 mb-4">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
              Sentinel Perimeter Sweep
            </span>
            <span className="text-[11px] font-mono text-emerald-400">ACTIVE RADAR</span>
          </div>

          {/* Animated Circular Radar Screen */}
          <div className="relative w-64 h-64 rounded-full border-2 border-indigo-500/30 bg-slate-950/80 flex items-center justify-center my-3 shadow-2xl shadow-indigo-500/10">
            <div className="absolute w-48 h-48 rounded-full border border-indigo-500/20"></div>
            <div className="absolute w-32 h-32 rounded-full border border-indigo-500/20"></div>
            <div className="absolute w-16 h-16 rounded-full border border-indigo-500/25"></div>

            {/* Sweep arm */}
            <div className="absolute inset-0 rounded-full overflow-hidden pointer-events-none">
              <div
                className="w-1/2 h-1/2 origin-bottom-right animate-spin"
                style={{
                  animationDuration: '6s',
                  background: 'conic-gradient(from 180deg at 100% 100%, transparent 60%, rgba(99, 102, 241, 0.4) 100%)',
                }}
              />
            </div>

            {/* Center icon */}
            <div className="relative z-10 w-10 h-10 rounded-full bg-indigo-600/30 border border-indigo-500/50 flex items-center justify-center">
              <Shield className="w-5 h-5 text-indigo-300" />
            </div>

            {/* Dynamic Threat Blips on Radar */}
            {threats.slice(0, 6).map((threat, idx) => {
              const angles = [45, 120, 210, 310, 160, 275];
              const dists = [70, 95, 55, 85, 100, 60];
              const angle = angles[idx % angles.length];
              const dist = dists[idx % dists.length];
              const rad = (angle * Math.PI) / 180;
              const x = Math.round(128 + dist * Math.cos(rad) - 6);
              const y = Math.round(128 + dist * Math.sin(rad) - 6);

              return (
                <div
                  key={threat.id}
                  style={{ left: `${x}px`, top: `${y}px` }}
                  className={`absolute w-3 h-3 rounded-full ${
                    threat.threatLevel === 'high' ? 'bg-rose-500' : 'bg-amber-400'
                  } shadow-lg animate-pulse`}
                  title={`${threat.type} on ${threat.source}`}
                />
              );
            })}
          </div>

          <div className="w-full text-center text-xs text-slate-400 mt-2">
            Perimeter Defense: Multi-Channel Discovery Active
          </div>
        </div>

        {/* Threat Stream List */}
        <div className="lg:col-span-8 glass-panel rounded-2xl p-5 border border-white/10 flex flex-col">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-white/5 gap-3">
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                Discovered Infringement Stream ({filteredThreats.length})
              </h2>
              <p className="text-xs text-slate-400">
                Prioritized external brand violations requiring review or legal takedown action.
              </p>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-2 text-xs">
              <div className="flex items-center gap-1 bg-slate-900 px-2.5 py-1 rounded-lg border border-white/5">
                <Filter className="w-3 h-3 text-slate-400" />
                <select
                  value={filterSource}
                  onChange={(e) => setFilterSource(e.target.value)}
                  className="bg-transparent text-slate-200 focus:outline-none cursor-pointer"
                >
                  <option value="all" className="bg-slate-900">All Sources</option>
                  <option value="Twitter/X" className="bg-slate-900">Twitter/X</option>
                  <option value="Reddit" className="bg-slate-900">Reddit</option>
                  <option value="Web Domain" className="bg-slate-900">Web Domains</option>
                  <option value="TikTok" className="bg-slate-900">TikTok</option>
                  <option value="Ad Network" className="bg-slate-900">Ad Networks</option>
                </select>
              </div>

              <div className="flex items-center gap-1 bg-slate-900 px-2.5 py-1 rounded-lg border border-white/5">
                <select
                  value={filterThreatLevel}
                  onChange={(e) => setFilterThreatLevel(e.target.value)}
                  className="bg-transparent text-slate-200 focus:outline-none cursor-pointer"
                >
                  <option value="all" className="bg-slate-900">All Severities</option>
                  <option value="high" className="bg-slate-900">Critical High</option>
                  <option value="medium" className="bg-slate-900">Medium</option>
                  <option value="low" className="bg-slate-900">Low / Monitored</option>
                </select>
              </div>
            </div>
          </div>

          <div className="mt-4 space-y-3.5 flex-1 overflow-y-auto max-h-[500px] pr-1">
            {filteredThreats.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-sm border border-dashed border-white/10 rounded-xl">
                No active threats detected. Click &ldquo;Log Threat Incident&rdquo; to add a tracked perimeter event.
              </div>
            ) : (
              filteredThreats.map((threat) => {
                const isHigh = threat.threatLevel === 'high';
                const isMitigated = threat.status === 'mitigated';

                return (
                  <div
                    key={threat.id}
                    className={`p-4 rounded-xl border transition-all ${
                      isMitigated
                        ? 'bg-slate-900/40 border-emerald-500/20 opacity-70'
                        : isHigh
                        ? 'bg-rose-950/20 border-rose-500/30 hover:border-rose-500/50'
                        : 'bg-slate-900/60 border-white/10 hover:border-indigo-500/30'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-white/10 text-slate-200 border border-white/15">
                          {threat.source}
                        </span>
                        <span className="text-xs font-bold text-white">{threat.author}</span>
                        <span className="text-xs text-slate-400 font-mono">{threat.handle}</span>
                        <span className="text-[11px] text-slate-500">• {threat.timestamp}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            threat.threatLevel === 'high'
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                              : threat.threatLevel === 'medium'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                              : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                          }`}
                        >
                          {threat.type}
                        </span>

                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                            threat.status === 'mitigated'
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : threat.status === 'investigating'
                              ? 'bg-amber-500/20 text-amber-400'
                              : 'bg-rose-500/20 text-rose-400'
                          }`}
                        >
                          {threat.status}
                        </span>
                      </div>
                    </div>

                    <p className="text-xs text-slate-200 leading-relaxed font-sans mb-3">
                      {threat.content}
                    </p>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-white/5 text-xs">
                      <div className="flex items-center gap-4 text-slate-400 text-[11px]">
                        <span className="flex items-center gap-1">
                          <Eye className="w-3.5 h-3.5 text-slate-500" />
                          Reach: {threat.reachEstimated}
                        </span>
                        <span>
                          Sentiment Risk:{' '}
                          <strong className="text-rose-400">
                            {Math.round(threat.sentimentScore * 100)}%
                          </strong>
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {threat.status !== 'mitigated' ? (
                          <>
                            <button
                              onClick={() => {
                                onUpdateThreatStatus(threat.id, 'investigating');
                                showNotification(`Dispatched incident ${threat.id} to Legal Sentinel`);
                              }}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 transition-all border border-amber-500/30 cursor-pointer"
                            >
                              Investigate
                            </button>
                            <button
                              onClick={() => {
                                onUpdateThreatStatus(threat.id, 'mitigated');
                                showNotification(`Cease & Desist transmitted for ${threat.id}`);
                              }}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-all flex items-center gap-1 cursor-pointer"
                            >
                              <Send className="w-3 h-3" />
                              Trigger Takedown
                            </button>
                          </>
                        ) : (
                          <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
                            <CheckCircle className="w-3.5 h-3.5" />
                            Mitigated & Recorded
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Log Threat Incident Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-lg rounded-2xl p-6 border border-white/10 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-400" />
                Record External Brand Threat
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateThreat} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-300 mb-1 font-semibold">Incident Channel / Source</label>
                <select
                  value={newSource}
                  onChange={(e) => setNewSource(e.target.value as ThreatMention['source'])}
                  className="w-full bg-slate-900 border border-white/10 rounded-lg p-2 text-slate-200"
                >
                  <option value="Twitter/X">Twitter/X</option>
                  <option value="Reddit">Reddit</option>
                  <option value="Web Domain">Web Domain / WHOIS</option>
                  <option value="TikTok">TikTok</option>
                  <option value="Ad Network">Ad Network</option>
                  <option value="Press">Press / Media</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-semibold">Actor / Entity Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Counterfeit Account @BrandPromo"
                  value={newAuthor}
                  onChange={(e) => setNewAuthor(e.target.value)}
                  className="w-full bg-slate-900 border border-white/10 rounded-lg p-2 text-slate-200 placeholder:text-slate-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">Threat Classification</label>
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as ThreatMention['type'])}
                    className="w-full bg-slate-900 border border-white/10 rounded-lg p-2 text-slate-200"
                  >
                    <option value="Counterfeit Ad">Counterfeit Ad</option>
                    <option value="Trademark Misuse">Trademark Misuse</option>
                    <option value="Spoofed Domain">Spoofed Domain</option>
                    <option value="Unauthorized Endorsement">Unauthorized Endorsement</option>
                    <option value="PR Crisis / Sentiment">PR Crisis</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-semibold">Severity</label>
                  <select
                    value={newSeverity}
                    onChange={(e) => setNewSeverity(e.target.value as 'high' | 'medium' | 'low')}
                    className="w-full bg-slate-900 border border-white/10 rounded-lg p-2 text-slate-200"
                  >
                    <option value="high">Critical High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-semibold">Incident Details / Evidence</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Describe the trademark infringement or suspicious external link..."
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  className="w-full bg-slate-900 border border-white/10 rounded-lg p-2 text-slate-200 placeholder:text-slate-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg bg-white/5 text-slate-300 hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-500"
                >
                  Record Threat
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
