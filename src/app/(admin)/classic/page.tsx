"use client";
import { useEffect, useState } from "react";
import { adminApi, Matchday, MatchdayRecord } from "@/lib/api";
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

// Unified row type so we can merge both lists into one table
type SessionRow =
  | { kind: "weekly"; data: Matchday }
  | { kind: "daily";  data: MatchdayRecord };

export default function ClassicPage() {
  const [matchweeks, setMatchweeks] = useState<Matchday[]>([]);
  const [matchdays, setMatchdays]   = useState<MatchdayRecord[]>([]);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    Promise.all([
      adminApi.listMatchweeks().catch(() => ({ matchweeks: [] as Matchday[] })),
      adminApi.listMatchdays().catch(()   => ({ matchdays:  [] as MatchdayRecord[] })),
    ]).then(([wRes, dRes]) => {
      setMatchweeks(wRes.matchweeks ?? []);
      setMatchdays(dRes.matchdays ?? []);
    }).finally(() => setLoading(false));
  }, []);

  // Find any currently-live sessions
  const liveWeek = matchweeks.find((m) => m.liveActive);
  const liveDay  = matchdays.find((m)  => m.liveActive);

  // Merge and sort by most recent first
  const rows: SessionRow[] = [
    ...matchweeks.map((d): SessionRow => ({ kind: "weekly", data: d })),
    ...matchdays.map((d):  SessionRow => ({ kind: "daily",  data: d })),
  ].sort((a, b) => {
    const dateA = a.kind === "weekly" ? a.data.startsAt : (a.data as MatchdayRecord).matchDate;
    const dateB = b.kind === "weekly" ? b.data.startsAt : (b.data as MatchdayRecord).matchDate;
    return new Date(dateB).getTime() - new Date(dateA).getTime();
  });

  const hasLive = liveWeek || liveDay;

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
            {liveWeek && (
              <div className="flex items-center justify-between bg-surface-2 rounded-xl px-4 py-3">
                <div>
                  <p className="text-xs font-semibold text-text">
                    Weekly · GW{liveWeek.weekNumber} · {fmtDate(liveWeek.startsAt)}
                  </p>
                  <p className="text-[11px] text-muted mt-0.5">
                    {liveWeek.liveRankings
                      ? (["ATT","MID","DEF","GK"] as const)
                          .map((c) => liveWeek.liveRankings[c]
                            ? `${c}: ${liveWeek.liveRankings[c]!.playerName} ${liveWeek.liveRankings[c]!.rating}`
                            : `${c}: —`)
                          .join("  ·  ")
                      : "No rankings yet"}
                  </p>
                </div>
                <a
                  href={`/matchdays/${liveWeek._id}`}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-xs font-bold text-red-400 hover:bg-red-500/15 transition-colors shrink-0 ml-4"
                >
                  <Radio size={12} />
                  Update Rankings
                </a>
              </div>
            )}

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
            <p className="text-xs text-muted mt-0.5">Weekly (Match Weeks) and Daily (Match Days) pools combined</p>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-muted">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-primary/30" /> Weekly</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-500/30" /> Daily</span>
          </div>
        </div>

        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {["Type", "Label / Week", "Date", "Status", "Live", "Pools", ""].map((h) => (
                <th key={h} className="px-5 py-3 text-left text-[10px] font-bold text-muted uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading && (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-sm text-muted">Loading…</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-sm text-muted">
                  No sessions yet. Create Match Weeks or Match Days first.
                </td>
              </tr>
            )}
            {rows.slice(0, 20).map((row) => {
              const isWeekly = row.kind === "weekly";
              const d        = row.data;
              const dateStr  = isWeekly ? fmtDate((d as Matchday).startsAt) : fmtDate((d as MatchdayRecord).matchDate);
              const label    = isWeekly ? `GW${(d as Matchday).weekNumber} · ${(d as Matchday).season}` : (d as MatchdayRecord).label;
              const href     = isWeekly ? `/matchdays/${d._id}` : `/match-days/${d._id}`;
              const isLive   = d.liveActive;

              return (
                <tr key={`${row.kind}-${d._id}`} className={`hover:bg-surface-2 transition-colors ${
                  isLive ? (isWeekly ? "bg-red-500/[0.03]" : "bg-amber-500/[0.03]") : ""
                }`}>
                  {/* Type badge */}
                  <td className="px-5 py-4">
                    <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-md border ${
                      isWeekly
                        ? "text-primary bg-primary/10 border-primary/20"
                        : "text-amber-400 bg-amber-500/10 border-amber-500/20"
                    }`}>
                      {isWeekly ? "Weekly" : "Daily"}
                    </span>
                  </td>

                  {/* Label */}
                  <td className="px-5 py-4 text-sm font-semibold text-text">{label}</td>

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
                          className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${
                            isWeekly
                              ? "text-primary/60 bg-primary/5 border-primary/10"
                              : "text-amber-400/60 bg-amber-500/5 border-amber-500/10"
                          }`}
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
