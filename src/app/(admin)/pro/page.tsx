"use client";
import { useEffect, useState } from "react";
import { adminApi, type ProGameweek, type ProPoolSummary, type ProOverview } from "@/lib/api";
import { getAdminInfo } from "@/lib/auth";
import Badge from "@/components/Badge";
import Modal from "@/components/Modal";
import StatCard from "@/components/StatCard";
import { Plus, Lock, PlayCircle, RefreshCw, Loader2, Wallet, RotateCcw, Crown, Users, RotateCw } from "lucide-react";

function fmtCurrency(n: number) { return "₦" + n.toLocaleString(); }
function fmtDate(iso: string) { return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); }

const STATUS_VARIANT: Record<ProGameweek["status"], "upcoming" | "open" | "locked" | "settled"> = {
  upcoming: "upcoming", open: "open", locked: "locked", settling: "locked", settled: "settled",
};

// Only Premier League has real priced player coverage right now (see the
// roster progress bar on the Players page) — pulling fixtures for a league
// with no priced players just wastes API quota on data no squad can use.
// Check others in once their players are actually priced.
const LEAGUE_OPTIONS = [
  { id: 39,  name: "Premier League", default: true  },
  { id: 140, name: "La Liga",        default: false },
  { id: 78,  name: "Bundesliga",     default: false },
  { id: 135, name: "Serie A",        default: false },
  { id: 61,  name: "Ligue 1",        default: false },
];

