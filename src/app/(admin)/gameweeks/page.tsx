"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  adminApi,
  type ProGameweek,
  type ProLeagueRound,
  type ProPoolSummary,
  type ProResearchFixture,
} from "@/lib/api";
import { getAdminInfo } from "@/lib/auth";
import Badge from "@/components/Badge";
import Modal from "@/components/Modal";
import StatCard from "@/components/StatCard";
import GameweekId, { LEAGUE_CODE } from "@/components/GameweekId";
import {
  Plus, PlayCircle, Loader2, Search, Wallet, CalendarRange,
  ChevronDown, ChevronRight, ArrowUpRight, Clock,
} from "lucide-react";

function fmtCurrency(n: number) { return "$" + n.toLocaleString(); }
function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
function fmtDay(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}
function toDateInput(d: Date) {
  return d.toISOString().slice(0, 10);
}

const STATUS_VARIANT: Record<ProGameweek["status"], "upcoming" | "open" | "locked" | "settled"> = {
  upcoming: "upcoming", open: "open", locked: "locked", settling: "locked", settled: "settled",
};

// Only Premier League has real priced player coverage right now — pulling
// fixtures for an unpriced league wastes API quota on data no squad can use.
// Keep in step with the Fantasy page.
const LEAGUE_OPTIONS = [
  { id: 39,  name: "Premier League", default: true  },
  { id: 140, name: "La Liga",        default: false },
  { id: 78,  name: "Bundesliga",     default: false },
  { id: 135, name: "Serie A",        default: false },
  { id: 61,  name: "Ligue 1",        default: false },
  { id: 2,   name: "UEFA Champions League", default: false },
  { id: 3,   name: "UEFA Europa League",    default: false },
];

// Sensible starting window for the research panel: the upcoming Fri→Sun, which
// is when the big-five leagues actually play.
function defaultWindow(): { from: string; to: string } {
  const now = new Date();
  const day = now.getDay(); // 0 Sun … 6 Sat
  const toSaturday = (6 - day + 7) % 7 || 7;
  const sat = new Date(now);
  sat.setDate(now.getDate() + toSaturday);
  const mon = new Date(sat);
  mon.setDate(sat.getDate() + 2);
  return { from: toDateInput(sat), to: toDateInput(mon) };
}

