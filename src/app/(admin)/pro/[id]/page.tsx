"use client";
import { useEffect, useState, useCallback, use } from "react";
import { adminApi, type ProGameweekDetail, type ProGameweek } from "@/lib/api";
import Badge from "@/components/Badge";
import StatCard from "@/components/StatCard";
import { ArrowLeft, Crown, Wallet, Users, RefreshCw, Loader2, Trophy } from "lucide-react";

function fmtCurrency(n: number) { return "₦" + n.toLocaleString(); }
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

const STATUS_VARIANT: Record<ProGameweek["status"], "upcoming" | "open" | "locked" | "settled"> = {
  upcoming: "upcoming", open: "open", locked: "locked", settling: "locked", settled: "settled",
};

const FIXTURE_STATUS_VARIANT = {
  scheduled: "neutral",
  live:      "danger",
  finished:  "success",
} as const;

export default function ProGameweekDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [detail, setDetail] = useState<ProGameweekDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.getProGameweekDetail(id);
      setDetail(res.detail);
      setLastLoadedAt(new Date());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function handleSync() {
    setSyncing(true);
    setError("");
    try {
      const res = await adminApi.syncProGameweekFixtures(id);
      setDetail(res.detail);
      setLastLoadedAt(new Date());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  if (loading && !detail) {
    return <div className="p-8 text-sm text-muted">Loading…</div>;
  }

  if (!detail) {
    return (
      <div className="p-8 flex flex-col gap-4">
        <a href="/pro" className="flex items-center gap-1.5 text-sm text-muted hover:text-text transition-colors w-fit">
          <ArrowLeft size={14} /> Fantasy Market
        </a>
        <p className="text-sm text-danger">{error || "Gameweek not found"}</p>
      </div>
    );
  }

  const gw = detail.gameweek;

  return (
    <div className="p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <a href="/pro" className="text-sm text-muted hover:text-text transition-colors flex items-center gap-1">
            <ArrowLeft size={14} /> Fantasy Market
          </a>
          <span className="text-faint">/</span>
          <h1 className="text-xl font-black text-text">Gameweek #{gw.number}</h1>
          <Badge label={gw.status} variant={STATUS_VARIANT[gw.status]} />
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-surface-3 border border-border text-xs font-semibold text-muted hover:text-text disabled:opacity-50 transition-colors"
        >
          {syncing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          Sync Fixtures Now
        </button>
      </div>

      {error && <p className="text-xs text-danger bg-danger/10 border border-danger/20 rounded-xl px-4 py-3">{error}</p>}

      {lastLoadedAt && (
        <p className="text-[11px] text-faint -mt-4">
          Last refreshed {lastLoadedAt.toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </p>
      )}

      <div className="grid grid-cols-3 gap-4">
        <StatCard
          label="Currently Leading"
          value={detail.leader ? detail.leader.name : "—"}
          sub={detail.leader
            ? `${detail.leader.score.toFixed(1)} pts${detail.leaderSource === "live" ? " · live" : ""}`
            : gw.status === "settled" ? "No scored squads" : "Not scored yet"}
          accent="warning"
        />
        <StatCard label="Total Spent" value={fmtCurrency(detail.totalSpent)} accent="primary" />
        <StatCard label="Users Involved" value={detail.squadCount} accent="info" />
      </div>

      {/* Fixtures — this is the "is data actually flowing" view */}
      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <p className="text-sm font-bold text-text">Fixtures</p>
          <p className="text-xs text-muted mt-0.5">
            Status syncs automatically every minute while the gameweek is locked/settling — or click &quot;Sync Fixtures Now&quot; above.
          </p>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {["Kickoff", "League", "Match", "Status", "Ratings"].map((h) => (
                <th key={h} className="px-5 py-3 text-left text-[10px] font-bold text-muted uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {detail.fixtures.length === 0 && (
              <tr><td colSpan={5} className="px-5 py-6 text-center text-sm text-muted">No fixtures pulled for this gameweek.</td></tr>
            )}
            {detail.fixtures.map((f) => (
              <tr key={f._id} className="hover:bg-surface-2 transition-colors">
                <td className="px-5 py-3.5 text-sm text-muted">{fmtDateTime(f.kickoff)}</td>
                <td className="px-5 py-3.5 text-xs text-muted">{f.league}</td>
                <td className="px-5 py-3.5 text-sm font-semibold text-text">{f.homeTeam} vs {f.awayTeam}</td>
                <td className="px-5 py-3.5"><Badge label={f.status} variant={FIXTURE_STATUS_VARIANT[f.status]} /></td>
                <td className="px-5 py-3.5 text-xs">
                  {f.ratingsIngested
                    ? <span className="text-success font-semibold">Ingested</span>
                    : <span className="text-faint">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Top squads — settled rank or live running score, depending on status */}
      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <Trophy size={14} className="text-warning" />
          <p className="text-sm font-bold text-text">
            {gw.status === "settled" ? "Final Standings" : gw.status === "locked" || gw.status === "settling" ? "Live Leaderboard" : "Leaderboard"}
          </p>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {["Rank", "User", "Score"].map((h) => (
                <th key={h} className="px-5 py-3 text-left text-[10px] font-bold text-muted uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {detail.topSquads.length === 0 && (
              <tr><td colSpan={3} className="px-5 py-6 text-center text-sm text-muted">
                {gw.status === "open" || gw.status === "upcoming" ? "Squads are still being built — no scores yet." : "No squads to rank."}
              </td></tr>
            )}
            {detail.topSquads.map((s, i) => (
              <tr key={s.userId} className="hover:bg-surface-2 transition-colors">
                <td className="px-5 py-3.5 text-sm text-muted">
                  {s.rank === 1 ? <Crown size={13} className="text-warning inline mr-1" /> : null}
                  #{s.rank ?? i + 1}
                </td>
                <td className="px-5 py-3.5 text-sm font-semibold text-text">{s.name}</td>
                <td className="px-5 py-3.5 text-sm text-text tabular-nums">{s.score.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-surface border border-border rounded-xl px-5 py-4 flex items-center gap-3">
        <Wallet size={14} className="text-muted shrink-0" />
        <p className="text-xs text-muted">
          Budget cap snapshot: <span className="text-text font-semibold">{fmtCurrency(gw.budgetCapSnapshot)}</span>
          {" · "}Pricing multiplier: <span className="text-text font-semibold">×{gw.pricingMultiplierSnapshot}</span>
          {gw.firstKickoffAt && <> {" · "}First kickoff: <span className="text-text font-semibold">{fmtDateTime(gw.firstKickoffAt)}</span></>}
        </p>
      </div>
    </div>
  );
}