export default function ProAdminPage() {
  const admin = getAdminInfo();
  const isFinance = admin?.role === "superadmin";

  const [gameweeks, setGameweeks] = useState<ProGameweek[]>([]);
  const [config, setConfig] = useState<{ budgetCap: number; pricingMultiplier: number } | null>(null);
  const [overview, setOverview] = useState<ProOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [gwNumber, setGwNumber] = useState("");
  const [opensAt, setOpensAt] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [leagueIds, setLeagueIds] = useState<number[]>(
    LEAGUE_OPTIONS.filter((l) => l.default).map((l) => l.id),
  );
  const [skipRefresh, setSkipRefresh] = useState(true);

  const [showConfig, setShowConfig] = useState(false);
  const [budgetCapDraft, setBudgetCapDraft] = useState("");
  const [multiplierDraft, setMultiplierDraft] = useState("");

  const [poolGameweek, setPoolGameweek] = useState<ProGameweek | null>(null);
  const [poolSummary, setPoolSummary] = useState<ProPoolSummary | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [gwRes, cfgRes, ovRes] = await Promise.all([
        adminApi.listProGameweeks(),
        adminApi.getProConfig(),
        adminApi.getProOverview().catch(() => ({ overview: null })),
      ]);
      setGameweeks(gwRes.gameweeks);
      setConfig(cfgRes.config);
      setOverview(ovRes.overview);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate() {
    setBusy("create");
    try {
      await adminApi.createProGameweek({
        number: Number(gwNumber), opensAt, from: fromDate, to: toDate, leagueIds,
      });
      setShowCreate(false);
      setGwNumber(""); setOpensAt(""); setFromDate(""); setToDate("");
      load();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Create failed"); }
    finally { setBusy(null); }
  }

  async function handleOpen(id: string) {
    if (!skipRefresh && !confirm(
      "This will re-fetch fresh season stats for every player across all supported leagues " +
      "(up to ~85 API requests, paced ~6.5s apart — several minutes, and can exhaust a free-tier " +
      "daily quota on its own). Continue?"
    )) return;
    setBusy(id + "-open");
    try { await adminApi.openProGameweek(id, skipRefresh); load(); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : "Open failed"); }
    finally { setBusy(null); }
  }

  async function handleForceLock(id: string) {
    setBusy(id + "-lock");
    try { await adminApi.forceLockProGameweek(id); load(); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : "Lock failed"); }
    finally { setBusy(null); }
  }

  async function handleReset(gw: ProGameweek) {
    if (!confirm(
      `Reset Gameweek #${gw.number}? This refunds every squad's spend back to users' wallets, ` +
      `deletes all squads and the fixture schedule, and returns the gameweek to "upcoming". This cannot be undone.`
    )) return;

    setBusy(gw._id + "-reset");
    try {
      const res = await adminApi.resetProGameweek(gw._id);
      setError(`Gameweek #${gw.number} reset — ${res.squadsRefunded} squad(s) refunded, ${fmtCurrency(res.refundedTotal)} returned to wallets.`);
      load();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Reset failed"); }
    finally { setBusy(null); }
  }

  async function handleRecalcPricing() {
    setBusy("recalc");
    try {
      const res = await adminApi.recalculateProPricing();
      const cov = res.metrics.teamsRemaining > 0
        ? ` · stats refresh covered this run's team batch, ${res.metrics.teamsRemaining} team(s) still pending (free API tier — click again later to continue)`
        : " · stats refresh has now covered every team";
      setError(`Pricing recalculated — ${res.pricing.priced} player(s) priced, budget cap ₦${res.budgetCap.toLocaleString()}${cov}`);
      load();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Recalculate failed"); }
    finally { setBusy(null); }
  }

  async function handleSaveConfig() {
    setBusy("config");
    try {
      await adminApi.updateProConfig({
        budgetCap: budgetCapDraft ? Number(budgetCapDraft) : undefined,
        pricingMultiplier: multiplierDraft ? Number(multiplierDraft) : undefined,
      });
      setShowConfig(false);
      load();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Save failed"); }
    finally { setBusy(null); }
  }

  async function openPoolSummary(gw: ProGameweek) {
    setPoolGameweek(gw);
    try {
      const res = await adminApi.getProPoolSummary(gw._id);
      setPoolSummary(res.summary);
    } catch { setPoolSummary(null); }
  }

  async function handleSettle() {
    if (!poolGameweek) return;
    setBusy("settle");
    try {
      await adminApi.settleProGameweek(poolGameweek._id);
      setPoolGameweek(null);
      load();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Settle failed"); }
    finally { setBusy(null); }
  }

  async function handleRedistribute() {
    if (!poolGameweek) return;
    setBusy("redistribute");
    try {
      const res = await adminApi.redistributeProPrizes(poolGameweek._id);
      setError(`Redistribution complete — ${res.redistributed} squad(s) processed`);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Redistribute failed"); }
    finally { setBusy(null); }
  }

  const openGw = gameweeks.find((g) => g.status === "open");

  return (
    <div className="p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-text">Fantasy Market</h1>
          <p className="text-sm text-muted mt-0.5">Fantasy squads · position-weighted pricing · weekly prize pool</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-[11px] text-muted cursor-pointer select-none" title="When opening a gameweek, skip re-fetching fresh stats for every player (saves API quota, uses whatever pricing already exists)">
            <input type="checkbox" checked={skipRefresh} onChange={(e) => setSkipRefresh(e.target.checked)} className="accent-primary" />
            Skip metrics refresh on open
          </label>
          <button
            onClick={() => setShowConfig(true)}
            className="px-3 py-2 rounded-xl bg-surface-3 border border-border text-xs font-semibold text-muted hover:text-text transition-colors"
          >
            Config
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="px-3 py-2 rounded-xl bg-surface-3 border border-border text-xs font-semibold text-muted hover:text-text hover:border-primary/30 transition-colors flex items-center gap-1.5"
          >
            <Plus size={13} /> New Gameweek
          </button>
        </div>
      </div>

      {error && <p className="text-xs text-danger bg-danger/10 border border-danger/20 rounded-xl px-4 py-3">{error}</p>}

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Reference Budget" value={config ? fmtCurrency(config.budgetCap) : "—"} accent="primary" />
        <StatCard label="Pricing Multiplier" value={config ? `×${config.pricingMultiplier}` : "—"} accent="info" />
        <StatCard label="Open Gameweek" value={openGw ? `#${openGw.number}` : "None"} accent="success" />
      </div>

      {overview && (
        <div className="bg-surface border border-border rounded-2xl px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-bold text-text">
              Gameweek #{overview.gameweek.number} Snapshot
            </p>
            <Badge label={overview.gameweek.status} variant={STATUS_VARIANT[overview.gameweek.status]} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="flex items-start gap-2.5">
              <Crown size={16} className="text-warning mt-0.5" />
              <div>
                <p className="text-xs text-muted">Currently Leading</p>
                <p className="text-sm font-bold text-text mt-0.5">
                  {overview.leader ? overview.leader.name : "—"}
                </p>
                <p className="text-[11px] text-faint">
                  {overview.leader
                    ? `${overview.leader.score.toFixed(1)} pts${overview.leaderSource === "live" ? " · live" : ""}`
                    : overview.gameweek.status === "settled" ? "No scored squads" : "Not scored yet"}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Wallet size={16} className="text-primary mt-0.5" />
              <div>
                <p className="text-xs text-muted">Total Spent</p>
                <p className="text-sm font-bold text-text mt-0.5">{fmtCurrency(overview.totalSpent)}</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Users size={16} className="text-info mt-0.5" />
              <div>
                <p className="text-xs text-muted">Users Involved</p>
                <p className="text-sm font-bold text-text mt-0.5">{overview.squadCount}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-surface border border-border rounded-xl px-5 py-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-text">Recalculate Pricing</p>
          <p className="text-xs text-muted mt-0.5">Pulls fresh season stats and re-derives every active player&apos;s price + budget cap</p>
        </div>
        <button
          onClick={handleRecalcPricing}
          disabled={busy === "recalc"}
          className="px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-dim disabled:opacity-50 transition-colors flex items-center gap-2"
        >
          {busy === "recalc" ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Recalculate
        </button>
      </div>

      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <p className="text-sm font-bold text-text">Gameweeks</p>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {["Gameweek", "Opens", "First Kickoff", "Status", "Pool", "Actions"].map((h) => (
                <th key={h} className="px-5 py-3 text-left text-[10px] font-bold text-muted uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading && <tr><td colSpan={6} className="px-5 py-6 text-center text-sm text-muted">Loading…</td></tr>}
            {!loading && gameweeks.length === 0 && <tr><td colSpan={6} className="px-5 py-6 text-center text-sm text-muted">No gameweeks yet.</td></tr>}
            {gameweeks.map((gw) => (
              <tr key={gw._id} className="hover:bg-surface-2 transition-colors">
                <td className="px-5 py-4 text-sm font-bold">
                  <a href={`/pro/${gw._id}`} className="text-text hover:text-primary transition-colors">#{gw.number}</a>
                </td>
                <td className="px-5 py-4 text-sm text-muted">{fmtDate(gw.opensAt)}</td>
                <td className="px-5 py-4 text-sm text-muted">{gw.firstKickoffAt ? fmtDate(gw.firstKickoffAt) : "—"}</td>
                <td className="px-5 py-4"><Badge label={gw.status} variant={STATUS_VARIANT[gw.status]} /></td>
                <td className="px-5 py-4 text-sm text-text">{gw.status === "settled" ? fmtCurrency(gw.poolTotal) : "—"}</td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-2">
                    {gw.status === "upcoming" && (
                      <button
                        onClick={() => handleOpen(gw._id)}
                        disabled={busy === gw._id + "-open"}
                        className="text-xs font-bold text-success bg-success/10 border border-success/20 px-3 py-1.5 rounded-lg hover:bg-success/20 disabled:opacity-50 transition-colors flex items-center gap-1"
                      >
                        <PlayCircle size={12} /> Open
                      </button>
                    )}
                    {gw.status === "open" && (
                      <button
                        onClick={() => handleForceLock(gw._id)}
                        disabled={busy === gw._id + "-lock"}
                        className="text-xs font-bold text-warning bg-warning/10 border border-warning/20 px-3 py-1.5 rounded-lg hover:bg-warning/20 disabled:opacity-50 transition-colors flex items-center gap-1"
                      >
                        <Lock size={12} /> Force Lock
                      </button>
                    )}
                    {(gw.status === "locked" || gw.status === "settled") && isFinance && (
                      <button
                        onClick={() => openPoolSummary(gw)}
                        className="text-xs font-bold text-info bg-info/10 border border-info/20 px-3 py-1.5 rounded-lg hover:bg-info/20 transition-colors flex items-center gap-1"
                      >
                        <Wallet size={12} /> Pool
                      </button>
                    )}
                    {gw.status !== "settled" && isFinance && (
                      <button
                        onClick={() => handleReset(gw)}
                        disabled={busy === gw._id + "-reset"}
                        title="Refunds all squads and clears this gameweek's fixtures"
                        className="text-xs font-bold text-danger bg-danger/10 border border-danger/20 px-3 py-1.5 rounded-lg hover:bg-danger/20 disabled:opacity-50 transition-colors flex items-center gap-1"
                      >
                        {busy === gw._id + "-reset" ? <Loader2 size={12} className="animate-spin" /> : <RotateCw size={12} />}
                        Reset
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create Gameweek */}
      {showCreate && (
        <Modal title="New Gameweek" onClose={() => setShowCreate(false)}>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted uppercase tracking-wider">Gameweek Number</label>
              <input type="number" value={gwNumber} onChange={(e) => setGwNumber(e.target.value)} placeholder="e.g. 1"
                className="bg-surface-2 border border-border rounded-xl px-4 py-3 text-sm text-text outline-none focus:border-primary/50" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted uppercase tracking-wider">Opens At</label>
              <input type="datetime-local" value={opensAt} onChange={(e) => setOpensAt(e.target.value)}
                className="bg-surface-2 border border-border rounded-xl px-4 py-3 text-sm text-text outline-none [color-scheme:dark]" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-muted uppercase tracking-wider">Fixtures From</label>
                <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
                  className="bg-surface-2 border border-border rounded-xl px-4 py-3 text-sm text-text outline-none [color-scheme:dark]" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-muted uppercase tracking-wider">Fixtures To</label>
                <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
                  className="bg-surface-2 border border-border rounded-xl px-4 py-3 text-sm text-text outline-none [color-scheme:dark]" />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted uppercase tracking-wider">Leagues</label>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {LEAGUE_OPTIONS.map((l) => (
                  <label key={l.id} className="flex items-center gap-1.5 text-xs text-muted cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={leagueIds.includes(l.id)}
                      onChange={(e) => setLeagueIds((prev) => e.target.checked ? [...prev, l.id] : prev.filter((id) => id !== l.id))}
                      className="accent-primary"
                    />
                    {l.name}
                  </label>
                ))}
              </div>
            </div>
            <p className="text-[10px] text-faint">Only pull leagues whose players are actually priced (check the roster progress bar on the Players page) — fixtures from an unpriced league just waste API quota. Premier League only until more leagues are priced.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowCreate(false)} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted hover:text-text transition-colors">Cancel</button>
              <button
                onClick={handleCreate}
                disabled={!gwNumber || !opensAt || !fromDate || !toDate || leagueIds.length === 0 || busy === "create"}
                className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-bold disabled:opacity-50 hover:bg-primary-dim transition-colors flex items-center justify-center gap-2"
              >
                {busy === "create" ? <Loader2 size={14} className="animate-spin" /> : "Create"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Config */}
      {showConfig && (
        <Modal title="Fantasy Config" onClose={() => setShowConfig(false)}>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted uppercase tracking-wider">Reference Budget (₦) — not enforced</label>
              <input type="number" defaultValue={config?.budgetCap} onChange={(e) => setBudgetCapDraft(e.target.value)} placeholder={String(config?.budgetCap ?? "")}
                className="bg-surface-2 border border-border rounded-xl px-4 py-3 text-sm text-text outline-none focus:border-primary/50" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted uppercase tracking-wider">Pricing Multiplier</label>
              <input type="number" defaultValue={config?.pricingMultiplier} onChange={(e) => setMultiplierDraft(e.target.value)} placeholder={String(config?.pricingMultiplier ?? "")}
                className="bg-surface-2 border border-border rounded-xl px-4 py-3 text-sm text-text outline-none focus:border-primary/50" />
            </div>
            <p className="text-[10px] text-faint">Price (₦) = Player Score (0-10) × multiplier. Squad purchases are real money — a user&apos;s wallet balance is the only real spending limit. The reference budget below is just a display figure (e.g. for house-account seeding), no longer enforced on real purchases.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowConfig(false)} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted hover:text-text transition-colors">Cancel</button>
              <button
                onClick={handleSaveConfig}
                disabled={busy === "config"}
                className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-bold disabled:opacity-50 hover:bg-primary-dim transition-colors flex items-center justify-center gap-2"
              >
                {busy === "config" ? <Loader2 size={14} className="animate-spin" /> : "Save"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Finance: Pool summary / settle / redistribute */}
      {poolGameweek && (
        <Modal title={`Gameweek #${poolGameweek.number} Pool`} onClose={() => setPoolGameweek(null)}>
          <div className="flex flex-col gap-4">
            {poolSummary ? (
              <div className="bg-surface-2 border border-border rounded-xl p-4 grid grid-cols-2 gap-4 text-sm">
                <div><p className="text-muted text-xs">Squads</p><p className="text-text font-semibold">{poolSummary.squadCount}</p></div>
                <div><p className="text-muted text-xs">Pool Total</p><p className="text-text font-semibold">{fmtCurrency(poolSummary.poolTotal)}</p></div>
                <div><p className="text-muted text-xs">House Cut (10%)</p><p className="text-text font-semibold">{fmtCurrency(poolSummary.houseCut)}</p></div>
                <div><p className="text-muted text-xs">Status</p><p className="text-text font-semibold capitalize">{poolSummary.status}</p></div>
              </div>
            ) : (
              <p className="text-sm text-muted">Loading pool summary…</p>
            )}
            <div className="flex gap-3">
              {poolGameweek.status === "locked" && (
                <button
                  onClick={handleSettle}
                  disabled={busy === "settle"}
                  className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-bold disabled:opacity-50 hover:bg-primary-dim transition-colors flex items-center justify-center gap-2"
                >
                  {busy === "settle" ? <Loader2 size={14} className="animate-spin" /> : "Settle Gameweek"}
                </button>
              )}
              {poolGameweek.status === "settled" && (
                <button
                  onClick={handleRedistribute}
                  disabled={busy === "redistribute"}
                  className="flex-1 py-2.5 rounded-xl bg-surface-3 border border-border text-sm font-bold text-text disabled:opacity-50 hover:border-primary/30 transition-colors flex items-center justify-center gap-2"
                >
                  {busy === "redistribute" ? <Loader2 size={14} className="animate-spin" /> : <><RotateCcw size={14} /> Redistribute Prizes</>}
                </button>
              )}
            </div>
            <p className="text-[10px] text-faint">Settlement ingests match ratings, scores every squad, splits 50/30/20 of the 90% distributable pool, and updates season standings. Redistribute is a safe retry if a payout partially failed.</p>
          </div>
        </Modal>
      )}
    </div>
  );
}
