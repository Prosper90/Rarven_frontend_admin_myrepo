"use client";
import { Fragment, useEffect, useState, useCallback } from "react";
import { adminApi, type Competition, type CompetitionAward } from "@/lib/api";
import Badge from "@/components/Badge";
import Modal from "@/components/Modal";
import StatCard from "@/components/StatCard";
import { Plus, Gift, Trophy, Loader2, ChevronDown, ChevronUp, Play, Square } from "lucide-react";

function fmtCurrency(n: number) { return "₦" + n.toLocaleString(); }
function fmtDate(iso: string) { return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" }); }

const STATUS_VARIANT: Record<Competition["status"], "neutral" | "open" | "settled"> = {
  draft: "neutral", active: "open", ended: "settled",
};

const MARKET_LABEL: Record<Competition["market"], string> = {
  pro: "Pro Fantasy", classic: "Classic", both: "Pro + Classic",
};

export default function CompetitionsPage() {
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [market, setMarket] = useState<Competition["market"]>("pro");
  const [prizeAmount, setPrizeAmount] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");

  const [rewardTarget, setRewardTarget] = useState<Competition | null>(null);
  const [identifier, setIdentifier] = useState("");
  const [rewardAmount, setRewardAmount] = useState("");
  const [note, setNote] = useState("");

  const [expanded, setExpanded] = useState<string | null>(null);
  const [awardsByCompetition, setAwardsByCompetition] = useState<Record<string, CompetitionAward[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.listCompetitions();
      setCompetitions(res.competitions);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreate() {
    if (!title.trim() || !prizeAmount) return;
    setBusy("create");
    try {
      await adminApi.createCompetition({
        title: title.trim(),
        description: description.trim() || undefined,
        market,
        prizeAmount: Number(prizeAmount),
        startsAt: startsAt || undefined,
        endsAt: endsAt || undefined,
      });
      setShowCreate(false);
      setTitle(""); setDescription(""); setMarket("pro"); setPrizeAmount(""); setStartsAt(""); setEndsAt("");
      load();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Create failed"); }
    finally { setBusy(null); }
  }

  async function handleStatusChange(competition: Competition, status: Competition["status"]) {
    setBusy(competition._id + "-status");
    try {
      await adminApi.updateCompetitionStatus(competition._id, status);
      load();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Update failed"); }
    finally { setBusy(null); }
  }

  async function handleReward() {
    if (!rewardTarget || !identifier.trim() || !rewardAmount) return;
    setBusy("reward");
    try {
      const res = await adminApi.rewardCompetitionWinner(rewardTarget._id, identifier.trim(), Number(rewardAmount), note.trim() || undefined);
      setError(`Rewarded ${res.user.name} ${fmtCurrency(Number(rewardAmount))} — reserve now ${fmtCurrency(res.reserveAfter)}`);
      setRewardTarget(null);
      setIdentifier(""); setRewardAmount(""); setNote("");
      load();
      if (expanded === rewardTarget._id) toggleAwards(rewardTarget._id, true);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Reward failed"); }
    finally { setBusy(null); }
  }

  async function toggleAwards(competitionId: string, forceOpen = false) {
    if (!forceOpen && expanded === competitionId) { setExpanded(null); return; }
    setExpanded(competitionId);
    try {
      const res = await adminApi.listCompetitionAwards(competitionId);
      setAwardsByCompetition((prev) => ({ ...prev, [competitionId]: res.awards }));
    } catch { /* leave prior awards list, if any */ }
  }

  return (
    <div className="p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-text">Competitions</h1>
          <p className="text-sm text-muted mt-0.5">Admin-run marketing prizes — real, withdrawable money, winners picked manually.</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-3 py-2 rounded-xl bg-surface-3 border border-border text-xs font-semibold text-muted hover:text-text hover:border-primary/30 transition-colors flex items-center gap-1.5"
        >
          <Plus size={13} /> New Competition
        </button>
      </div>

      {error && <p className="text-xs text-danger bg-danger/10 border border-danger/20 rounded-xl px-4 py-3">{error}</p>}

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Active" value={competitions.filter((c) => c.status === "active").length} accent="success" />
        <StatCard label="Total Prize Pool" value={fmtCurrency(competitions.reduce((s, c) => s + c.prizeAmount, 0))} accent="primary" />
        <StatCard label="Total Awarded" value={fmtCurrency(competitions.reduce((s, c) => s + c.awardedAmount, 0))} accent="warning" />
      </div>

      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <p className="text-sm font-bold text-text">All Competitions</p>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {["Title", "Market", "Prize", "Awarded", "Status", "Window", "Actions"].map((h) => (
                <th key={h} className="px-5 py-3 text-left text-[10px] font-bold text-muted uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading && <tr><td colSpan={7} className="px-5 py-6 text-center text-sm text-muted">Loading…</td></tr>}
            {!loading && competitions.length === 0 && <tr><td colSpan={7} className="px-5 py-6 text-center text-sm text-muted">No competitions yet.</td></tr>}
            {competitions.map((c) => (
              <Fragment key={c._id}>
                <tr className="hover:bg-surface-2 transition-colors">
                  <td className="px-5 py-4">
                    <p className="text-sm font-bold text-text">{c.title}</p>
                    {c.description && <p className="text-xs text-muted mt-0.5 max-w-xs truncate">{c.description}</p>}
                  </td>
                  <td className="px-5 py-4 text-xs text-muted">{MARKET_LABEL[c.market]}</td>
                  <td className="px-5 py-4 text-sm font-semibold text-text">{fmtCurrency(c.prizeAmount)}</td>
                  <td className="px-5 py-4 text-sm text-text">
                    {fmtCurrency(c.awardedAmount)}
                    <div className="w-24 h-1 bg-surface-3 rounded-full mt-1.5 overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min((c.awardedAmount / (c.prizeAmount || 1)) * 100, 100)}%` }} />
                    </div>
                  </td>
                  <td className="px-5 py-4"><Badge label={c.status} variant={STATUS_VARIANT[c.status]} /></td>
                  <td className="px-5 py-4 text-xs text-muted">
                    {c.startsAt ? fmtDate(c.startsAt) : "—"}{c.endsAt ? ` – ${fmtDate(c.endsAt)}` : ""}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      {c.status === "draft" && (
                        <button
                          onClick={() => handleStatusChange(c, "active")}
                          disabled={busy === c._id + "-status"}
                          className="flex items-center gap-1 text-xs font-bold text-success bg-success/10 border border-success/20 px-2.5 py-1.5 rounded-lg hover:bg-success/20 disabled:opacity-50 transition-colors"
                        >
                          <Play size={11} /> Activate
                        </button>
                      )}
                      {c.status === "active" && (
                        <>
                          <button
                            onClick={() => { setRewardTarget(c); setRewardAmount(String(Math.max(c.prizeAmount - c.awardedAmount, 0))); }}
                            className="flex items-center gap-1 text-xs font-bold text-primary bg-primary/10 border border-primary/20 px-2.5 py-1.5 rounded-lg hover:bg-primary/20 transition-colors"
                          >
                            <Gift size={11} /> Reward
                          </button>
                          <button
                            onClick={() => handleStatusChange(c, "ended")}
                            disabled={busy === c._id + "-status"}
                            className="flex items-center gap-1 text-xs font-bold text-muted bg-surface-3 border border-border px-2.5 py-1.5 rounded-lg hover:text-text transition-colors"
                          >
                            <Square size={11} /> End
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => toggleAwards(c._id)}
                        className="flex items-center gap-1 text-xs text-muted hover:text-text transition-colors"
                      >
                        <Trophy size={11} />
                        {expanded === c._id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </button>
                    </div>
                  </td>
                </tr>
                {expanded === c._id && (
                  <tr>
                    <td colSpan={7} className="px-5 py-3 bg-surface-2">
                      {!awardsByCompetition[c._id] ? (
                        <p className="text-xs text-muted">Loading awards…</p>
                      ) : awardsByCompetition[c._id].length === 0 ? (
                        <p className="text-xs text-muted">No winners rewarded yet.</p>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          {awardsByCompetition[c._id].map((a) => {
                            const user = typeof a.user === "object" ? a.user : null;
                            return (
                              <div key={a._id} className="flex items-center justify-between text-xs px-3 py-2 bg-surface rounded-lg border border-border">
                                <span className="text-text font-semibold">{user?.name ?? "—"}</span>
                                <span className="text-muted">{user?.email ?? ""}</span>
                                <span className="text-success font-bold">{fmtCurrency(a.amount)}</span>
                                <span className="text-faint">{fmtDate(a.createdAt)}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create Competition */}
      {showCreate && (
        <Modal title="New Competition" onClose={() => setShowCreate(false)}>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted uppercase tracking-wider">Title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Gameweek 3 Top Scorer Bonus"
                className="bg-surface-2 border border-border rounded-xl px-4 py-3 text-sm text-text outline-none focus:border-primary/50" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted uppercase tracking-wider">Description (optional)</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="How winners are picked, rules, etc."
                className="bg-surface-2 border border-border rounded-xl px-4 py-3 text-sm text-text outline-none focus:border-primary/50 resize-none" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-muted uppercase tracking-wider">Market</label>
                <select value={market} onChange={(e) => setMarket(e.target.value as Competition["market"])}
                  className="bg-surface-2 border border-border rounded-xl px-4 py-3 text-sm text-text outline-none [color-scheme:dark]">
                  <option value="pro">Pro Fantasy</option>
                  <option value="classic">Classic</option>
                  <option value="both">Both</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-muted uppercase tracking-wider">Prize Amount (₦)</label>
                <input type="number" min="1" value={prizeAmount} onChange={(e) => setPrizeAmount(e.target.value)} placeholder="e.g. 50000"
                  className="bg-surface-2 border border-border rounded-xl px-4 py-3 text-sm text-text outline-none focus:border-primary/50" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-muted uppercase tracking-wider">Starts (optional)</label>
                <input type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)}
                  className="bg-surface-2 border border-border rounded-xl px-4 py-3 text-sm text-text outline-none [color-scheme:dark]" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-muted uppercase tracking-wider">Ends (optional)</label>
                <input type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)}
                  className="bg-surface-2 border border-border rounded-xl px-4 py-3 text-sm text-text outline-none [color-scheme:dark]" />
              </div>
            </div>
            <p className="text-[10px] text-faint">Created as a draft — activate it to show the promo card to users. Prize money comes from the Reserve when you reward a winner.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowCreate(false)} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted hover:text-text transition-colors">Cancel</button>
              <button
                onClick={handleCreate}
                disabled={!title.trim() || !prizeAmount || busy === "create"}
                className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-bold disabled:opacity-50 hover:bg-primary-dim transition-colors flex items-center justify-center gap-2"
              >
                {busy === "create" ? <Loader2 size={14} className="animate-spin" /> : "Create"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Reward Winner */}
      {rewardTarget && (
        <Modal title={`Reward Winner — ${rewardTarget.title}`} onClose={() => setRewardTarget(null)}>
          <div className="flex flex-col gap-4">
            <div className="bg-surface-2 border border-border rounded-xl p-3 text-xs flex gap-4">
              <div><p className="text-muted">Prize pool</p><p className="text-text font-semibold">{fmtCurrency(rewardTarget.prizeAmount)}</p></div>
              <div><p className="text-muted">Awarded so far</p><p className="text-text font-semibold">{fmtCurrency(rewardTarget.awardedAmount)}</p></div>
              <div><p className="text-muted">Remaining</p><p className="text-primary font-semibold">{fmtCurrency(Math.max(rewardTarget.prizeAmount - rewardTarget.awardedAmount, 0))}</p></div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted uppercase tracking-wider">Winner — userId, email, phone, or referral code</label>
              <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="winner@example.com"
                className="bg-surface-2 border border-border rounded-xl px-4 py-3 text-sm text-text outline-none focus:border-primary/50" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted uppercase tracking-wider">Amount (₦)</label>
              <input type="number" min="1" value={rewardAmount} onChange={(e) => setRewardAmount(e.target.value)}
                className="bg-surface-2 border border-border rounded-xl px-4 py-3 text-sm text-text outline-none focus:border-primary/50" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted uppercase tracking-wider">Note (optional)</label>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. 1st place — highest GW3 score"
                className="bg-surface-2 border border-border rounded-xl px-4 py-3 text-sm text-text outline-none focus:border-primary/50" />
            </div>
            <p className="text-[10px] text-faint">Credited straight to the winner&apos;s wallet from the Reserve — immediately real and withdrawable. Amount can exceed the prize pool if you choose to.</p>
            <div className="flex gap-3">
              <button onClick={() => setRewardTarget(null)} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted hover:text-text transition-colors">Cancel</button>
              <button
                onClick={handleReward}
                disabled={!identifier.trim() || !rewardAmount || busy === "reward"}
                className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-bold disabled:opacity-50 hover:bg-primary-dim transition-colors flex items-center justify-center gap-2"
              >
                {busy === "reward" ? <Loader2 size={14} className="animate-spin" /> : <><Gift size={14} /> Reward</>}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
