"use client";
import { useEffect, useState } from "react";
import { adminApi, MatchdayRecord } from "@/lib/api";
import Badge from "@/components/Badge";
import { Radio, CircleDot } from "lucide-react";

// Sport lineup — only Football pools exist today. The rest are shown as a
// disabled roadmap teaser (not wired to anything) so admins/investors can
// see multi-sport is coming without implying it already works.
const SPORTS = [
  { label: "Football",   active: true },
  { label: "Basketball", active: false },
  { label: "Tennis",     active: false },
  { label: "Cricket",    active: false },
];

function SportTabs() {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {SPORTS.map((s) => (
        <div
          key={s.label}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border ${
            s.active
              ? "bg-primary/10 border-primary/30 text-primary"
              : "bg-surface-3 border-border text-faint cursor-not-allowed select-none"
          }`}
        >
          <CircleDot size={12} />
          {s.label}
          {!s.active && (
            <span className="text-[9px] font-black uppercase tracking-wider bg-surface border border-border px-1.5 py-0.5 rounded text-muted">
              Soon
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

const POOL_CATEGORY_LABELS: Record<string, string> = {
  GK: "Goalkeepers", DEF: "Defenders", MID: "Midfielders", ATT: "Attackers",
};

// Daily pool sessions only — weekly (Match Weeks) was removed from Classic.
type SessionRow = MatchdayRecord;

export default function ClassicPage() {
  const [matchdays, setMatchdays]   = useState<MatchdayRecord[]>([]);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    adminApi.listMatchdays()
      .then((dRes) => setMatchdays(dRes.matchdays ?? []))
      .finally(() => setLoading(false));
  }, []);

  // Find any currently-live session
  const liveDay = matchdays.find((m) => m.liveActive);

  // Most recent first
  const rows: SessionRow[] = [...matchdays].sort(
    (a, b) => new Date(b.matchDate).getTime() - new Date(a.matchDate).getTime(),
  );

  const hasLive = Boolean(liveDay);

  return (
    <div className="p-8 flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-xl font-black text-text">Classic Market</h1>
          <p className="text-sm text-muted mt-0.5">
            Pari-mutuel pools · 4 categories (ATT / MID / DEF / GK) · 12% house cut
          </p>
        </div>
        <SportTabs />
      </div>

      {/* ── Live banner ──────────────────────────────────────────────────────── */}
      {hasLive && (
        <div className="rounded-2xl bg-red-500/[0.06] border border-red-500/20 p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <p className="text-sm font-bold text-red-400">Live session active</p>
          </div>

          <div className="flex flex-col gap-2">
            {liveDay && (
              <div className="flex items-center justify-between bg-surface-2 rounded-xl px-4 py-3">
                <div>
                  <p className="text-xs font-semibold text-text">
                    Daily · {liveDay.label} · {fmtDate(liveDay.matchDate)}
                  </p>
                  <p className="text-[11px] text-muted mt-0.5">
                    {liveDay.liveRankings
                      ? (["ATT","MID","DEF","GK"] as const)
                          .map((c) => liveDay.liveRankings[c]
                            ? `${c}: ${liveDay.liveRankings[c]!.playerName} ${liveDay.liveRankings[c]!.rating}`
                            : `${c}: —`)
                          .join("  ·  ")
                      : "No rankings yet"}
                  </p>
                </div>
                <a
                  href={`/match-days/${liveDay._id}`}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs font-bold text-amber-400 hover:bg-amber-500/15 transition-colors shrink-0 ml-4"
                >
                  <Radio size={12} />
                  Update Rankings
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── How it works strip ───────────────────────────────────────────────── */}
      <div className="bg-surface border border-border rounded-xl px-5 py-4 grid grid-cols-4 gap-4 text-center">
        {[
          ["ATT", "Attackers", "LW · RW · ST"],
          ["MID", "Midfielders", "DM · LM · AM · CAM · RM"],
          ["DEF", "Defenders", "LB · CB · RB"],
          ["GK",  "Goalkeepers", "GK"],
        ].map(([cat, label, sub]) => (
          <div key={cat} className="flex flex-col items-center gap-1">
            <span className="text-xs font-black text-primary">{cat}</span>
            <span className="text-[11px] font-semibold text-text">{label}</span>
            <span className="text-[10px] text-faint">{sub}</span>
          </div>
        ))}
      </div>

      {/* ── Combined sessions table ──────────────────────────────────────────── */}
      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-text">All Sessions</p>
            <p className="text-xs text-muted mt-0.5">Daily (Match Days) pools</p>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-muted">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-500/30" /> Daily</span>
          </div>
        </div>

        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {["Label", "Date", "Status", "Live", "Pools", ""].map((h) => (
                <th key={h} className="px-5 py-3 text-left text-[10px] font-bold text-muted uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading && (
              <tr><td colSpan={6} className="px-5 py-8 text-center text-sm text-muted">Loading…</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-sm text-muted">
                  No sessions yet. Create a Match Day first.
                </td>
              </tr>
            )}
            {rows.slice(0, 20).map((d) => {
              const dateStr = fmtDate(d.matchDate);
              const href    = `/match-days/${d._id}`;
              const isLive  = d.liveActive;

              return (
                <tr key={d._id} className={`hover:bg-surface-2 transition-colors ${
                  isLive ? "bg-amber-500/[0.03]" : ""
                }`}>
                  {/* Label */}
                  <td className="px-5 py-4 text-sm font-semibold text-text">{d.label}</td>

                  {/* Date */}
                  <td className="px-5 py-4 text-sm text-muted">{dateStr}</td>

                  {/* Status */}
                  <td className="px-5 py-4">
                    <Badge label={d.status} variant={d.status} />
                  </td>

                  {/* Live status */}
                  <td className="px-5 py-4">
                    {isLive ? (
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                        <span className="text-xs font-bold text-red-400">Live</span>
                      </div>
                    ) : (
                      <span className="text-xs text-faint">—</span>
                    )}
                  </td>

                  {/* Pool count */}
                  <td className="px-5 py-4">
                    <div className="flex gap-1 flex-wrap">
                      {(["ATT","MID","DEF","GK"] as const).map((cat) => (
                        <span
                          key={cat}
                          className="text-[9px] font-black px-1.5 py-0.5 rounded border text-amber-400/60 bg-amber-500/5 border-amber-500/10"
                        >
                          {cat}
                        </span>
                      ))}
                    </div>
                  </td>

                  {/* Actions */}
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <a href={href} className="text-xs text-primary hover:underline font-semibold whitespace-nowrap">
                        Manage pools →
                      </a>
                      {isLive && (
                        <a href={href} className="flex items-center gap-1 text-xs text-red-400 hover:underline font-semibold whitespace-nowrap">
                          <Radio size={11} />
                          Update live
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