export default function GameweeksAdminPage() {
  const admin = getAdminInfo();
  const isFinance = admin?.role === "superadmin";

  const [gameweeks, setGameweeks] = useState<ProGameweek[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  // ── Research panel ────────────────────────────────────────────────────────
  const [researchOpen, setResearchOpen] = useState(true);
  const [fromDate, setFromDate] = useState(() => defaultWindow().from);
  const [toDate, setToDate] = useState(() => defaultWindow().to);
  const [leagueIds, setLeagueIds] = useState<number[]>(
    LEAGUE_OPTIONS.filter((l) => l.default).map((l) => l.id),
  );
  const [researching, setResearching] = useState(false);
  const [leagueRounds, setLeagueRounds] = useState<ProLeagueRound[]>([]);
  const [researchFixtures, setResearchFixtures] = useState<ProResearchFixture[]>([]);
  const [researchedAt, setResearchedAt] = useState<Date | null>(null);

  // ── Create / batch modals ─────────────────────────────────────────────────
  const [showCreate, setShowCreate] = useState(false);
  const [gwNumber, setGwNumber] = useState("");
  const [opensAt, setOpensAt] = useState("");
  const [isBlackout, setIsBlackout] = useState(false);
  const [competitionLabel, setCompetitionLabel] = useState("");
  const [skipRefresh, setSkipRefresh] = useState(true);

  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleCount, setScheduleCount] = useState("4");
  const [scheduleStartNumber, setScheduleStartNumber] = useState("");
  const [scheduleStartOpensAt, setScheduleStartOpensAt] = useState("");
  const [scheduleBlackoutOffsets, setScheduleBlackoutOffsets] = useState<number[]>([]);

  const [poolGameweek, setPoolGameweek] = useState<ProGameweek | null>(null);
  const [poolSummary, setPoolSummary] = useState<ProPoolSummary | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.listProGameweeks();
      setGameweeks(res.gameweeks);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Split: past (settled / locked / settling) vs upcoming (draft / open) ──
  // Status is the source of truth for "is this week still ahead of me" — a week
  // is past once it's locked or settling, well before it settles. Using the
  // status (not the clock) keeps this pure and avoids a render-time Date.now().
  const { past, upcoming } = useMemo(() => {
    const past: ProGameweek[] = [];
    const upcoming: ProGameweek[] = [];
    for (const gw of gameweeks) {
      if (gw.status === "locked" || gw.status === "settling" || gw.status === "settled") past.push(gw);
      else upcoming.push(gw);
    }
    past.sort((a, b) => b.number - a.number);
    upcoming.sort((a, b) => a.number - b.number);
    return { past, upcoming };
  }, [gameweeks]);

  const totalTaken = past.reduce((sum, gw) => sum + (gw.poolTotal ?? 0), 0);
  const totalHouse = past.reduce((sum, gw) => sum + (gw.houseCut ?? 0), 0);

  // The most recent real matchweeks the admin has researched — drives the
  // display-id code on each row (same code across rows, since it's "today's"
  // state of each league, not a per-week fact).
  const liveMatchweeks = useMemo(() => {
    const map: Record<number, number | null> = {};
    for (const lr of leagueRounds) map[lr.leagueId] = lr.matchweek;
    return map;
  }, [leagueRounds]);

  async function handleResearch() {
    setResearching(true);
    setError("");
    try {
      const res = await adminApi.researchProFixtures({ from: fromDate, to: toDate, leagueIds });
      setLeagueRounds(res.leagues);
      setResearchFixtures(res.fixtures);
      setResearchedAt(new Date());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Research failed");
    } finally { setResearching(false); }
  }

  async function handleCreate() {
    setBusy("create");
    setError("");
    try {
      await adminApi.createProGameweek({
        number: Number(gwNumber), opensAt,
        from: isBlackout ? undefined : fromDate,
        to: isBlackout ? undefined : toDate,
        leagueIds: isBlackout ? undefined : leagueIds,
        isBlackout,
        competitionLabel: competitionLabel || undefined,
      });
      setShowCreate(false);
      setGwNumber(""); setOpensAt(""); setIsBlackout(false); setCompetitionLabel("");
      setNotice("Gameweek created.");
      load();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Create failed"); }
    finally { setBusy(null); }
  }

  async function handleSchedule() {
    setBusy("schedule");
    setError("");
    try {
      await adminApi.batchCreateProGameweeks({
        count: Number(scheduleCount),
        startNumber: Number(scheduleStartNumber),
        startFrom: fromDate,
        startOpensAt: scheduleStartOpensAt,
        leagueIds,
        blackoutOffsets: scheduleBlackoutOffsets,
      });
      setShowSchedule(false);
      setScheduleCount("4"); setScheduleStartNumber(""); setScheduleStartOpensAt("");
      setScheduleBlackoutOffsets([]);
      setNotice("Weeks scheduled ahead.");
      load();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Schedule failed"); }
    finally { setBusy(null); }
  }

  async function handleOpen(id: string) {
    if (!skipRefresh && !confirm(
      "This will re-fetch fresh season stats for every player across all supported leagues " +
      "(up to ~85 API requests, paced ~6.5s apart — several minutes, and can exhaust a free-tier " +
      "daily quota on its own). Continue?"
    )) return;
    setBusy(id + "-open");
    setError("");
    try { await adminApi.openProGameweek(id, skipRefresh); setNotice("Gameweek opened."); load(); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : "Open failed"); }
    finally { setBusy(null); }
  }

  async function openPoolSummary(gw: ProGameweek) {
    setPoolGameweek(gw);
    setPoolSummary(null);
    try {
      const res = await adminApi.getProPoolSummary(gw._id);
      setPoolSummary(res.summary);
    } catch { setPoolSummary(null); }
  }

  return (
    <div className="p-8 flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-text">Gameweeks</h1>
          <p className="text-sm text-muted mt-0.5">
            Research what the leagues are playing, then draft the platform weeks ahead of time.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-[11px] text-muted cursor-pointer select-none" title="When opening a gameweek, skip re-fetching fresh stats for every player (saves API quota)">
            <input type="checkbox" checked={skipRefresh} onChange={(e) => setSkipRefresh(e.target.checked)} className="accent-primary" />
            Skip metrics refresh on open
          </label>
          <button
            onClick={() => setShowSchedule(true)}
            className="px-3 py-2 rounded-xl bg-surface-3 border border-border text-xs font-semibold text-muted hover:text-text hover:border-primary/30 transition-colors flex items-center gap-1.5"
          >
            <CalendarRange size={13} /> Schedule Ahead
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="px-3 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-dim transition-colors flex items-center gap-1.5"
          >
            <Plus size={13} /> New Gameweek
          </button>
        </div>
      </div>

      {error && <p className="text-xs text-danger bg-danger/10 border border-danger/20 rounded-xl px-4 py-3">{error}</p>}
      {notice && <p className="text-xs text-success bg-success/10 border border-success/20 rounded-xl px-4 py-3">{notice}</p>}

      {/* Counts */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Created"        value={gameweeks.length} sub="All weeks on record" accent="primary" />
        <StatCard label="Upcoming"       value={upcoming.length}  sub="Draft / open — draft ahead" accent="info" />
        <StatCard label="Past"           value={past.length}      sub="Locked, settling or settled" accent="success" />
        <StatCard label="Taken In"       value={fmtCurrency(totalTaken)} sub={`House ${fmtCurrency(totalHouse)}`} accent="warning" />
      </div>

      {/* ── Research panel ────────────────────────────────────────────────── */}
      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <button
          onClick={() => setResearchOpen((v) => !v)}
          className="w-full px-5 py-4 flex items-center gap-2 border-b border-border text-left"
        >
          {researchOpen ? <ChevronDown size={15} className="text-muted" /> : <ChevronRight size={15} className="text-muted" />}
          <div className="flex-1">
            <p className="text-sm font-bold text-text">League research</p>
            <p className="text-xs text-muted mt-0.5">
              Pull the real fixtures for a date window — one api-football request per league — and see each league&apos;s own matchweek.
            </p>
          </div>
        </button>

        {researchOpen && (
          <div className="p-5 flex flex-col gap-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-semibold text-muted uppercase tracking-wider">From</label>
                <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
                  className="bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm text-text outline-none [color-scheme:dark]" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-semibold text-muted uppercase tracking-wider">To</label>
                <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
                  className="bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm text-text outline-none [color-scheme:dark]" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-semibold text-muted uppercase tracking-wider">Leagues</label>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
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
              <button
                onClick={handleResearch}
                disabled={researching || !fromDate || !toDate || leagueIds.length === 0}
                className="ml-auto px-4 py-2.5 rounded-xl bg-surface-3 border border-border text-xs font-bold text-text hover:border-primary/30 disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {researching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                Pull Fixtures
              </button>
            </div>

            {researchedAt && (
              <p className="text-[11px] text-faint">
                {leagueRounds.reduce((n, l) => n + l.fixtureCount, 0)} fixture(s) across {leagueRounds.length} league(s)
                {" · "}pulled {researchedAt.toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" })}
                {" · "}cost ≈ {leagueIds.length} request(s)
              </p>
            )}

            {/* Per-league matchweek summary — this is the (P8L9S7G7F7) source */}
            {leagueRounds.length > 0 && (
              <div className="rounded-xl border border-border overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-surface-2">
                      {["League", "Matchweek", "Round label", "Games", "First kickoff", "Last kickoff"].map((h) => (
                        <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-muted uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {leagueRounds.map((lr) => (
                      <tr key={lr.leagueId} className="hover:bg-surface-2 transition-colors">
                        <td className="px-4 py-3 text-sm font-semibold text-text">{lr.league || `League ${lr.leagueId}`}</td>
                        <td className="px-4 py-3 text-sm">
                          {lr.matchweek != null
                            ? <span className="font-bold text-primary">MW {lr.matchweek}</span>
                            : <span className="text-faint">—</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted">{lr.round ?? "—"}</td>
                        <td className="px-4 py-3 text-sm text-text tabular-nums">{lr.fixtureCount}</td>
                        <td className="px-4 py-3 text-xs text-muted">{fmtDate(lr.firstKickoff)}</td>
                        <td className="px-4 py-3 text-xs text-muted">{fmtDate(lr.lastKickoff)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Fixture list */}
            {researchFixtures.length > 0 && (
              <div className="rounded-xl border border-border overflow-hidden max-h-96 overflow-y-auto">
                <table className="w-full">
                  <thead className="sticky top-0 bg-surface-2">
                    <tr className="border-b border-border">
                      {["Kickoff", "League", "Round", "Match"].map((h) => (
                        <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-muted uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {[...researchFixtures]
                      .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime())
                      .map((f) => (
                      <tr key={f.apiFootballFixtureId} className="hover:bg-surface-2 transition-colors">
                        <td className="px-4 py-2.5 text-xs text-muted whitespace-nowrap">{fmtDate(f.kickoff)}</td>
                        <td className="px-4 py-2.5 text-xs text-muted">{f.league}</td>
                        <td className="px-4 py-2.5 text-xs text-faint">
                          {f.roundNumber != null ? `MW ${f.roundNumber}` : (f.round ?? "—")}
                        </td>
                        <td className="px-4 py-2.5 text-sm font-semibold text-text">{f.homeTeam} vs {f.awayTeam}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {researchedAt && researchFixtures.length === 0 && (
              <p className="text-sm text-muted text-center py-4">
                No fixtures in that window for the selected leagues — try a different date range, or mark the week a blackout (international break).
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Upcoming weeks ────────────────────────────────────────────────── */}
      <GameweekTable
        title="Upcoming"
        subtitle="Draft weeks ahead — the chain opens each one as the previous week's last game finishes."
        rows={upcoming}
        empty={loading ? "Loading…" : "No upcoming weeks. Use Schedule Ahead to draft the next few."}
        liveMatchweeks={liveMatchweeks}
        isFinance={isFinance}
        busy={busy}
        onOpen={handleOpen}
        onPool={openPoolSummary}
      />

      {/* ── Past weeks (light finance) ────────────────────────────────────── */}
      <GameweekTable
        title="Past"
        subtitle="Locked, settling and settled weeks — what each one took in."
        rows={past}
        empty="No past weeks yet."
        liveMatchweeks={liveMatchweeks}
        isFinance={isFinance}
        busy={busy}
        onOpen={handleOpen}
        onPool={openPoolSummary}
        finance
      />

      {/* ── Create modal ──────────────────────────────────────────────────── */}
      {showCreate && (
        <Modal title="New Gameweek" onClose={() => setShowCreate(false)}>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted uppercase tracking-wider">Gameweek Number</label>
              <input type="number" value={gwNumber} onChange={(e) => setGwNumber(e.target.value)} placeholder="e.g. 7"
                className="bg-surface-2 border border-border rounded-xl px-4 py-3 text-sm text-text outline-none focus:border-primary/50" />
              <p className="text-[10px] text-faint">Your platform week number (restarts each season) — not a league matchweek.</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted uppercase tracking-wider">Opens At</label>
              <input type="datetime-local" value={opensAt} onChange={(e) => setOpensAt(e.target.value)}
                className="bg-surface-2 border border-border rounded-xl px-4 py-3 text-sm text-text outline-none [color-scheme:dark]" />
            </div>

            <label className="flex items-center gap-2 text-xs text-muted cursor-pointer select-none bg-warning/5 border border-warning/20 rounded-xl px-4 py-3">
              <input type="checkbox" checked={isBlackout} onChange={(e) => setIsBlackout(e.target.checked)} className="accent-warning" />
              International break — no club fixtures this week
            </label>

            {!isBlackout && (
              <>
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
                <p className="text-[10px] text-faint">
                  The pull decides the week&apos;s lock time (first kickoff) and its scoring games. Research the window above first.
                </p>
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
                  <p className="text-[10px] text-faint">Only pull leagues whose players are actually priced — fixtures from an unpriced league just waste API quota.</p>
                </div>
              </>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted uppercase tracking-wider">Competition Label (optional)</label>
              <input type="text" value={competitionLabel} onChange={(e) => setCompetitionLabel(e.target.value)} placeholder="e.g. Champions League Week"
                className="bg-surface-2 border border-border rounded-xl px-4 py-3 text-sm text-text outline-none focus:border-primary/50" />
            </div>

            <div className="flex gap-3">
              <button onClick={() => setShowCreate(false)} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted hover:text-text transition-colors">Cancel</button>
              <button
                onClick={handleCreate}
                disabled={!gwNumber || !opensAt || (!isBlackout && (!fromDate || !toDate || leagueIds.length === 0)) || busy === "create"}
                className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-bold disabled:opacity-50 hover:bg-primary-dim transition-colors flex items-center justify-center gap-2"
              >
                {busy === "create" ? <Loader2 size={14} className="animate-spin" /> : "Create"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Schedule ahead modal ──────────────────────────────────────────── */}
      {showSchedule && (
        <Modal title="Schedule Ahead" onClose={() => setShowSchedule(false)}>
          <div className="flex flex-col gap-4">
            <p className="text-[11px] text-faint">
              Creates several upcoming weeks at once, one real week apart, using the fixture window
              set in the research panel ({fromDate} → {toDate}). Each subsequent week shifts by +7 days.
              Only the first week of a season needs opening by hand — the chain opens the rest.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-muted uppercase tracking-wider">How Many Weeks</label>
                <input type="number" min={1} max={12} value={scheduleCount} onChange={(e) => setScheduleCount(e.target.value)}
                  className="bg-surface-2 border border-border rounded-xl px-4 py-3 text-sm text-text outline-none focus:border-primary/50" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-muted uppercase tracking-wider">Starting Number</label>
                <input type="number" value={scheduleStartNumber} onChange={(e) => setScheduleStartNumber(e.target.value)} placeholder="e.g. 8"
                  className="bg-surface-2 border border-border rounded-xl px-4 py-3 text-sm text-text outline-none focus:border-primary/50" />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted uppercase tracking-wider">First Week Opens At</label>
              <input type="datetime-local" value={scheduleStartOpensAt} onChange={(e) => setScheduleStartOpensAt(e.target.value)}
                className="bg-surface-2 border border-border rounded-xl px-4 py-3 text-sm text-text outline-none [color-scheme:dark]" />
            </div>

            {fromDate && Number(scheduleCount) > 0 && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-muted uppercase tracking-wider">International Breaks</label>
                <div className="flex flex-col gap-1">
                  {Array.from({ length: Number(scheduleCount) }).map((_, i) => {
                    const weekDate = new Date(new Date(fromDate).getTime() + i * 7 * 24 * 60 * 60 * 1000);
                    const checked = scheduleBlackoutOffsets.includes(i);
                    return (
                      <label key={i} className="flex items-center gap-2 text-xs text-muted cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => setScheduleBlackoutOffsets((prev) =>
                            e.target.checked ? [...prev, i] : prev.filter((n) => n !== i))}
                          className="accent-warning"
                        />
                        Week {i + 1} — {weekDate.toLocaleDateString("en-NG", { day: "numeric", month: "short" })}
                        {checked && <span className="text-warning font-semibold">International break</span>}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setShowSchedule(false)} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted hover:text-text transition-colors">Cancel</button>
              <button
                onClick={handleSchedule}
                disabled={!scheduleCount || !scheduleStartNumber || !scheduleStartOpensAt || !fromDate || leagueIds.length === 0 || busy === "schedule"}
                className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-bold disabled:opacity-50 hover:bg-primary-dim transition-colors flex items-center justify-center gap-2"
              >
                {busy === "schedule" ? <Loader2 size={14} className="animate-spin" /> : "Schedule"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Finance modal ─────────────────────────────────────────────────── */}
      {poolGameweek && (
        <Modal title={`Week ${poolGameweek.number} — Finance`} onClose={() => setPoolGameweek(null)}>
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <GameweekId id={poolGameweek._id} matchweeks={liveMatchweeks} fallback={`#${poolGameweek.number}`} />
              <Badge label={poolGameweek.status} variant={STATUS_VARIANT[poolGameweek.status]} />
            </div>
            {poolSummary ? (
              <div className="bg-surface-2 border border-border rounded-xl p-4 grid grid-cols-2 gap-4 text-sm">
                <div><p className="text-muted text-xs">Squads</p><p className="text-text font-semibold">{poolSummary.squadCount}</p></div>
                <div><p className="text-muted text-xs">Took In (gross)</p><p className="text-text font-semibold">{fmtCurrency(poolSummary.poolTotal)}</p></div>
                <div><p className="text-muted text-xs">House Cut (10%)</p><p className="text-text font-semibold">{fmtCurrency(poolSummary.houseCut)}</p></div>
                <div><p className="text-muted text-xs">To Winners (87% + 3% season)</p><p className="text-text font-semibold">{fmtCurrency(Math.max(0, poolSummary.poolTotal - poolSummary.houseCut))}</p></div>
                <div><p className="text-muted text-xs">Status</p><p className="text-text font-semibold capitalize">{poolSummary.status}</p></div>
                <div><p className="text-muted text-xs">Settled</p><p className="text-text font-semibold">{poolSummary.settledAt ? fmtDay(poolSummary.settledAt) : "—"}</p></div>
              </div>
            ) : (
              <p className="text-sm text-muted">Loading pool summary…</p>
            )}
            <p className="text-[10px] text-faint">
              Gross = everything buyers spent on this week. The 10% house cut is taken at lock; the
              3% season reserve is tagged from the winners&apos; share at lock too, so on-chain a locked
              week holds gross − house cut (87% prizes + 3% reserve).
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Table ────────────────────────────────────────────────────────────────────

interface TableProps {
  title: string;
  subtitle: string;
  rows: ProGameweek[];
  empty: string;
  liveMatchweeks: Record<number, number | null | undefined>;
  isFinance: boolean;
  busy: string | null;
  onOpen: (id: string) => void;
  onPool: (gw: ProGameweek) => void;
  finance?: boolean;
}

function GameweekTable({
  title, subtitle, rows, empty, liveMatchweeks, isFinance, busy, onOpen, onPool, finance,
}: TableProps) {
  const cols = finance
    ? ["Id", "Number", "Window", "Status", "Took In", "House", "To Winners", "Action"]
    : ["Id", "Number", "Opens", "First kickoff", "Status", "Competition", "Action"];

  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-text">{title}</p>
          <p className="text-xs text-muted mt-0.5">{subtitle}</p>
        </div>
        <span className="text-xs font-bold text-muted">{rows.length}</span>
      </div>
      <table className="w-full">
        <thead>
          <tr className="border-b border-border">
            {cols.map((h) => (
              <th key={h} className="px-5 py-3 text-left text-[10px] font-bold text-muted uppercase tracking-wider">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.length === 0 && (
            <tr><td colSpan={cols.length} className="px-5 py-6 text-center text-sm text-muted">{empty}</td></tr>
          )}
          {rows.map((gw) => (
            <tr key={gw._id} className={`hover:bg-surface-2 transition-colors ${gw.isBlackout ? "opacity-70" : ""}`}>
              <td className="px-5 py-4">
                <a href={`/pro/${gw._id}`} className="hover:opacity-80 transition-opacity">
                  <GameweekId id={gw._id} matchweeks={liveMatchweeks} fallback={`#${gw.number}`} />
                </a>
              </td>
              <td className="px-5 py-4 text-sm font-bold text-text">
                <a href={`/pro/${gw._id}`} className="hover:text-primary transition-colors">#{gw.number}</a>
              </td>

              {finance ? (
                <>
                  <td className="px-5 py-4 text-xs text-muted whitespace-nowrap">
                    {fmtDate(gw.firstKickoffAt)}
                  </td>
                  <td className="px-5 py-4"><Badge label={gw.status} variant={STATUS_VARIANT[gw.status]} /></td>
                  <td className="px-5 py-4 text-sm font-semibold text-text">{fmtCurrency(gw.poolTotal ?? 0)}</td>
                  <td className="px-5 py-4 text-sm text-warning">{fmtCurrency(gw.houseCut ?? 0)}</td>
                  <td className="px-5 py-4 text-sm text-success">
                    {fmtCurrency(Math.max(0, (gw.poolTotal ?? 0) - (gw.houseCut ?? 0)))}
                  </td>
                </>
              ) : (
                <>
                  <td className="px-5 py-4 text-sm text-muted">{fmtDate(gw.opensAt)}</td>
                  <td className="px-5 py-4 text-sm text-muted">{gw.firstKickoffAt ? fmtDate(gw.firstKickoffAt) : "—"}</td>
                  <td className="px-5 py-4"><Badge label={gw.status} variant={STATUS_VARIANT[gw.status]} /></td>
                  <td className="px-5 py-4 text-sm text-muted">
                    {gw.isBlackout ? (
                      <span className="text-xs font-bold text-warning bg-warning/10 border border-warning/20 px-2 py-0.5 rounded-lg">International Break</span>
                    ) : (gw.competitionLabel || "—")}
                  </td>
                </>
              )}

              <td className="px-5 py-4">
                <div className="flex items-center gap-2">
                  {gw.status === "upcoming" && !gw.isBlackout && (
                    <button
                      onClick={() => onOpen(gw._id)}
                      disabled={busy === gw._id + "-open"}
                      className="text-xs font-bold text-success bg-success/10 border border-success/20 px-3 py-1.5 rounded-lg hover:bg-success/20 disabled:opacity-50 transition-colors flex items-center gap-1"
                    >
                      {busy === gw._id + "-open" ? <Loader2 size={12} className="animate-spin" /> : <PlayCircle size={12} />} Open
                    </button>
                  )}
                  {(gw.status === "locked" || gw.status === "settling" || gw.status === "settled") && isFinance && (
                    <button
                      onClick={() => onPool(gw)}
                      className="text-xs font-bold text-info bg-info/10 border border-info/20 px-3 py-1.5 rounded-lg hover:bg-info/20 transition-colors flex items-center gap-1"
                    >
                      <Wallet size={12} /> Finance
                    </button>
                  )}
                  <a
                    href={`/pro/${gw._id}`}
                    className="text-xs font-bold text-muted bg-surface-3 border border-border px-3 py-1.5 rounded-lg hover:text-text transition-colors flex items-center gap-1"
                  >
                    Detail <ArrowUpRight size={12} />
                  </a>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {finance && (
        <div className="px-5 py-3 border-t border-border flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-faint">
          <span className="flex items-center gap-1.5"><Clock size={11} /> Window = first kickoff of the week</span>
          <span>Id = greyed slice of the Mongo id + per-league matchweek code</span>
          <span className="flex items-center gap-1">
            {LEAGUE_CODE.map((l) => <span key={l.id} className="font-mono">{l.letter}={l.name.split(" ")[0]}</span>)}
          </span>
        </div>
      )}
    </div>
  );
}
