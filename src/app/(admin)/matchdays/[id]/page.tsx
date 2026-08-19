"use client";
import { useEffect, useState, use } from "react";
import { adminApi, ClassicPool, type Player } from "@/lib/api";
import Badge from "@/components/Badge";
import Modal from "@/components/Modal";
import StatCard from "@/components/StatCard";
import {
  ArrowLeft,
  Plus,
  Check,
  Loader2,
  Search,
  Radio,
  StopCircle,
  Shield,
} from "lucide-react";
import { getAdminInfo } from "@/lib/auth";

const LIVE_CATS = ["ATT","MID","DEF","GK"] as const;
const CAT_LABELS: Record<string, string> = {
  ATT: "Attackers", MID: "Midfielders", DEF: "Defenders", GK: "Goalkeepers",
};

const POOL_CATEGORIES = ["GK","DEF","MID","ATT"] as const;
const POOL_CATEGORY_LABELS: Record<string, string> = {
  GK: "Goalkeepers", DEF: "Defenders", MID: "Midfielders", ATT: "Attackers",
};

function fmtCurrency(n: number) { return "₦" + n.toLocaleString(); }

export default function MatchdayDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: matchdayId } = use(params);
  const admin = getAdminInfo();
  const canSeed = admin?.role === "superadmin" || admin?.role === "pool_manager";

  const [matchday, setMatchday]   = useState<import("@/lib/api").Matchday | null>(null);
  const [pools, setPools]         = useState<ClassicPool[]>([]);
  const [players, setPlayers]     = useState<Player[]>([]);
  const [loading, setLoading]     = useState(true);

  // Classic settle modal
  const [settlePool, setSettlePool]         = useState<ClassicPool | null>(null);
  const [winnerPlayerId, setWinnerPlayerId] = useState("");
  const [settling, setSettling]             = useState(false);

  // Create pool modal
  const [showAddPool, setShowAddPool] = useState(false);
  const [addPos, setAddPos]           = useState("ATT");

  // Pool position filter (classic pools table)
  const [poolPosFilter, setPoolPosFilter] = useState("ALL");
  const [poolSearch, setPoolSearch]       = useState("");

  // Seed pool modal
  const [seedPool, setSeedPool]     = useState<ClassicPool | null>(null);
  const [seedAmount, setSeedAmount] = useState("");
  const [seedPlayerId, setSeedPlayerId] = useState("");
  const [seeding, setSeeding]       = useState(false);

  const [error, setError] = useState("");

  // Live session
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveRankDraft, setLiveRankDraft] = useState<
    Record<string, { playerName: string; club: string; rating: string }>
  >({ ATT: { playerName: "", club: "", rating: "" }, MID: { playerName: "", club: "", rating: "" },
      DEF: { playerName: "", club: "", rating: "" }, GK:  { playerName: "", club: "", rating: "" } });

  useEffect(() => { load(); }, [matchdayId]);

  async function load() {
    setLoading(true);
    try {
      const [md, p] = await Promise.all([
        adminApi.listMatchweeks(),
        adminApi.listPlayers(),
      ]);
      const day = md.matchweeks.find((m) => m._id === matchdayId);
      if (day) setMatchday(day);
      setPlayers(p.players);

      const classicRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000"}/api/classic/matchweeks/${matchdayId}/pools`).then((r) => r.json()).catch(() => ({ pools: [] }));
      setPools(classicRes.pools ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally { setLoading(false); }
  }

  async function handleAddPool() {
    try {
      await adminApi.createPool({ poolType: 'weekly', matchweek: matchdayId, position: addPos });
      setShowAddPool(false);
      load();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed"); }
  }

  async function handleSettlePool() {
    if (!settlePool || !winnerPlayerId) return;
    setSettling(true);
    try {
      await adminApi.settlePool(settlePool._id, winnerPlayerId);
      setSettlePool(null);
      setWinnerPlayerId("");
      load();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setSettling(false); }
  }

  async function handleStartLive() {
    setLiveLoading(true);
    try {
      const res = await adminApi.startMatchweekLive(matchdayId);
      setMatchday(res.matchweek);
      load();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setLiveLoading(false); }
  }

  async function handleStopLive() {
    setLiveLoading(true);
    try {
      const res = await adminApi.stopMatchweekLive(matchdayId);
      setMatchday(res.matchweek);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setLiveLoading(false); }
  }

  async function handleSeedPool() {
    if (!seedPool || !seedPlayerId) return;
    const amount = Number(seedAmount);
    if (!amount || amount <= 0) return;
    setSeeding(true);
    try {
      await adminApi.seedPool(seedPool._id, amount, seedPlayerId);
      setSeedPool(null);
      setSeedAmount("");
      setSeedPlayerId("");
      load();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Seed failed"); }
    finally { setSeeding(false); }
  }

  async function handleSaveLiveRankings() {
    setLiveLoading(true);
    try {
      const rankings: Record<string, { playerName: string; club: string; rating: number }> = {};
      for (const cat of LIVE_CATS) {
        const d = liveRankDraft[cat];
        if (d.playerName.trim() && d.rating) {
          rankings[cat] = { playerName: d.playerName.trim(), club: d.club.trim(), rating: parseFloat(d.rating) };
        }
      }
      const res = await adminApi.updateMatchweekLiveRankings(matchdayId, rankings);
      setMatchday(res.matchweek);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed"); }
    finally { setLiveLoading(false); }
  }

  const poolsSettled    = pools.filter((p) => p.status === "settled").length;
  const totalPot        = pools.reduce((s, p) => s + p.totalPot, 0);
  const totalEntries    = pools.reduce((s, p) => s + p.participantCount, 0);

  // Filtered pools for the classic table
  const filteredPools = pools.filter((p) => {
    const matchPos = poolPosFilter === "ALL" || p.position === poolPosFilter;
    const matchSearch = poolSearch === "" ||
      p.position.toLowerCase().includes(poolSearch.toLowerCase()) ||
      (p.leadingPlayer?.name ?? "").toLowerCase().includes(poolSearch.toLowerCase());
    return matchPos && matchSearch;
  });

  return (
    <div className="p-8 flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <a href="/matchdays" className="text-sm text-muted hover:text-text transition-colors flex items-center gap-1">
            <ArrowLeft size={14} />
            Match Weeks
          </a>
          <span className="text-faint">/</span>
          <div>
            <h1 className="text-xl font-black text-text">
              Day #{matchday?.weekNumber ?? "…"}
            </h1>
            {matchday && <p className="text-xs text-muted mt-0.5">{new Date(matchday.startsAt).toLocaleDateString("en-NG", { weekday: "long", day: "numeric", month: "long" })}</p>}
          </div>
        </div>
        {matchday && <Badge label={matchday.status} variant={matchday.status as "open"|"locked"|"settled"|"upcoming"} />}
      </div>

      {error && <p className="text-xs text-danger bg-danger/10 border border-danger/20 rounded-xl px-4 py-3">{error}</p>}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total Pot"       value={fmtCurrency(totalPot)}                          accent="primary"  />
        <StatCard label="Classic Entries" value={totalEntries}                                    accent="success"  />
        <StatCard label="Pools Settled"   value={`${poolsSettled}/${pools.length}`}               accent="warning"  />
      </div>

      {/* ── Live session panel ──────────────────────────────────────────────── */}
      <div className={`rounded-2xl border p-5 flex flex-col gap-4 ${
        matchday?.liveActive
          ? "bg-red-500/5 border-red-500/20"
          : "bg-surface border-border"
      }`}>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              {matchday?.liveActive && (
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              )}
              <p className="text-sm font-bold text-text">
                {matchday?.liveActive ? "LIVE NOW" : "Live Session"}
              </p>
            </div>
            <p className="text-xs text-muted mt-0.5">
              {matchday?.liveActive
                ? `Started ${matchday.liveStartedAt ? new Date(matchday.liveStartedAt).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" }) : ""} · Pools locked`
                : "Start live to lock all weekly pools and begin ratings entry"}
            </p>
          </div>
          {matchday?.liveActive ? (
            <button
              onClick={handleStopLive}
              disabled={liveLoading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface-3 border border-border text-xs font-semibold text-muted hover:text-danger hover:border-danger/30 transition-colors"
            >
              <StopCircle size={13} />
              End Live
            </button>
          ) : (
            <button
              onClick={handleStartLive}
              disabled={liveLoading || matchday?.status !== "open"}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-sm font-bold text-red-400 hover:bg-red-500/15 disabled:opacity-40 transition-colors"
            >
              <Radio size={14} />
              {liveLoading ? "Starting…" : "Start Live"}
            </button>
          )}
        </div>

        {/* Live rankings editor — visible only when live is active */}
        {matchday?.liveActive && (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-muted uppercase tracking-wider font-semibold">Current Leaders (enter Sofascore ratings)</p>
            <div className="grid grid-cols-1 gap-2.5">
              {LIVE_CATS.map((cat) => (
                <div key={cat} className="flex items-center gap-2">
                  <span className="text-[11px] font-black text-muted w-8 shrink-0">{cat}</span>
                  <input
                    placeholder="Player name"
                    value={liveRankDraft[cat].playerName}
                    onChange={(e) => setLiveRankDraft((d) => ({ ...d, [cat]: { ...d[cat], playerName: e.target.value } }))}
                    className="flex-1 bg-surface-2 border border-border rounded-lg px-3 py-2 text-xs text-text outline-none focus:border-primary/50 placeholder:text-faint"
                  />
                  <input
                    placeholder="Club"
                    value={liveRankDraft[cat].club}
                    onChange={(e) => setLiveRankDraft((d) => ({ ...d, [cat]: { ...d[cat], club: e.target.value } }))}
                    className="w-28 bg-surface-2 border border-border rounded-lg px-3 py-2 text-xs text-text outline-none focus:border-primary/50 placeholder:text-faint"
                  />
                  <input
                    placeholder="Rating"
                    type="number"
                    step="0.1"
                    min="0"
                    max="10"
                    value={liveRankDraft[cat].rating}
                    onChange={(e) => setLiveRankDraft((d) => ({ ...d, [cat]: { ...d[cat], rating: e.target.value } }))}
                    className="w-20 bg-surface-2 border border-border rounded-lg px-3 py-2 text-xs text-text outline-none focus:border-primary/50 placeholder:text-faint"
                  />
                </div>
              ))}
            </div>
            <button
              onClick={handleSaveLiveRankings}
              disabled={liveLoading}
              className="self-end flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-dim disabled:opacity-50 transition-colors"
            >
              <Check size={13} />
              {liveLoading ? "Saving…" : "Update Rankings"}
            </button>

            {/* Current saved rankings */}
            {matchday.liveRankings && (
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border">
                {LIVE_CATS.map((cat) => {
                  const r = matchday.liveRankings[cat];
                  return r ? (
                    <div key={cat} className="flex items-center gap-2 bg-surface-2 rounded-lg px-3 py-2">
                      <span className="text-[10px] font-black text-primary w-6">{cat}</span>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-text truncate">{r.playerName}</p>
                        <p className="text-[10px] text-muted">{r.club} · <span className="text-success font-bold">{r.rating}</span></p>
                      </div>
                    </div>
                  ) : (
                    <div key={cat} className="flex items-center gap-2 bg-surface-2 rounded-lg px-3 py-2">
                      <span className="text-[10px] font-black text-faint w-6">{cat}</span>
                      <p className="text-[10px] text-faint italic">Not set</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Classic Pools ─────────────────────────────────────────────────── */}
      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-text">Weekly Classic Pools</p>
            <p className="text-xs text-muted mt-0.5">Pari-mutuel · best of the week · 12% house cut</p>
          </div>
          {matchday?.status !== "open" ? (
            <span className="text-xs text-warning bg-warning/10 border border-warning/20 px-3 py-1.5 rounded-xl">
              Open match week to add pools
            </span>
          ) : (
            <button
              onClick={() => setShowAddPool(true)}
              className="px-3 py-2 rounded-xl bg-surface-3 border border-border text-xs font-semibold text-muted hover:text-text hover:border-primary/30 transition-colors flex items-center gap-1.5"
            >
              <Plus size={13} />
              Add Pool
            </button>
          )}
        </div>

        {/* Position search bar */}
        <div className="px-5 py-3 border-b border-border flex items-center gap-3 flex-wrap">
          <div className="relative flex items-center">
            <Search size={13} className="absolute left-3 text-faint pointer-events-none" />
            <input
              value={poolSearch}
              onChange={(e) => setPoolSearch(e.target.value)}
              placeholder="Search position or player…"
              className="bg-surface-2 border border-border rounded-xl pl-8 pr-4 py-2 text-xs text-text outline-none focus:border-primary/50 placeholder:text-faint w-52"
            />
          </div>
          <div className="flex gap-1 flex-wrap">
            <button
              onClick={() => setPoolPosFilter("ALL")}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${poolPosFilter === "ALL" ? "bg-primary/10 border-primary/30 text-primary" : "bg-surface border-border text-muted hover:text-text"}`}
            >
              All
            </button>
            {POOL_CATEGORIES.map((pos) => {
              const hasPool = pools.some((p) => p.position === pos);
              return (
                <button
                  key={pos}
                  onClick={() => setPoolPosFilter(pos === poolPosFilter ? "ALL" : pos)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors relative ${
                    poolPosFilter === pos
                      ? "bg-primary/10 border-primary/30 text-primary"
                      : hasPool
                      ? "bg-surface border-border text-muted hover:text-text"
                      : "bg-surface border-border text-faint opacity-40 cursor-default"
                  }`}
                  disabled={!hasPool && poolPosFilter !== pos}
                >
                  {pos}
                </button>
              );
            })}
          </div>
          {(poolPosFilter !== "ALL" || poolSearch) && (
            <span className="text-[11px] text-muted ml-auto">
              {filteredPools.length} pool{filteredPools.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {["Position", "Pot", "Entries", "Leading Player", "Status", "Action"].map((h) => (
                <th key={h} className="px-5 py-3 text-left text-[10px] font-bold text-muted uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading && <tr><td colSpan={6} className="px-5 py-6 text-center text-sm text-muted">Loading…</td></tr>}
            {!loading && filteredPools.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-6 text-center text-sm text-muted">
                {pools.length === 0 ? "No pools yet. Add one above." : "No pools match the current filter."}
              </td></tr>
            )}
            {filteredPools.map((pool) => (
              <tr key={pool._id} className="hover:bg-surface-2 transition-colors">
                <td className="px-5 py-4">
                  <span className="text-xs font-bold text-primary bg-primary/10 border border-primary/20 px-2 py-1 rounded">{pool.position}</span>
                </td>
                <td className="px-5 py-4 text-sm font-semibold text-text">{fmtCurrency(pool.totalPot)}</td>
                <td className="px-5 py-4 text-sm text-muted">{pool.participantCount}</td>
                <td className="px-5 py-4 text-sm text-muted">
                  {pool.leadingPlayer ? (
                    <span className="text-text font-medium">{pool.leadingPlayer.name}</span>
                  ) : "—"}
                  {pool.winnerPlayer && (
                    <span className="ml-2 text-success text-[10px] inline-flex items-center gap-1">
                      <Check size={11} strokeWidth={2.5} />
                      {pool.winnerPlayer.name}
                    </span>
                  )}
                  {pool.houseEntry?.player && (
                    <div className="mt-1 flex items-center gap-1 text-[10px] text-amber-400">
                      <Shield size={9} />
                      <span>House: {typeof pool.houseEntry.player === "object" ? pool.houseEntry.player.name : "—"} · ₦{pool.houseEntry.stake.toLocaleString()}</span>
                    </div>
                  )}
                </td>
                <td className="px-5 py-4"><Badge label={pool.status} variant={pool.status} /></td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-2">
                    {pool.status === "locked" && (
                      <button
                        onClick={() => { setSettlePool(pool); setWinnerPlayerId(""); }}
                        className="text-xs font-bold text-warning bg-warning/10 border border-warning/20 px-3 py-1.5 rounded-lg hover:bg-warning/20 transition-colors"
                      >
                        Settle
                      </button>
                    )}
                    {pool.status === "settled" && (
                      <span className="text-xs text-success flex items-center gap-1">
                        <Check size={12} strokeWidth={2.5} /> Done
                      </span>
                    )}
                    {pool.status === "open" && canSeed && !pool.houseEntry?.player && (
                      <button
                        onClick={() => { setSeedPool(pool); setSeedAmount(""); setSeedPlayerId(""); }}
                        className="text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-lg hover:bg-amber-500/20 transition-colors flex items-center gap-1"
                      >
                        <Shield size={11} />
                        Seed
                      </button>
                    )}
                    {pool.status === "open" && pool.houseEntry?.player && (
                      <span className="text-[10px] text-amber-400/60 flex items-center gap-1">
                        <Shield size={10} /> Seeded
                      </span>
                    )}
                    {pool.status === "open" && !canSeed && !pool.houseEntry?.player && <span className="text-xs text-muted">Open</span>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Modals ────────────────────────────────────────────────────────── */}

      {/* Settle Classic Pool */}
      {settlePool && (
        <Modal title={`Settle ${settlePool.position} Pool`} onClose={() => setSettlePool(null)}>
          <div className="flex flex-col gap-4">
            <div className="bg-surface-2 border border-border rounded-xl p-3 text-sm">
              <p className="text-muted text-xs">Total pot: <span className="text-text font-semibold">{fmtCurrency(settlePool.totalPot)}</span></p>
              <p className="text-muted text-xs mt-0.5">Entries: <span className="text-text font-semibold">{settlePool.participantCount}</span></p>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted uppercase tracking-wider">Winner — Highest-rated {settlePool.position}</label>
              <select
                value={winnerPlayerId}
                onChange={(e) => setWinnerPlayerId(e.target.value)}
                className="bg-surface-2 border border-border rounded-xl px-4 py-3 text-sm text-text outline-none [color-scheme:dark]"
              >
                <option value="">Select winner…</option>
                {players.filter((p) => p.position === settlePool.position && p.isActive).map((p) => (
                  <option key={p._id} value={p._id}>{p.name} · {p.club}</option>
                ))}
              </select>
            </div>
            <p className="text-[10px] text-faint">
              All users who staked on this player will receive their share of the pot (minus 12% house cut).
            </p>
            <div className="flex gap-3">
              <button onClick={() => setSettlePool(null)} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted hover:text-text transition-colors">Cancel</button>
              <button
                onClick={handleSettlePool}
                disabled={!winnerPlayerId || settling}
                className="flex-1 py-2.5 rounded-xl bg-warning text-black text-sm font-bold disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {settling ? <><Loader2 size={14} className="animate-spin" />Settling…</> : "Confirm Settlement"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Add Pool */}
      {showAddPool && (
        <Modal title="Add Classic Pool" onClose={() => setShowAddPool(false)}>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted uppercase tracking-wider">Position</label>
              <select
                value={addPos}
                onChange={(e) => setAddPos(e.target.value)}
                className="bg-surface-2 border border-border rounded-xl px-4 py-3 text-sm text-text outline-none [color-scheme:dark]"
              >
                {POOL_CATEGORIES.map((p) => (
                  <option key={p} value={p}>{POOL_CATEGORY_LABELS[p]}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowAddPool(false)} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted hover:text-text transition-colors">Cancel</button>
              <button onClick={handleAddPool} className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-dim transition-colors">Add Pool</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Seed Pool */}
      {seedPool && (() => {
        const catMap: Record<string, string[]> = {
          GK: ["GK"], DEF: ["LB","CB","RB","DM"], MID: ["DM","LM","AM","CAM","RM"], ATT: ["LW","RW","ST"],
        };
        const eligibleSeedPlayers = players.filter((p) =>
          p.isActive && (catMap[seedPool.position] ?? []).includes(p.position)
        );
        return (
          <Modal title={`Seed ${seedPool.position} Pool`} onClose={() => setSeedPool(null)}>
            <div className="flex flex-col gap-4">
              <div className="bg-amber-500/[0.04] border border-amber-500/20 rounded-xl p-3 flex items-start gap-2.5">
                <Shield size={15} className="text-amber-400 mt-0.5 shrink-0" />
                <div className="text-xs">
                  <p className="text-amber-300 font-semibold">House seed from Reserve</p>
                  <p className="text-amber-400/60 mt-0.5">Pick the player you want the house to back. The stake comes from the reserve and boosts the pot. House entries never receive payouts — real winners always get the full pot including the house stake.</p>
                </div>
              </div>
              <div className="bg-surface-2 border border-border rounded-xl p-3 text-xs flex gap-4">
                <div><p className="text-muted">Current pot</p><p className="text-text font-semibold">{fmtCurrency(seedPool.totalPot)}</p></div>
                <div><p className="text-muted">Entries</p><p className="text-text font-semibold">{seedPool.participantCount}</p></div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-muted uppercase tracking-wider">Player to back</label>
                <select
                  value={seedPlayerId}
                  onChange={(e) => setSeedPlayerId(e.target.value)}
                  className="bg-surface-2 border border-border rounded-xl px-4 py-3 text-sm text-text outline-none [color-scheme:dark]"
                >
                  <option value="">Select player…</option>
                  {eligibleSeedPlayers.map((p) => (
                    <option key={p._id} value={p._id}>{p.name} — {p.position} · {p.club}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-muted uppercase tracking-wider">Stake from reserve (₦)</label>
                <input
                  type="number"
                  min="100"
                  value={seedAmount}
                  onChange={(e) => setSeedAmount(e.target.value)}
                  placeholder="e.g. 5000"
                  className="bg-surface-2 border border-border rounded-xl px-4 py-3 text-sm text-text outline-none focus:border-amber-500/50"
                />
              </div>

              {seedAmount && Number(seedAmount) > 0 && seedPlayerId && (
                <p className="text-xs text-amber-400/70">
                  New pot after seed: <span className="text-amber-300 font-bold">{fmtCurrency(seedPool.totalPot + Number(seedAmount))}</span>
                </p>
              )}
              <div className="flex gap-3">
                <button onClick={() => setSeedPool(null)} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted hover:text-text transition-colors">Cancel</button>
                <button
                  onClick={handleSeedPool}
                  disabled={!seedAmount || Number(seedAmount) < 100 || !seedPlayerId || seeding}
                  className="flex-1 py-2.5 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-300 text-sm font-bold disabled:opacity-50 hover:bg-amber-500/30 transition-colors flex items-center justify-center gap-2"
                >
                  {seeding ? <><Loader2 size={14} className="animate-spin" />Seeding…</> : <><Shield size={13} />Confirm Seed</>}
                </button>
              </div>
            </div>
          </Modal>
        );
      })()}

    </div>
  );
}
