"use client";

import { useCallback, useEffect, useState } from "react";
import {
  adminApi,
  type OnChainGameweekState,
  type OnChainPool,
  type OnChainAdvanceOutcome,
} from "@/lib/api";
import { ExternalLink, Link2, Loader2, ShieldCheck, CircleAlert } from "lucide-react";

function fmtUsdc(n: number) { return "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

/** Basescan / Sepolia explorer for a chain id. */
function explorerFor(chainId: number | null): string | null {
  if (chainId === 8453) return "https://basescan.org";
  if (chainId === 84532) return "https://sepolia.basescan.org";
  return null;
}

const OUTCOME_TONE: Record<OnChainAdvanceOutcome, "ok" | "info" | "warn"> = {
  // Money moved or the pot is exactly right.
  escrowed: "ok",
  published: "ok",
  locked: "ok",
  // Nothing to do yet — the normal state for most ticks.
  "up-to-date": "info",
  "awaiting-lock": "info",
  "awaiting-settle": "info",
  "not-configured": "info",
  // The states that want an operator to do something.
  "waiting-wallets": "warn",
  "awaiting-topup": "warn",
};

const OUTCOME_LABEL: Record<OnChainAdvanceOutcome, string> = {
  escrowed: "Escrowed",
  published: "Published",
  locked: "Locked",
  "up-to-date": "Up to date",
  "awaiting-lock": "Awaiting lock",
  "awaiting-settle": "Awaiting settlement",
  "awaiting-topup": "Pool needs top-up",
  "not-configured": "Not configured",
  "waiting-wallets": "Waiting on wallets",
};

/**
 * On-chain pot status, plus one order-free "advance" button.
 *
 * The lifecycle cron does all of this automatically: it escrows the pot when
 * squads lock and publishes the top 3 when the last fixture finishes. So this
 * panel is for *observation*, and the button is only the manual catch-up for
 * when the cron couldn't run — an underfunded treasury, an RPC blip, a gameweek
 * whose pot landed after the treasury was topped up.
 *
 * There is deliberately no fund / lock / publish trio here. Those had to be
 * pressed in the right order, and pressing them wrong was unrecoverable:
 * locking a pot before funding it made it impossible to fund ever again, which
 * would have destroyed the prize outright with no way to pay the winner. Two
 * contract-level changes make that unrepresentable — `fundAndLockPool` moves
 * the money and freezes the pot in one transaction, and `setWinners` locks an
 * already-funded pot itself — and this button performs at most one step,
 * chosen by reading chain state. It's idempotent, so pressing it twice is
 * harmless.
 */
export default function OnChainEscrowPanel({ gameweekId }: { gameweekId: string }) {
  const [pool, setPool] = useState<OnChainPool | null>(null);
  const [state, setState] = useState<OnChainGameweekState | null>(null);
  const [loading, setLoading] = useState(true);
  const [advancing, setAdvancing] = useState(false);
  const [outcome, setOutcome] = useState<{ outcome: OnChainAdvanceOutcome; detail: string; txHash?: string } | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await adminApi.getProGameweekOnChain(gameweekId);
      setPool(res.pool);
      setState(res.state.configured ? res.state : null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to read chain state");
    } finally {
      setLoading(false);
    }
  }, [gameweekId]);

  useEffect(() => { load(); }, [load]);

  async function handleAdvance() {
    setAdvancing(true);
    setError("");
    try {
      const res = await adminApi.advanceProGameweekOnChain(gameweekId);
      setOutcome(res);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Advance failed");
    } finally {
      setAdvancing(false);
    }
  }

  const explorer = explorerFor(pool?.chainId ?? null);

  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link2 size={14} className="text-primary" />
          <p className="text-sm font-bold text-text">USDC Prize Pool</p>
          {pool?.configured && pool.network && (
            <span className="text-[10px] font-black text-primary uppercase tracking-widest px-1.5 py-0.5 bg-primary/10 border border-primary/20 rounded">
              {pool.network}
            </span>
          )}
        </div>
        <button
          onClick={handleAdvance}
          disabled={advancing || !pool?.configured}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-3 border border-border text-[11px] font-semibold text-muted hover:text-text disabled:opacity-40 transition-colors"
        >
          {advancing ? <Loader2 size={12} className="animate-spin" /> : <ShieldCheck size={12} />}
          {advancing ? "Advancing…" : "Advance / Retry"}
        </button>
      </div>

      <div className="px-5 py-4 flex flex-col gap-3.5">
        {loading ? (
          <div className="h-16 rounded-xl bg-surface-2 animate-pulse" />
        ) : !pool?.configured ? (
          <p className="text-xs text-muted">
            On-chain payouts aren&apos;t configured on this deployment. Set{" "}
            <span className="text-text font-semibold">PRIZE_POOL_ADDRESS</span> (and the treasury and
            owner keys) on the backend to enable them — until then the pot stays an internal figure
            and nothing is escrowed.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-3">
              <Cell label="Pot escrowed" value={fmtUsdc(state?.totalPool ?? 0)} tone="ok" />
              <Cell label="Paid out" value={fmtUsdc(state?.distributed ?? 0)} />
              <Cell label="Unclaimed" value={fmtUsdc(state?.unclaimed ?? 0)} />
              <Cell label="Contract balance" value={fmtUsdc(pool.escrowBalance ?? 0)} />
            </div>

            <div className="flex items-center gap-3 flex-wrap text-[11px]">
              <Stage label="Escrowed" done={(state?.totalPool ?? 0) > 0} />
              <Stage label="Frozen" done={!!state?.locked} />
              <Stage label="Settled" done={!!state?.settled} />
              <Stage label="Claimed" done={(state?.distributed ?? 0) >= (state?.totalPool ?? 0) && (state?.totalPool ?? 0) > 0} />
            </div>

            {state?.settled && state.prizes.some((p) => p > 0) && (
              <div className="rounded-xl bg-surface-2 border border-border px-4 py-3">
                <p className="text-[10px] font-bold text-faint uppercase tracking-wider mb-2">Prizes on-chain</p>
                <div className="grid grid-cols-3 gap-3">
                  {[0, 1, 2].map((i) => (
                    <div key={i}>
                      <p className="text-[10px] text-muted">{["1st", "2nd", "3rd"][i]}</p>
                      <p className="text-sm font-black text-text">{fmtUsdc(state.prizes[i] ?? 0)}</p>
                      {state.winners[i] && state.winners[i] !== "0x0000000000000000000000000000000000000000" && (
                        <a
                          href={explorer ? `${explorer}/address/${state.winners[i]}` : undefined}
                          target="_blank" rel="noreferrer"
                          className="text-[10px] text-primary hover:underline inline-flex items-center gap-0.5"
                        >
                          {state.winners[i].slice(0, 6)}…{state.winners[i].slice(-4)}
                          <ExternalLink size={8} />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {explorer && pool.address && (
              <a
                href={`${explorer}/address/${pool.address}`}
                target="_blank" rel="noreferrer"
                className="text-[11px] text-primary hover:underline inline-flex items-center gap-1 w-fit"
              >
                {pool.address.slice(0, 8)}…{pool.address.slice(-6)} on explorer <ExternalLink size={9} />
              </a>
            )}
          </>
        )}

        {outcome && (
          <div
            className={`rounded-xl px-4 py-3 border text-xs ${
              OUTCOME_TONE[outcome.outcome] === "warn"
                ? "bg-warning/10 border-warning/25 text-warning"
                : OUTCOME_TONE[outcome.outcome] === "ok"
                ? "bg-success/10 border-success/25 text-success"
                : "bg-surface-2 border-border text-muted"
            }`}
          >
            <span className="font-bold">{OUTCOME_LABEL[outcome.outcome]}</span>
            <span className="opacity-80"> — {outcome.detail}</span>
            {outcome.txHash && explorer && (
              <a
                href={`${explorer}/tx/${outcome.txHash}`}
                target="_blank" rel="noreferrer"
                className="ml-1.5 underline inline-flex items-center gap-0.5"
              >
                view tx <ExternalLink size={8} />
              </a>
            )}
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-xl bg-danger/10 border border-danger/25 px-4 py-3 text-xs text-danger">
            <CircleAlert size={13} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {pool?.configured && (
          <p className="text-[10px] text-faint">
            Escrow and winner publication run automatically every five minutes — the button above is
            only for retrying after a failure.
          </p>
        )}
      </div>
    </div>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: "ok" }) {
  return (
    <div>
      <p className="text-[10px] text-faint uppercase tracking-wider">{label}</p>
      <p className={`text-sm font-black tabular-nums ${tone === "ok" ? "text-success" : "text-text"}`}>{value}</p>
    </div>
  );
}

function Stage({ label, done }: { label: string; done: boolean }) {
  return (
    <span className={`flex items-center gap-1.5 ${done ? "text-success" : "text-faint"}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${done ? "bg-success" : "bg-faint/40"}`} />
      {label}
    </span>
  );
}