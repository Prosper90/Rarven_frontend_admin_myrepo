"use client";
import { useEffect, useState } from "react";
import { adminApi, Matchday, MatchdayRecord, PlatformStats, type Player } from "@/lib/api";
import { getAdminInfo } from "@/lib/auth";
import StatCard from "@/components/StatCard";
import Badge from "@/components/Badge";
import { Shield, Edit2, Check, X, ExternalLink, Loader2, CheckCircle } from "lucide-react";

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" });
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}
function fmtCurrency(n: number) { return "₦" + n.toLocaleString(); }

// Unified row type for the combined sessions table
type SessionRow =
  | { kind: "weekly"; data: Matchday }
  | { kind: "daily";  data: MatchdayRecord };

export default function DashboardPage() {
  const admin         = getAdminInfo();
  const canSeeRevenue = admin?.role === "superadmin" || admin?.role === "pool_manager";

  const [stats, setStats]           = useState<PlatformStats | null>(null);
  const [matchweeks, setMatchweeks]  = useState<Matchday[]>([]);
  const [matchdays, setMatchdays]    = useState<MatchdayRecord[]>([]);
  const [players, setPlayers]        = useState<Player[]>([]);
  const [reserve, setReserve]        = useState<number | null>(null);
  const [reserveEdit, setReserveEdit] = useState(false);
  const [reserveInput, setReserveInput] = useState("");
  const [reserveSaving, setReserveSaving] = useState(false);
  const [fundMode, setFundMode]       = useState(false);
  const [fundAmount, setFundAmount]   = useState("");
  const [fundLoading, setFundLoading] = useState(false);
  const [fundError, setFundError]     = useState("");
  const [fundSuccess, setFundSuccess] = useState(false);
  const [topUpMode, setTopUpMode]       = useState(false);
  const [topUpAmount, setTopUpAmount]   = useState("");
  const [topUpLoading, setTopUpLoading] = useState(false);
  const [topUpError, setTopUpError]     = useState("");
  const [loading, setLoading]        = useState(true);
  const [error, setError]            = useState("");

  useEffect(() => {
    const isSuperadmin = admin?.role === "superadmin";
    Promise.all([
      adminApi.stats().catch(() => null),
      adminApi.listMatchweeks().catch(() => ({ matchweeks: [] as Matchday[] })),
      adminApi.listMatchdays().catch(()  => ({ matchdays:  [] as MatchdayRecord[] })),
      canSeeRevenue
        ? adminApi.listPlayers().catch(() => ({ success: true, players: [] as Player[] }))
        : Promise.resolve({ success: true, players: [] as Player[] }),
      isSuperadmin
        ? adminApi.getReserve().catch(() => null)
        : Promise.resolve(null),
    ]).then(([s, mw, md, p, r]) => {
      if (s) setStats({ totalUsers: s.totalUsers, usersByRegion: s.usersByRegion, revenue: s.revenue });
      setMatchweeks(mw.matchweeks ?? []);
      setMatchdays(md.matchdays ?? []);
      setPlayers(p.players ?? []);
      if (r) setReserve(r.reserve);
    }).catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [canSeeRevenue]); // eslint-disable-line react-hooks/exhaustive-deps

  // Detect Paystack callback after reserve funding
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get('reference');
    if (!ref?.startsWith('RSV-')) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('reference');
    url.searchParams.delete('trxref');
    window.history.replaceState({}, '', url.toString());
    adminApi.verifyReserve(ref)
      .then((r) => {
        setReserve(r.reserve);
        setFundSuccess(true);
        setTimeout(() => setFundSuccess(false), 6000);
      })
      .catch(() => setFundError('Reserve verification failed — the webhook may still process it'));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleTopUp() {
    const amt = Number(topUpAmount);
    if (isNaN(amt) || amt <= 0) { setTopUpError('Enter a positive amount'); return; }
    setTopUpLoading(true);
    setTopUpError('');
    try {
      const r = await adminApi.topUpReserve(amt);
      setReserve(r.reserve);
      setTopUpMode(false);
      setTopUpAmount("");
    } catch (e: unknown) {
      setTopUpError(e instanceof Error ? e.message : 'Top-up failed');
    } finally {
      setTopUpLoading(false);
    }
  }

  async function handleFundReserve() {
    const amt = Number(fundAmount);
    if (isNaN(amt) || amt < 100) { setFundError('Minimum ₦100'); return; }
    setFundLoading(true);
    setFundError('');
    try {
      const result = await adminApi.fundReserve(amt);
      window.location.href = result.authorization_url;
    } catch (e: unknown) {
      setFundError(e instanceof Error ? e.message : 'Failed to initialize payment');
      setFundLoading(false);
    }
  }

  // Merge and sort all sessions newest-first
  const allRows: SessionRow[] = [
    ...matchweeks.map((d): SessionRow => ({ kind: "weekly", data: d })),
    ...matchdays.map((d):  SessionRow => ({ kind: "daily",  data: d })),
  ].sort((a, b) => {
    const dateA = a.kind === "weekly" ? a.data.startsAt : (a.data as MatchdayRecord).matchDate;
    const dateB = b.kind === "weekly" ? b.data.startsAt : (b.data as MatchdayRecord).matchDate;
    return new Date(dateB).getTime() - new Date(dateA).getTime();
  });

  // Active counts
  const openWeeks    = matchweeks.filter((m) => m.status === "open" || m.status === "locked").length;
  const openDays     = matchdays.filter((m)  => m.status === "open" || m.status === "locked").length;
  const liveWeek     = matchweeks.find((m) => m.liveActive);
  const liveDay      = matchdays.find((m)  => m.liveActive);
  const activePlayers = players.filter((p) => p.isActive).length;
  const topRegions   = stats?.usersByRegion.sort((a, b) => b.count - a.count).slice(0, 5) ?? [];

  // Most relevant open session for "Today" card
  const todayWeek = matchweeks.find((m) => m.status === "open");
  const todayDay  = matchdays.find((m) => {
    if (m.status !== "open") return false;
    const d = new Date(m.matchDate);
    return d.toDateString() === new Date().toDateString();
  });

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <p className="text-muted text-sm">Loading dashboard…</p>
    </div>
  );

  return (
    <div className="p-8 flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-black text-text">Dashboard</h1>
        <p className="text-sm text-muted mt-0.5">
          {new Date().toLocaleDateString("en-NG", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </p>
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/20 rounded-xl px-4 py-3 text-sm text-danger">
          Backend offline — showing cached/empty data. ({error})
        </div>
      )}

      {/* Live banner */}
      {(liveWeek || liveDay) && (
        <div className="bg-red-500/[0.06] border border-red-500/20 rounded-xl px-4 py-3 flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
          <span className="text-sm font-bold text-red-400">Live session active —</span>
          <span className="text-xs text-muted">
            {[liveWeek && `Weekly GW${liveWeek.weekNumber}`, liveDay && `Daily ${liveDay.label}`]
              .filter(Boolean).join(" · ")}
          </span>
          <a
            href={liveWeek ? `/matchdays/${liveWeek._id}` : `/match-days/${liveDay!._id}`}
            className="ml-auto text-xs font-bold text-red-400 hover:underline shrink-0"
          >
            Update rankings →
          </a>
        </div>
      )}

      {/* Stat strip */}
      <div className={`grid gap-4 ${canSeeRevenue ? "grid-cols-4" : "grid-cols-3"}`}>
        <StatCard label="Total Users"    value={stats?.totalUsers ?? "—"}   sub="All regions"              accent="primary" />
        <StatCard label="Open Sessions"  value={openWeeks + openDays}        sub={`${openWeeks}w · ${openDays}d active`} accent="success" />
        {canSeeRevenue && (
          <StatCard label="Active Players" value={activePlayers}             sub="In roster"                accent="info" />
        )}
        <StatCard label="Regions Live"   value={stats?.usersByRegion.length ?? "—"} sub="Countries"        accent="warning" />
      </div>

      {/* Revenue cards */}
      {canSeeRevenue && stats?.revenue && (
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-surface border border-border rounded-xl p-4">
            <p className="text-[10px] font-semibold text-muted uppercase tracking-wider">Total Deposits</p>
            <p className="text-xl font-black text-success mt-1">{fmtCurrency(stats.revenue.totalDeposits)}</p>
            <p className="text-[10px] text-faint mt-1">All time</p>
          </div>
          <div className="bg-surface border border-border rounded-xl p-4">
            <p className="text-[10px] font-semibold text-muted uppercase tracking-wider">Total Withdrawals</p>
            <p className="text-xl font-black text-danger mt-1">{fmtCurrency(stats.revenue.totalWithdrawals)}</p>
            <p className="text-[10px] text-faint mt-1">All time</p>
          </div>
          <div className="bg-surface border border-border rounded-xl p-4">
            <p className="text-[10px] font-semibold text-muted uppercase tracking-wider">Net Flow</p>
            <p className={`text-xl font-black mt-1 ${stats.revenue.netFlow >= 0 ? "text-success" : "text-danger"}`}>
              {fmtCurrency(stats.revenue.netFlow)}
            </p>
            <p className="text-[10px] text-faint mt-1">Deposits – Withdrawals</p>
          </div>
          <div className="bg-surface border border-border rounded-xl p-4">
            <p className="text-[10px] font-semibold text-muted uppercase tracking-wider">Total Wallets</p>
            <p className="text-xl font-black text-primary mt-1">{fmtCurrency(stats.revenue.totalWallets)}</p>
            <p className="text-[10px] text-faint mt-1">Across all users</p>
          </div>
        </div>
      )}

      {/* Reserve card — superadmin only */}
      {admin?.role === "superadmin" && reserve !== null && (
        <div className="bg-amber-500/[0.04] border border-amber-500/20 rounded-xl p-4 flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0 mt-0.5">
            <Shield size={18} className="text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold text-amber-400/60 uppercase tracking-wider">Platform Reserve</p>
            {reserveEdit ? (
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm text-amber-400">₦</span>
                <input
                  type="number"
                  value={reserveInput}
                  onChange={(e) => setReserveInput(e.target.value)}
                  className="w-36 bg-surface-2 border border-amber-500/30 rounded-lg px-2 py-1 text-sm font-bold text-amber-300 outline-none focus:border-amber-500/60"
                  autoFocus
                />
                <button
                  disabled={reserveSaving}
                  onClick={async () => {
                    const val = Number(reserveInput);
                    if (isNaN(val) || val < 0) return;
                    setReserveSaving(true);
                    try {
                      const r = await adminApi.setReserve(val);
                      setReserve(r.reserve);
                      setReserveEdit(false);
                    } catch { /* silently ignore */ }
                    finally { setReserveSaving(false); }
                  }}
                  className="p-1.5 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-400 hover:bg-amber-500/30 disabled:opacity-50 transition-colors"
                >
                  <Check size={14} />
                </button>
                <button
                  onClick={() => setReserveEdit(false)}
                  className="p-1.5 rounded-lg bg-surface-2 border border-border text-muted hover:text-text transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            ) : topUpMode ? (
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm text-amber-400">₦</span>
                <input
                  type="number"
                  min="1"
                  value={topUpAmount}
                  onChange={(e) => { setTopUpAmount(e.target.value); setTopUpError(''); }}
                  placeholder="e.g. 50000"
                  autoFocus
                  className="w-36 bg-surface-2 border border-amber-500/30 rounded-lg px-2 py-1 text-sm text-amber-300 outline-none focus:border-amber-500/60 placeholder:text-amber-500/30"
                />
                <button
                  disabled={topUpLoading || !topUpAmount}
                  onClick={handleTopUp}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-400 hover:bg-amber-500/30 disabled:opacity-50 text-xs font-bold transition-colors"
                >
                  {topUpLoading ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                  {topUpLoading ? "Adding…" : "Add"}
                </button>
                <button
                  onClick={() => { setTopUpMode(false); setTopUpAmount(''); setTopUpError(''); }}
                  className="p-1.5 rounded-lg bg-surface-2 border border-border text-muted hover:text-text transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            ) : fundMode ? (
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm text-amber-400">₦</span>
                <input
                  type="number"
                  min="100"
                  value={fundAmount}
                  onChange={(e) => { setFundAmount(e.target.value); setFundError(''); }}
                  placeholder="e.g. 5000"
                  autoFocus
                  className="w-36 bg-surface-2 border border-amber-500/30 rounded-lg px-2 py-1 text-sm text-amber-300 outline-none focus:border-amber-500/60 placeholder:text-amber-500/30"
                />
                <button
                  disabled={fundLoading || !fundAmount}
                  onClick={handleFundReserve}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-400 hover:bg-amber-500/30 disabled:opacity-50 text-xs font-bold transition-colors"
                >
                  {fundLoading ? <Loader2 size={12} className="animate-spin" /> : <ExternalLink size={12} />}
                  {fundLoading ? "Opening…" : "Pay via Paystack"}
                </button>
                <button
                  onClick={() => { setFundMode(false); setFundAmount(''); setFundError(''); }}
                  className="p-1.5 rounded-lg bg-surface-2 border border-border text-muted hover:text-text transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <p className="text-xl font-black text-amber-300 mt-0.5">{fmtCurrency(reserve)}</p>
            )}
            {topUpError && <p className="text-xs text-danger mt-1">{topUpError}</p>}
            {fundError && <p className="text-xs text-danger mt-1">{fundError}</p>}
            {fundSuccess && (
              <div className="flex items-center gap-1.5 text-xs text-success mt-1">
                <CheckCircle size={12} />
                Reserve funded successfully
              </div>
            )}
            {!reserveEdit && !fundMode && !topUpMode && (
              <p className="text-[10px] text-amber-400/40 mt-1">
                Top Up = manual testnet ledger bump · Fund = real Paystack payment (needs a live key)
              </p>
            )}
          </div>
          {!reserveEdit && !fundMode && !topUpMode && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => { setReserveInput(String(reserve)); setReserveEdit(true); }}
                className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 transition-colors"
                title="Set reserve balance manually (absolute override)"
              >
                <Edit2 size={14} />
              </button>
              <button
                onClick={() => { setTopUpMode(true); setTopUpError(''); }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 text-xs font-bold transition-colors"
                title="Testnet: add an amount to the current reserve"
              >
                <Check size={13} />
                Top Up
              </button>
              <button
                onClick={() => { setFundMode(true); setFundError(''); }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 text-xs font-bold transition-colors"
                title="Mainnet: fund reserve via real Paystack payment"
              >
                <ExternalLink size={13} />
                Fund
              </button>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        {/* Active sessions card */}
        <div className="bg-surface border border-border rounded-2xl p-5 flex flex-col gap-4">
          <p className="text-sm font-bold text-text">Active Sessions</p>

          {/* Weekly */}
          {todayWeek ? (
            <div className="rounded-xl bg-surface-2 border border-border p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-primary uppercase tracking-widest px-1.5 py-0.5 bg-primary/10 border border-primary/20 rounded">Weekly</span>
                  <span className="text-xs font-semibold text-text">GW{todayWeek.weekNumber} · {todayWeek.season}</span>
                </div>
                <Badge label={todayWeek.status} variant={todayWeek.status} />
              </div>
              <div className="grid grid-cols-3 gap-2 text-[11px]">
                <div><p className="text-faint uppercase tracking-wider">Opens</p><p className="text-success font-semibold mt-0.5">{fmtTime(todayWeek.startsAt)}</p></div>
                <div><p className="text-faint uppercase tracking-wider">Classic closes</p><p className="text-warning font-semibold mt-0.5">{fmtTime(todayWeek.endsAt)}</p></div>
                <div><p className="text-faint uppercase tracking-wider">Lock deadline</p><p className="text-muted font-semibold mt-0.5">{todayWeek.lockDeadline ? fmtTime(todayWeek.lockDeadline) : "—"}</p></div>
              </div>
              {canSeeRevenue && (
                <a href={`/matchdays/${todayWeek._id}`} className="text-center text-xs font-bold text-primary bg-primary/10 border border-primary/20 rounded-xl py-2 hover:bg-primary/20 transition-colors">
                  Manage →
                </a>
              )}
            </div>
          ) : (
            <div className="rounded-xl bg-surface-2 border border-border p-3 text-center">
              <p className="text-xs text-muted">No open match week.</p>
              {canSeeRevenue && <a href="/matchdays" className="text-xs text-primary hover:underline mt-1 inline-block">Create match week →</a>}
            </div>
          )}

          {/* Daily */}
          {todayDay ? (
            <div className="rounded-xl bg-amber-500/[0.04] border border-amber-500/15 p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest px-1.5 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded">Daily</span>
                  <span className="text-xs font-semibold text-text truncate">{todayDay.label}</span>
                </div>
                <Badge label={todayDay.status} variant={todayDay.status} />
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div><p className="text-faint uppercase tracking-wider">Date</p><p className="text-amber-400/80 font-semibold mt-0.5">{fmtDate(todayDay.matchDate)}</p></div>
                <div><p className="text-faint uppercase tracking-wider">Lock deadline</p><p className="text-muted font-semibold mt-0.5">{todayDay.lockDeadline ? fmtTime(todayDay.lockDeadline) : "—"}</p></div>
              </div>
              {canSeeRevenue && (
                <a href={`/match-days/${todayDay._id}`} className="text-center text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl py-2 hover:bg-amber-500/15 transition-colors">
                  Manage →
                </a>
              )}
            </div>
          ) : (
            <div className="rounded-xl bg-surface-2 border border-border p-3 text-center">
              <p className="text-xs text-muted">No daily match day open today.</p>
              {canSeeRevenue && <a href="/match-days" className="text-xs text-amber-400 hover:underline mt-1 inline-block">Create match day →</a>}
            </div>
          )}
        </div>

        {/* Users by region */}
        <div className="bg-surface border border-border rounded-2xl p-5">
          <p className="text-sm font-bold text-text mb-4">Users by Region</p>
          {topRegions.length === 0 ? (
            <p className="text-sm text-muted text-center py-4">No users yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {topRegions.map((r) => {
                const pct = stats ? Math.round((r.count / stats.totalUsers) * 100) : 0;
                return (
                  <div key={r._id} className="flex items-center gap-3">
                    <span className="text-xs font-bold text-text w-8">{r._id}</span>
                    <div className="flex-1 bg-surface-3 rounded-full h-1.5">
                      <div className="bg-primary h-full rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs text-muted w-12 text-right">{r.count.toLocaleString()}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Recent sessions — combined weekly + daily */}
      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-text">Recent Sessions</p>
            <p className="text-xs text-muted mt-0.5">Match weeks and match days combined</p>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-muted">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-primary/30 inline-block" />Weekly</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-amber-500/30 inline-block" />Daily</span>
          </div>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {["Type", "Label", "Date", "Lock", "Status", "Live", ""].map((h) => (
                <th key={h} className="px-5 py-3 text-left text-[10px] font-bold text-muted uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {allRows.slice(0, 10).map((row) => {
              const isWeekly = row.kind === "weekly";
              const d        = row.data;
              const dateStr  = isWeekly ? fmtDate((d as Matchday).startsAt) : fmtDate((d as MatchdayRecord).matchDate);
              const label    = isWeekly ? `GW${(d as Matchday).weekNumber} · ${(d as Matchday).season}` : (d as MatchdayRecord).label;
              const lock     = d.lockDeadline ? fmtTime(d.lockDeadline) : "—";
              const href     = isWeekly ? `/matchdays/${d._id}` : `/match-days/${d._id}`;

              return (
                <tr key={`${row.kind}-${d._id}`} className="hover:bg-surface-2 transition-colors">
                  <td className="px-5 py-3">
                    <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded border ${
                      isWeekly
                        ? "text-primary bg-primary/10 border-primary/20"
                        : "text-amber-400 bg-amber-500/10 border-amber-500/20"
                    }`}>
                      {isWeekly ? "Weekly" : "Daily"}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-sm font-semibold text-text">{label}</td>
                  <td className="px-5 py-3 text-sm text-muted">{dateStr}</td>
                  <td className="px-5 py-3 text-xs text-muted">{lock}</td>
                  <td className="px-5 py-3"><Badge label={d.status} variant={d.status} /></td>
                  <td className="px-5 py-3">
                    {d.liveActive
                      ? <div className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /><span className="text-xs font-bold text-red-400">Live</span></div>
                      : <span className="text-xs text-faint">—</span>
                    }
                  </td>
                  <td className="px-5 py-3">
                    {canSeeRevenue
                      ? <a href={href} className="text-xs text-primary hover:underline font-semibold">Open →</a>
                      : <span className="text-xs text-faint">—</span>
                    }
                  </td>
                </tr>
              );
            })}
            {allRows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-sm text-muted">
                  No sessions yet. Create a Match Week or Match Day.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
