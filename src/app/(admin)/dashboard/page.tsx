"use client";
import { useEffect, useState } from "react";
import { adminApi, MatchdayRecord, PlatformStats, PoolsOverview, type Player } from "@/lib/api";
import { getAdminInfo } from "@/lib/auth";
import StatCard from "@/components/StatCard";
import Badge from "@/components/Badge";
import { Shield, Edit2, Check, X, Loader2 } from "lucide-react";

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" });
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}
function fmtCurrency(n: number) { return "$" + n.toLocaleString(); }

// Unified row type for the sessions table
type SessionRow = { kind: "daily"; data: MatchdayRecord };

export default function DashboardPage() {
  const admin         = getAdminInfo();
  const canSeeRevenue = admin?.role === "superadmin" || admin?.role === "pool_manager";

  const [stats, setStats]           = useState<PlatformStats | null>(null);
  const [pools, setPools]           = useState<({ success: boolean } & PoolsOverview) | null>(null);
  const [matchdays, setMatchdays]    = useState<MatchdayRecord[]>([]);
  const [players, setPlayers]        = useState<Player[]>([]);
  const [reserve, setReserve]        = useState<number | null>(null);
  const [reserveEdit, setReserveEdit] = useState(false);
  const [reserveInput, setReserveInput] = useState("");
  const [reserveSaving, setReserveSaving] = useState(false);
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
      adminApi.listMatchdays().catch(()  => ({ matchdays:  [] as MatchdayRecord[] })),
      canSeeRevenue
        ? adminApi.listPlayers().catch(() => ({ success: true, players: [] as Player[] }))
        : Promise.resolve({ success: true, players: [] as Player[] }),
      isSuperadmin
        ? adminApi.getReserve().catch(() => null)
        : Promise.resolve(null),
      isSuperadmin
        ? adminApi.poolsOverview().catch(() => null)
        : Promise.resolve(null),
    ]).then(([s, md, p, r, pl]) => {
      if (s) setStats({ totalUsers: s.totalUsers, usersByWallet: s.usersByWallet, revenue: s.revenue });
      setMatchdays(md.matchdays ?? []);
      setPlayers(p.players ?? []);
      if (r) setReserve(r.reserve);
      if (pl) setPools(pl);
    }).catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [canSeeRevenue]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Merge and sort all sessions newest-first
  const allRows: SessionRow[] = [
    ...matchdays.map((d):  SessionRow => ({ kind: "daily",  data: d })),
  ].sort((a, b) => {
    const dateA = (a.data as MatchdayRecord).matchDate;
    const dateB = (b.data as MatchdayRecord).matchDate;
    return new Date(dateB).getTime() - new Date(dateA).getTime();
  });

  // Active counts
  const openDays     = matchdays.filter((m)  => m.status === "open" || m.status === "locked").length;
  const liveDay      = matchdays.find((m)  => m.liveActive);
  const activePlayers = players.filter((p) => p.isActive).length;
  // Two buckets only — has a signing wallet or doesn't — so there's nothing
  // to rank. The 'none' bucket is house accounts, which is what makes this
  // worth showing: it's the bot-vs-human split.
  const walletSplit    = stats?.usersByWallet ?? [];
  const connectedCount = walletSplit.find((b) => b._id === "connected")?.count ?? 0;
  const funding        = pools?.funding ?? [];
  const short          = funding.filter((f) => f.state === "short");

  // Most relevant open session for "Today" card
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
      {liveDay && (
        <div className="bg-red-500/[0.06] border border-red-500/20 rounded-xl px-4 py-3 flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
          <span className="text-sm font-bold text-red-400">Live session active —</span>
          <span className="text-xs text-muted">
            Daily {liveDay.label}
          </span>
          <a
            href={`/match-days/${liveDay._id}`}
            className="ml-auto text-xs font-bold text-red-400 hover:underline shrink-0"
          >
            Update rankings →
          </a>
        </div>
      )}

      {/* Stat strip */}
      <div className={`grid gap-4 ${canSeeRevenue ? "grid-cols-4" : "grid-cols-3"}`}>
        <StatCard label="Total Users"    value={stats?.totalUsers ?? "—"}   sub="All accounts"            accent="primary" />
        <StatCard label="Open Sessions"  value={openDays}                     sub={`${openDays}d active`}    accent="success" />
        {canSeeRevenue && (
          <StatCard label="Active Players" value={activePlayers}             sub="In roster"                accent="info" />
        )}
        <StatCard label="Wallets"        value={stats ? connectedCount : "—"} sub="Signed in with a wallet" accent="warning" />
      </div>

      {/* Money cards. Not deposits/withdrawals — raRVen is non-custodial, so
          USDC flows in as a per-gameweek pot and out when a winner claims it
          straight from the contract. Unclaimed is the one to watch: it's an
          outstanding liability, not revenue. */}
      {canSeeRevenue && stats?.revenue && (
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-surface border border-border rounded-xl p-4">
            <p className="text-[10px] font-semibold text-muted uppercase tracking-wider">USDC Escrowed</p>
            <p className="text-xl font-black text-success mt-1">{fmtCurrency(stats.revenue.totalEscrowed)}</p>
            <p className="text-[10px] text-faint mt-1">All gameweek pots</p>
          </div>
          <div className="bg-surface border border-border rounded-xl p-4">
            <p className="text-[10px] font-semibold text-muted uppercase tracking-wider">Paid Out</p>
            <p className="text-xl font-black text-primary mt-1">{fmtCurrency(stats.revenue.totalPaidOut)}</p>
            <p className="text-[10px] text-faint mt-1">Claimed on-chain</p>
          </div>
          <div className="bg-surface border border-border rounded-xl p-4">
            <p className="text-[10px] font-semibold text-muted uppercase tracking-wider">Unclaimed</p>
            <p className={`text-xl font-black mt-1 ${stats.revenue.unclaimed > 0 ? "text-warning" : "text-faint"}`}>
              {fmtCurrency(stats.revenue.unclaimed)}
            </p>
            <p className="text-[10px] text-faint mt-1">Owed to winners</p>
          </div>
          <div className="bg-surface border border-border rounded-xl p-4">
            <p className="text-[10px] font-semibold text-muted uppercase tracking-wider">Play Balances</p>
            <p className="text-xl font-black text-text mt-1">{fmtCurrency(stats.revenue.totalWallets)}</p>
            <p className="text-[10px] text-faint mt-1">Not real money</p>
          </div>
        </div>
      )}

      {/* Pools — what each chain's prize contract actually holds.
          Built as an aggregate now rather than when chain #2 arrives, so the
          shape never changes: the table just gains a row. A chain that could
          not be read shows as degraded, never as $0 — an unreachable RPC is
          unknown, not empty, and counting it as zero would understate what we
          owe to winners. */}
      {pools && (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-text">Pools</p>
              <p className="text-xs text-muted mt-0.5">Balance held by each chain's prize contract</p>
            </div>
            <p className="text-xl font-black text-success">{fmtCurrency(pools.total)}</p>
          </div>

          {/* The one thing on this panel that wants an operator to act. Shown
              above the table rather than as a column colour, because a funding
              gap is the difference between winners getting paid this week and
              not — a tinted row is too easy to scroll past. */}
          {short.length > 0 && (
            <div className="px-5 py-3 bg-danger/10 border-b border-danger/20 flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="text-xs font-bold text-danger uppercase tracking-wider">Pool needs topping up</span>
              {short.map((f) => (
                <span key={f.network} className="text-xs text-text">
                  <span className="font-bold text-danger">{f.displayName}</span> is short{' '}
                  <span className="font-bold text-danger">{fmtCurrency(f.shortfall ?? 0)}</span>
                  <span className="text-muted"> — owes {fmtCurrency(f.pendingEscrow)}, treasury holds {f.treasuryBalance === null ? '—' : fmtCurrency(f.treasuryBalance)}</span>
                </span>
              ))}
              <span className="text-[10px] text-muted">Winners cannot be paid until this clears.</span>
            </div>
          )}

          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                {["Chain", "Pool held", "Treasury", "Contract", "Signer", "Status"].map((h) => (
                  <th key={h} className="px-5 py-3 text-left text-[10px] font-bold text-muted uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pools.chains.map((c) => {
                // Full fallback, not a partial one: a missing row would mean the
                // server skipped this chain, which we must not render as "funded".
                const fund = funding.find((f) => f.network === c.network) ?? {
                  network: c.network, displayName: c.displayName,
                  treasuryAddress: c.treasuryAddress, treasuryBalance: c.treasuryBalance,
                  pendingEscrow: 0, shortfall: null, state: "unknown" as const,
                  reason: "No funding row returned for this chain.",
                };
                return (
                <tr key={c.network} className="hover:bg-surface-2">
                  <td className="px-5 py-3">
                    <span className="text-sm font-bold text-text">{c.displayName}</span>
                    {c.primary && (
                      <span className="ml-2 text-[9px] font-bold uppercase tracking-wider text-primary bg-primary/10 border border-primary/20 rounded px-1.5 py-0.5">active</span>
                    )}
                    {c.isTestnet && (
                      <span className="ml-1.5 text-[9px] font-bold uppercase tracking-wider text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded px-1.5 py-0.5">testnet</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-sm font-bold text-success">
                    {c.totalBalance === null ? <span className="text-faint">—</span> : fmtCurrency(c.totalBalance)}
                  </td>
                  {/* Treasury, not pool: this is what escrow can still draw on.
                      Null is rendered as an em dash and never as $0 — we didn't
                      confirm the chain is empty, we failed to ask it. */}
                  <td className="px-5 py-3">
                    <span className={`text-sm font-semibold ${fund.state === "short" ? "text-danger" : "text-text"}`}>
                      {c.treasuryBalance === null ? <span className="text-faint">—</span> : fmtCurrency(c.treasuryBalance)}
                    </span>
                    {fund.state === "short" && (
                      <p className="text-[10px] font-bold text-danger mt-0.5">short {fmtCurrency(fund.shortfall ?? 0)}</p>
                    )}
                    {fund.state === "unknown" && fund.reason && (
                      <p className="text-[10px] text-faint mt-0.5 max-w-[16rem] truncate" title={fund.reason}>unknown</p>
                    )}
                  </td>
                  <td className="px-5 py-3 text-xs font-mono text-muted" title={c.address}>
                    {c.address.slice(0, 8)}…{c.address.slice(-6)}
                  </td>
                  <td className={`px-5 py-3 text-xs font-semibold ${c.signerConfigured ? "text-success" : "text-warning"}`}>
                    {c.signerConfigured ? "ready" : "no key"}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`text-xs font-semibold ${c.healthy ? "text-success" : "text-danger"}`}>
                      {c.healthy ? "● healthy" : "● degraded"}
                    </span>
                    {!c.healthy && c.error && (
                      <p className="text-[10px] text-faint mt-0.5 max-w-[22rem] truncate" title={c.error}>{c.error}</p>
                    )}
                  </td>
                </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-surface-2">
                <td className="px-5 py-3 text-[10px] font-bold text-muted uppercase tracking-wider">Total</td>
                <td className="px-5 py-3 text-sm font-black text-success">{fmtCurrency(pools.total)}</td>
                <td colSpan={4} className="px-5 py-3 text-xs text-muted">
                  {pools.chains.filter((c) => c.healthy).length} of {pools.chains.length} chain{pools.chains.length === 1 ? "" : "s"} read
                  {pools.degraded.length > 0 && (
                    <span className="text-warning"> · total is a floor, not a fact</span>
                  )}
                </td>
              </tr>
            </tfoot>
          </table>

          {/* Reconciliation — the database figure beside the chain figures.
              Once escrow lands, `distributable` should match this pool's row
              to the cent, and if it doesn't the table above is where to look. */}
          {pools.current && (
            <div className="px-5 py-3 border-t border-border flex flex-wrap items-center gap-x-6 gap-y-1">
              <p className="text-[10px] font-bold text-muted uppercase tracking-wider">Gameweek {pools.current.number}</p>
              <span className="text-xs font-semibold capitalize text-text">{pools.current.status}</span>
              <span className="text-xs text-muted">
                pot <span className="font-bold text-text">{fmtCurrency(pools.current.poolTotal)}</span>
              </span>
              <span className="text-xs text-muted">
                escrow <span className="font-bold text-success">{fmtCurrency(pools.current.distributable)}</span>
                <span className="text-faint"> (house {fmtCurrency(pools.current.houseCut)})</span>
              </span>
            </div>
          )}
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
                <span className="text-sm text-amber-400">$</span>
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
                <span className="text-sm text-amber-400">$</span>
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
            ) : (
              <p className="text-xl font-black text-amber-300 mt-0.5">{fmtCurrency(reserve)}</p>
            )}
            {topUpError && <p className="text-xs text-danger mt-1">{topUpError}</p>}
            {!reserveEdit && !topUpMode && (
              <p className="text-[10px] text-amber-400/40 mt-1">
                Internal ledger for promo credits — real money is USDC escrowed per gameweek
              </p>
            )}
          </div>
          {!reserveEdit && !topUpMode && (
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
                title="Add an amount to the current reserve (ledger only — moves no money)"
              >
                <Check size={13} />
                Top Up
              </button>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        {/* Active sessions card */}
        <div className="bg-surface border border-border rounded-2xl p-5 flex flex-col gap-4">
          <p className="text-sm font-bold text-text">Active Sessions</p>

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

        {/* Wallet adoption — 'none' is house accounts, so this doubles as
            a bot-vs-human read on the user base. */}
        <div className="bg-surface border border-border rounded-2xl p-5">
          <p className="text-sm font-bold text-text mb-4">Wallets Connected</p>
          {walletSplit.length === 0 ? (
            <p className="text-sm text-muted text-center py-4">No users yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {walletSplit.map((b) => {
                const pct = stats ? Math.round((b.count / stats.totalUsers) * 100) : 0;
                return (
                  <div key={b._id} className="flex items-center gap-3">
                    <span className="text-xs font-bold text-text w-20">
                      {b._id === "connected" ? "Connected" : "No wallet"}
                    </span>
                    <div className="flex-1 bg-surface-3 rounded-full h-1.5">
                      <div className="bg-primary h-full rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs text-muted w-12 text-right">{b.count.toLocaleString()}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Recent sessions */}
      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-text">Recent Sessions</p>
            <p className="text-xs text-muted mt-0.5">Match days</p>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-muted">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-amber-500/30 inline-block" />Daily</span>
          </div>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {["Label", "Date", "Lock", "Status", "Live", ""].map((h) => (
                <th key={h} className="px-5 py-3 text-left text-[10px] font-bold text-muted uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {allRows.slice(0, 10).map((row) => {
              const d        = row.data;
              const dateStr  = fmtDate((d as MatchdayRecord).matchDate);
              const label    = (d as MatchdayRecord).label;
              const lock     = d.lockDeadline ? fmtTime(d.lockDeadline) : "—";
              const href     = `/match-days/${d._id}`;

              return (
                <tr key={`daily-${d._id}`} className="hover:bg-surface-2 transition-colors">
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
                <td colSpan={6} className="px-5 py-8 text-center text-sm text-muted">
                  No sessions yet. Create a Match Day first.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
