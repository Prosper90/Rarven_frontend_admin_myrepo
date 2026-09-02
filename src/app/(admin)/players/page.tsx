"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { adminApi, Player, ApiFootballSuggestion, ApiTeam, ApiSquadPlayer } from "@/lib/api";
import { getAdminInfo } from "@/lib/auth";
import Badge from "@/components/Badge";
import Modal from "@/components/Modal";
import {
  Search,
  Loader2,
  ChevronDown,
  ArrowLeft,
  X,
  Check,
  AlertTriangle,
  Download,
  Upload,
} from "lucide-react";

const POSITIONS = ["GK","LB","CB","RB","DM","LM","AM","CAM","RM","LW","RW","ST"];
const LEAGUES   = ["Premier League","La Liga","Serie A","Bundesliga","Ligue 1","Champions League","Others"];

// API-Football league IDs (free plan requires league param alongside search)
const API_LEAGUES = [
  { id: 39,  name: "Premier League"   },
  { id: 140, name: "La Liga"          },
  { id: 135, name: "Serie A"          },
  { id: 78,  name: "Bundesliga"       },
  { id: 61,  name: "Ligue 1"          },
  { id: 2,   name: "Champions League" },
  { id: 3,   name: "Europa League"    },
  { id: 88,  name: "Eredivisie"       },
  { id: 94,  name: "Primeira Liga"    },
  { id: 253, name: "MLS"              },
];

const EMPTY_FORM = {
  name: "", shortName: "", position: "ST", club: "", league: "Premier League",
  nationality: "", preferredFoot: "Right", rvRating: 75,
  seasonStats: { appearances: 0, goals: 0, assists: 0, cleanSheets: 0, avgRating: 7.0 },
};

// Used only in the edit/create form to show calculated Pro listing price
function fmtCurrency(n: number) { return "₦" + n.toLocaleString(); }

// ── Player thumbnail (photo → initials fallback) ─────────────────────────────

function PlayerThumb({ player }: { player: Player }) {
  const [err, setErr] = useState(false);
  const initials = player.shortName.split(" ").map((n) => n[0]).join("").slice(0, 2);
  return (
    <div className="w-8 h-8 rounded-lg bg-surface-3 border border-border flex items-center justify-center text-xs font-black text-muted overflow-hidden shrink-0">
      {player.imageUrl && !err
        ? <img src={player.imageUrl} alt={player.shortName} className="w-full h-full object-cover" onError={() => setErr(true)} />
        : initials
      }
    </div>
  );
}

// ── API-Football suggestion row ───────────────────────────────────────────────

function SuggestionRow({
  s,
  onSelect,
}: {
  s: ApiFootballSuggestion;
  onSelect: (s: ApiFootballSuggestion) => void;
}) {
  const [imgErr, setImgErr] = useState(false);
  const initials = s.name.split(" ").slice(-1)[0]?.slice(0, 2).toUpperCase() ?? "??";

  return (
    <button
      type="button"
      onClick={() => onSelect(s)}
      className="flex items-center gap-3 w-full px-4 py-2.5 hover:bg-surface-3 transition-colors text-left"
    >
      <div className="w-9 h-9 rounded-lg bg-surface-3 border border-border flex items-center justify-center overflow-hidden shrink-0 text-[10px] font-black text-muted">
        {s.photo && !imgErr
          ? <img src={s.photo} alt={s.name} className="w-full h-full object-cover" onError={() => setImgErr(true)} />
          : initials
        }
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-text truncate">{s.name}</p>
        <p className="text-[10px] text-muted truncate">{s.club} · {s.league}</p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-[10px] font-bold text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded">{s.position}</span>
        <span className="text-[10px] text-faint">{s.nationality}</span>
      </div>
    </button>
  );
}

// ── Shared: squad display + import (used in both Import and Find-Team sections)─

function SquadImporter({ squad, existingPlayers, selected, setSelected, teamName, leagueName, onImport, importing, result, error }: {
  squad:           ApiSquadPlayer[];
  existingPlayers: Player[];
  selected:        Set<number>;
  setSelected:     React.Dispatch<React.SetStateAction<Set<number>>>;
  teamName:        string;
  leagueName:      string;
  onImport:        () => void;
  importing:       boolean;
  result:          { imported: number; skipped: number; skippedList: { name: string; reason: string }[] } | null;
  error:           string;
}) {
  const existingIds   = new Set(existingPlayers.map((p) => p.apiFootballId).filter(Boolean));
  const existingNames = new Set(existingPlayers.map((p) => p.name.toLowerCase()));
  const isIn = (p: ApiSquadPlayer) => existingIds.has(p.apiFootballId) || existingNames.has(p.name.toLowerCase());

  const newCount = squad.filter((p) => !isIn(p)).length;
  const selCount = selected.size;

  function selectAllNew() {
    const s = new Set<number>();
    squad.forEach((p) => { if (!isIn(p)) s.add(p.apiFootballId); });
    setSelected(s);
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-xs text-danger bg-danger/10 border border-danger/20 rounded-lg px-3 py-2">{error}</p>}

      {result && (
        <div className="flex items-start gap-3 px-4 py-3 bg-success/5 border border-success/20 rounded-xl">
          <Check size={16} className="text-success shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-text">
              Imported {result.imported} player{result.imported !== 1 ? "s" : ""}
              {result.skipped > 0 && <span className="text-muted font-normal"> · {result.skipped} skipped</span>}
            </p>
            {result.skippedList.length > 0 && (
              <p className="text-[11px] text-muted mt-0.5">Skipped: {result.skippedList.map((s) => s.name).join(", ")}</p>
            )}
            <p className="text-[11px] text-muted mt-1">All imported at RV Rating 60 — edit in Roster tab.</p>
          </div>
        </div>
      )}

      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-text">{teamName}</p>
            <span className="text-[10px] text-muted">{squad.length} players · {newCount} new</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={selectAllNew} className="text-xs text-primary hover:underline font-semibold">Select all new</button>
            <span className="text-faint">·</span>
            <button onClick={() => setSelected(new Set())} className="text-xs text-muted hover:text-text">None</button>
          </div>
        </div>

        <div className="divide-y divide-border max-h-80 overflow-y-auto">
          {squad.map((p) => {
            const alreadyIn = isIn(p);
            return (
              <label key={p.apiFootballId} className={`flex items-center gap-3 px-5 py-3 transition-colors ${alreadyIn ? "opacity-50 cursor-default" : "hover:bg-surface-2 cursor-pointer"}`}>
                <input type="checkbox" checked={selected.has(p.apiFootballId)} disabled={alreadyIn}
                  onChange={() => !alreadyIn && setSelected((prev) => { const n = new Set(prev); n.has(p.apiFootballId) ? n.delete(p.apiFootballId) : n.add(p.apiFootballId); return n; })}
                  className="w-4 h-4 rounded accent-primary shrink-0" />
                <div className="w-8 h-8 rounded-lg bg-surface-3 border border-border flex items-center justify-center overflow-hidden shrink-0 text-[10px] font-black text-muted">
                  {p.photo ? <img src={p.photo} alt={p.name} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                           : p.name.split(" ").slice(-1)[0]?.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-text truncate">{p.name}</p>
                  <p className="text-[10px] text-muted">{p.number ? `#${p.number} · ` : ""}{p.age} yrs</p>
                </div>
                <span className="text-[10px] font-bold text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded shrink-0">{p.position}</span>
                {alreadyIn && <span className="text-[10px] text-success bg-success/10 border border-success/20 px-2 py-0.5 rounded-full font-semibold shrink-0">In DB</span>}
              </label>
            );
          })}
        </div>

        <div className="px-5 py-4 border-t border-border flex items-center justify-between">
          <p className="text-xs text-muted">{selCount} player{selCount !== 1 ? "s" : ""} selected</p>
          <button onClick={onImport} disabled={selCount === 0 || importing}
            className="px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-bold disabled:opacity-50 hover:bg-primary-dim transition-colors flex items-center gap-2">
            {importing ? <><Loader2 size={14} className="animate-spin" />Importing…</> : `Import ${selCount} Player${selCount !== 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Bulk Import Tab (superadmin only) ─────────────────────────────────────────

function BulkImportTab({ existingPlayers, onImportDone }: {
  existingPlayers: Player[];
  onImportDone:    () => void;
}) {
  const [subTab, setSubTab] = useState<"import" | "find-team" | "remove-team">("import");

  // ── Import Squad state ──────────────────────────────────────────────────────
  const [leagueId,    setLeagueId]   = useState(39);
  const [teams,       setTeams]      = useState<ApiTeam[]>([]);
  const [teamId,      setTeamId]     = useState<number | null>(null);
  const [teamName,    setTeamName]   = useState("");
  const [squad,       setSquad]      = useState<ApiSquadPlayer[]>([]);
  const [selected,    setSelected]   = useState<Set<number>>(new Set());
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [loadingSquad, setLoadingSquad] = useState(false);
  const [importing,    setImporting]   = useState(false);
  const [importError,  setImportError] = useState("");
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; skippedList: { name: string; reason: string }[] } | null>(null);

  // ── Find Team state ─────────────────────────────────────────────────────────
  const [findQuery,    setFindQuery]   = useState("");
  const [findTeams,    setFindTeams]   = useState<ApiTeam[]>([]);
  const [findSearching, setFindSearching] = useState(false);
  const [findTeamId,   setFindTeamId]  = useState<number | null>(null);
  const [findTeamName, setFindTeamName] = useState("");
  const [findLeague,   setFindLeague]  = useState("");
  const [findSquad,    setFindSquad]   = useState<ApiSquadPlayer[]>([]);
  const [findSelected, setFindSelected] = useState<Set<number>>(new Set());
  const [findLoadingSquad, setFindLoadingSquad] = useState(false);
  const [findImporting,    setFindImporting]    = useState(false);
  const [findError,    setFindError]   = useState("");
  const [findResult,   setFindResult]  = useState<{ imported: number; skipped: number; skippedList: { name: string; reason: string }[] } | null>(null);
  const findDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Remove Team state — clubs come from the DB, not the API ─────────────────
  const [rmClubs,     setRmClubs]    = useState<string[]>([]);
  const [rmClubName,  setRmClubName] = useState("");
  const [rmLoading,   setRmLoading]  = useState(false);
  const [rmRemoving,  setRmRemoving] = useState(false);
  const [rmError,     setRmError]    = useState("");
  const [rmResult,    setRmResult]   = useState<number | null>(null);
  const [rmConfirm,   setRmConfirm]  = useState(false);

  // Count players in the DB for the selected club (exact match — names came from DB)
  const rmCount = rmClubName
    ? existingPlayers.filter((p) => p.club === rmClubName).length
    : 0;

  // ── Import Squad helpers ────────────────────────────────────────────────────

  async function loadTeams(id: number) {
    setLeagueId(id); setTeamId(null); setTeamName(""); setSquad([]); setSelected(new Set()); setImportResult(null); setImportError("");
    setLoadingTeams(true);
    try { const r = await adminApi.listTeamsFromApi(id); setTeams(r.teams ?? []); }
    catch (e: unknown) { setImportError(e instanceof Error ? e.message : "Failed to load teams"); setTeams([]); }
    finally { setLoadingTeams(false); }
  }

  async function loadSquad(id: number, name: string) {
    setTeamId(id); setTeamName(name); setSquad([]); setSelected(new Set()); setImportResult(null); setImportError("");
    setLoadingSquad(true);
    try {
      const r = await adminApi.getSquadFromApi(id);
      const players = r.players ?? [];
      setSquad(players);
      const existingIds   = new Set(existingPlayers.map((p) => p.apiFootballId).filter(Boolean));
      const existingNames = new Set(existingPlayers.map((p) => p.name.toLowerCase()));
      const s = new Set<number>();
      players.forEach((p) => { if (!existingIds.has(p.apiFootballId) && !existingNames.has(p.name.toLowerCase())) s.add(p.apiFootballId); });
      setSelected(s);
    } catch (e: unknown) { setImportError(e instanceof Error ? e.message : "Failed to load squad"); }
    finally { setLoadingSquad(false); }
  }

  async function handleImport() {
    if (!teamId || selected.size === 0) return;
    setImporting(true); setImportError(""); setImportResult(null);
    try {
      const leagueName = API_LEAGUES.find((l) => l.id === leagueId)?.name ?? "Others";
      const toImport = squad.filter((p) => selected.has(p.apiFootballId))
        .map((p) => ({ apiFootballId: p.apiFootballId, name: p.name, position: p.position, photo: p.photo }));
      const res = await adminApi.bulkImportPlayers(toImport, leagueName, teamName);
      setImportResult({ imported: res.imported, skipped: res.skipped, skippedList: res.details?.skipped ?? [] });
      setSelected(new Set());
      onImportDone();
    } catch (e: unknown) { setImportError(e instanceof Error ? e.message : "Import failed"); }
    finally { setImporting(false); }
  }

  // ── Find Team helpers ───────────────────────────────────────────────────────

  function handleFindQueryChange(value: string) {
    setFindQuery(value);
    setFindTeams([]);
    setFindTeamId(null);
    setFindSquad([]);
    setFindResult(null);
    if (findDebounce.current) clearTimeout(findDebounce.current);
    if (value.length >= 2) {
      setFindSearching(true);
      findDebounce.current = setTimeout(async () => {
        try { const r = await adminApi.searchTeamsFromApi(value); setFindTeams(r.teams ?? []); }
        catch (e: unknown) { setFindError(e instanceof Error ? e.message : "Search failed"); }
        finally { setFindSearching(false); }
      }, 500);
    }
  }

  async function loadFindSquad(id: number, name: string, league: string) {
    setFindTeamId(id); setFindTeamName(name); setFindLeague(league); setFindSquad([]); setFindSelected(new Set()); setFindResult(null); setFindError("");
    setFindLoadingSquad(true);
    try {
      const r = await adminApi.getSquadFromApi(id);
      const players = r.players ?? [];
      setFindSquad(players);
      const existingIds   = new Set(existingPlayers.map((p) => p.apiFootballId).filter(Boolean));
      const existingNames = new Set(existingPlayers.map((p) => p.name.toLowerCase()));
      const s = new Set<number>();
      players.forEach((p) => { if (!existingIds.has(p.apiFootballId) && !existingNames.has(p.name.toLowerCase())) s.add(p.apiFootballId); });
      setFindSelected(s);
    } catch (e: unknown) { setFindError(e instanceof Error ? e.message : "Failed to load squad"); }
    finally { setFindLoadingSquad(false); }
  }

  async function handleFindImport() {
    if (!findTeamId || findSelected.size === 0) return;
    setFindImporting(true); setFindError(""); setFindResult(null);
    try {
      const leagueName = findLeague || "Others";
      const toImport = findSquad.filter((p) => findSelected.has(p.apiFootballId))
        .map((p) => ({ apiFootballId: p.apiFootballId, name: p.name, position: p.position, photo: p.photo }));
      const res = await adminApi.bulkImportPlayers(toImport, leagueName, findTeamName);
      setFindResult({ imported: res.imported, skipped: res.skipped, skippedList: res.details?.skipped ?? [] });
      setFindSelected(new Set());
      onImportDone();
    } catch (e: unknown) { setFindError(e instanceof Error ? e.message : "Import failed"); }
    finally { setFindImporting(false); }
  }

  // ── Remove Team helpers ─────────────────────────────────────────────────────

  async function loadRmClubs() {
    setRmLoading(true); setRmError("");
    try { const r = await adminApi.listDbClubs(); setRmClubs(r.clubs ?? []); }
    catch (e: unknown) { setRmError(e instanceof Error ? e.message : "Failed to load clubs"); }
    finally { setRmLoading(false); }
  }

  async function handleRemove() {
    if (!rmClubName) return;
    setRmRemoving(true); setRmError(""); setRmResult(null);
    try {
      const res = await adminApi.deleteTeamPlayers(rmClubName);
      setRmResult(res.deleted);
      setRmConfirm(false);
      setRmClubName("");
      onImportDone();
    } catch (e: unknown) { setRmError(e instanceof Error ? e.message : "Failed"); }
    finally { setRmRemoving(false); }
  }

  // Load teams + clubs on first render
  useEffect(() => { loadTeams(39); loadRmClubs(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col gap-5">
      {/* Sub-tab bar */}
      <div className="flex gap-1 bg-surface-2 border border-border rounded-xl p-1 w-fit">
        {([
          { id: "import",      label: "Import Squad"     },
          { id: "find-team",   label: "Find & Add Team"  },
          { id: "remove-team", label: "Remove Team"      },
        ] as const).map((t) => (
          <button key={t.id} onClick={() => setSubTab(t.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${subTab === t.id ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Import Squad ── */}
      {subTab === "import" && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted uppercase tracking-wider">League</label>
              <select value={leagueId} onChange={(e) => loadTeams(parseInt(e.target.value))}
                className="bg-surface border border-border rounded-xl px-4 py-2.5 text-sm text-text outline-none focus:border-primary/50 [color-scheme:dark]">
                {API_LEAGUES.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted uppercase tracking-wider">
                Team {loadingTeams && <span className="text-faint font-normal normal-case">(loading…)</span>}
              </label>
              <select value={teamId ?? ""} disabled={teams.length === 0}
                onChange={(e) => { const id = parseInt(e.target.value); loadSquad(id, teams.find((t) => t.id === id)?.name ?? ""); }}
                className="bg-surface border border-border rounded-xl px-4 py-2.5 text-sm text-text outline-none focus:border-primary/50 disabled:opacity-50 [color-scheme:dark]">
                <option value="">— pick a team —</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>
          {loadingSquad && <p className="text-center py-10 text-sm text-muted">Loading squad…</p>}
          {!loadingSquad && squad.length > 0 && (
            <SquadImporter squad={squad} existingPlayers={existingPlayers} selected={selected} setSelected={setSelected}
              teamName={teamName} leagueName={API_LEAGUES.find((l) => l.id === leagueId)?.name ?? "Others"}
              onImport={handleImport} importing={importing} result={importResult} error={importError} />
          )}
          {!loadingSquad && !teamId && teams.length > 0 && (
            <p className="text-sm text-muted text-center py-10">Select a team above to see their squad.</p>
          )}
        </div>
      )}

      {/* ── Find & Add Team ── */}
      {subTab === "find-team" && (
        <div className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-semibold text-muted uppercase tracking-wider block mb-1.5">Search Team by Name</label>
            <p className="text-[11px] text-faint mb-3">For promoted clubs or teams not in the league list — type their name to find them.</p>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-3.5 text-faint pointer-events-none" />
              <input value={findQuery} onChange={(e) => handleFindQueryChange(e.target.value)}
                placeholder="e.g. Leicester City, Ipswich Town…"
                className="w-full bg-surface-2 border border-border rounded-xl pl-9 pr-10 py-3 text-sm text-text outline-none focus:border-primary/50 placeholder:text-faint" />
              {findSearching && (
                <Loader2 size={14} className="absolute right-3 top-3.5 animate-spin text-muted" />
              )}
            </div>
            {findError && <p className="text-[11px] text-danger mt-1.5">{findError}</p>}
          </div>

          {/* Team results */}
          {!findSearching && findTeams.length > 0 && !findTeamId && (
            <div className="bg-surface border border-border rounded-2xl overflow-hidden divide-y divide-border">
              {findTeams.map((t) => (
                <button key={t.id} onClick={() => loadFindSquad(t.id, t.name, "")}
                  className="flex items-center gap-3 w-full px-4 py-3 hover:bg-surface-2 transition-colors text-left">
                  {t.logo && <img src={t.logo} alt={t.name} className="w-6 h-6 object-contain shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />}
                  <span className="text-sm font-semibold text-text">{t.name}</span>
                  <span className="text-xs text-muted ml-auto">Load squad →</span>
                </button>
              ))}
            </div>
          )}

          {findLoadingSquad && <p className="text-center py-10 text-sm text-muted">Loading squad…</p>}

          {!findLoadingSquad && findSquad.length > 0 && (
            <>
              <button onClick={() => { setFindTeamId(null); setFindSquad([]); }}
                className="text-xs text-muted hover:text-text flex items-center gap-1">
                <ArrowLeft size={13} /> Back to search results
              </button>
              <SquadImporter squad={findSquad} existingPlayers={existingPlayers} selected={findSelected} setSelected={setFindSelected}
                teamName={findTeamName} leagueName={findLeague || "Others"}
                onImport={handleFindImport} importing={findImporting} result={findResult} error={findError} />
            </>
          )}
        </div>
      )}

      {/* ── Remove Team ── */}
      {subTab === "remove-team" && (
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-[11px] text-faint mb-1">
              Permanently deletes all players from a club — use after relegation or squad overhaul.
              This action cannot be undone.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-muted uppercase tracking-wider">
              Club {rmLoading && <span className="text-faint font-normal normal-case">(loading…)</span>}
            </label>
            <select
              value={rmClubName}
              disabled={rmLoading || rmClubs.length === 0}
              onChange={(e) => { setRmClubName(e.target.value); setRmConfirm(false); setRmResult(null); setRmError(""); }}
              className="bg-surface border border-border rounded-xl px-4 py-2.5 text-sm text-text outline-none focus:border-primary/50 disabled:opacity-50 [color-scheme:dark]"
            >
              <option value="">— pick a club —</option>
              {rmClubs.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            {!rmLoading && rmClubs.length === 0 && (
              <p className="text-[11px] text-faint">No clubs found in DB.</p>
            )}
          </div>

          {rmError && <p className="text-xs text-danger bg-danger/10 border border-danger/20 rounded-lg px-3 py-2">{rmError}</p>}

          {rmResult !== null && (
            <div className="flex items-center gap-2 px-4 py-3 bg-success/5 border border-success/20 rounded-xl">
              <Check size={15} className="text-success shrink-0" />
              <p className="text-sm text-text">Deleted <strong>{rmResult}</strong> player{rmResult !== 1 ? "s" : ""} from the roster.</p>
            </div>
          )}

          {rmClubName && rmResult === null && (
            <div className="flex flex-col gap-3 p-4 bg-danger/5 border border-danger/20 rounded-xl">
              <p className="text-sm text-text">
                <strong>{rmClubName}</strong> has <strong>{rmCount}</strong> player{rmCount !== 1 ? "s" : ""} in your roster.
                {rmCount === 0 && " (none to delete)"}
              </p>
              {rmCount > 0 && !rmConfirm && (
                <button
                  onClick={() => setRmConfirm(true)}
                  className="self-start px-4 py-2 rounded-xl bg-danger text-white text-sm font-bold hover:opacity-90 transition-opacity"
                >
                  Delete all {rmCount} players
                </button>
              )}
              {rmConfirm && (
                <div className="flex items-center gap-3 flex-wrap">
                  <p className="text-xs text-danger font-semibold flex items-center gap-1.5"><AlertTriangle size={12} />This permanently deletes all {rmCount} players. Are you sure?</p>
                  <button
                    onClick={handleRemove}
                    disabled={rmRemoving}
                    className="px-4 py-2 rounded-xl bg-danger text-white text-xs font-bold disabled:opacity-50 hover:opacity-90 transition-opacity flex items-center gap-1.5"
                  >
                    {rmRemoving ? (
                      <><Loader2 size={12} className="animate-spin" />Deleting…</>
                    ) : "Yes, delete permanently"}
                  </button>
                  <button onClick={() => setRmConfirm(false)} className="text-xs text-muted hover:text-text">Cancel</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PlayersPage() {
  const [tab, setTab]             = useState<"roster" | "bulk">("roster");
  const [adminRole, setAdminRole] = useState<string | null>(null);

  const [players, setPlayers]     = useState<Player[]>([]);
  const [search, setSearch]       = useState("");
  const [posFilter, setPosFilter] = useState("ALL");
  const [clubFilter, setClubFilter] = useState("");
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [metricsProgress, setMetricsProgress] = useState<{ total: number; withRealStats: number } | null>(null);

  // Read role client-side only (localStorage)
  useEffect(() => { setAdminRole(getAdminInfo()?.role ?? null); }, []);

  const [modal, setModal]   = useState<"create" | "edit" | null>(null);
  const [form, setForm]     = useState(EMPTY_FORM);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // API-Football search state (only used in "create" mode)
  const [apiQuery, setApiQuery]             = useState("");
  const [apiLeagueId, setApiLeagueId]       = useState<number>(39); // default: Premier League
  const [apiSuggestions, setApiSuggestions] = useState<ApiFootballSuggestion[]>([]);
  const [apiSearching, setApiSearching]     = useState(false);
  const [apiError, setApiError]             = useState("");
  const [apiSelected, setApiSelected]       = useState<ApiFootballSuggestion | null>(null);
  const [manualMode, setManualMode]         = useState(false);  // skip search, go straight to form
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [apiFootballId, setApiFootballId]   = useState<number | null>(null);

  // Image upload state
  const [imageFile, setImageFile]               = useState<File | null>(null);
  const [imagePreview, setImagePreview]         = useState<string | null>(null);
  const [currentImageUrl, setCurrentImageUrl]   = useState<string | null>(null);
  const [uploading, setUploading]               = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { load(); loadProgress(); }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await adminApi.listPlayers();
      setPlayers(res.players ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally { setLoading(false); }
  }

  async function loadProgress() {
    try {
      const res = await adminApi.getMetricsProgress();
      setMetricsProgress({ total: res.total, withRealStats: res.withRealStats });
    } catch { /* non-critical — leave last known value */ }
  }

  // ── Search debounce ────────────────────────────────────────────────────────

  const doApiSearch = useCallback(async (q: string, leagueId: number) => {
    if (q.length < 3) { setApiSuggestions([]); setApiSearching(false); return; }
    setApiSearching(true);
    setApiError("");
    try {
      const res = await adminApi.searchPlayersApi(q, leagueId);
      setApiSuggestions(res.players ?? []);
    } catch (e: unknown) {
      setApiError(e instanceof Error ? e.message : "Search failed");
      setApiSuggestions([]);
    } finally {
      setApiSearching(false);
    }
  }, []);

  function handleApiQueryChange(value: string) {
    setApiQuery(value);
    setApiSuggestions([]);
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    if (value.length >= 3) {
      setApiSearching(true);
      searchDebounce.current = setTimeout(() => doApiSearch(value, apiLeagueId), 500);
    } else {
      setApiSearching(false);
    }
  }

  function handleLeagueChange(id: number) {
    setApiLeagueId(id);
    setApiSuggestions([]);
    // Re-run search immediately with new league if query is long enough
    if (apiQuery.length >= 3) {
      if (searchDebounce.current) clearTimeout(searchDebounce.current);
      setApiSearching(true);
      searchDebounce.current = setTimeout(() => doApiSearch(apiQuery, id), 300);
    }
  }

  // ── Suggestion selected ────────────────────────────────────────────────────

  function handleSelectSuggestion(s: ApiFootballSuggestion) {
    setApiSelected(s);
    setApiSuggestions([]);
    setApiFootballId(s.apiFootballId);

    // Pre-fill the form (admin only needs to set RV Rating)
    setForm({
      name:          s.name,
      shortName:     s.name.split(" ").slice(-1)[0] ?? s.name,   // default: last name
      position:      s.position,
      club:          s.club,
      league:        LEAGUES.includes(s.league) ? s.league : "Others",
      nationality:   s.nationality,
      preferredFoot: "Right",  // not available from API — admin can change
      rvRating:    75,       // always manual
      seasonStats: {
        appearances: s.seasonStats.appearances,
        goals:       s.seasonStats.goals,
        assists:     s.seasonStats.assists,
        cleanSheets: 0,        // API-Football doesn't separate clean sheets by player here
        avgRating:   s.seasonStats.avgRating,
      },
    });

    // Show the API-Football photo as preview (can be overridden by custom upload)
    if (s.photo) {
      setImagePreview(s.photo);
      setImageFile(null); // it's a URL, not a File — will be saved as imageUrl directly
    }
  }

  function clearSelection() {
    setApiSelected(null);
    setApiQuery("");
    setApiSuggestions([]);
    setApiFootballId(null);
    setForm(EMPTY_FORM);
    setImagePreview(null);
    setImageFile(null);
  }

  // ── Modal open helpers ─────────────────────────────────────────────────────

  function openCreate() {
    setForm(EMPTY_FORM);
    setEditId(null);
    setImageFile(null);
    setImagePreview(null);
    setCurrentImageUrl(null);
    setApiQuery("");
    setApiLeagueId(39); // default to Premier League
    setApiSuggestions([]);
    setApiSearching(false);
    setApiError("");
    setApiSelected(null);
    setApiFootballId(null);
    setManualMode(false);
    setError("");
    setModal("create");
  }

  function openEdit(p: Player) {
    setForm({
      name: p.name, shortName: p.shortName, position: p.position,
      club: p.club, league: p.league, nationality: p.nationality,
      preferredFoot: p.preferredFoot, rvRating: p.rvRating,
      seasonStats: p.seasonStats,
    });
    setEditId(p._id);
    setImageFile(null);
    setImagePreview(null);
    setCurrentImageUrl(p.imageUrl);
    setApiFootballId(p.apiFootballId);
    setApiSelected(null);
    setManualMode(true);  // edit always shows form directly
    setError("");
    setModal("edit");
  }

  // ── Image pick ─────────────────────────────────────────────────────────────

  function handleImagePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  function clearImage() {
    setImageFile(null);
    setImagePreview(null);
    // If an API suggestion was selected, restore the API photo as preview
    if (apiSelected?.photo) setImagePreview(apiSelected.photo);
    if (fileRef.current) fileRef.current.value = "";
  }

  // ── Save ───────────────────────────────────────────────────────────────────

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      let savedId = editId;

      // imageUrl for API-Football photo (not a File upload, just a URL to store)
      const apiPhotoUrl =
        !imageFile && apiSelected?.photo ? apiSelected.photo : undefined;

      const payload = {
        ...form,
        apiFootballId: apiFootballId ?? null,
        ...(apiPhotoUrl ? { imageUrl: apiPhotoUrl } : {}),
      };

      if (modal === "create") {
        const res = await adminApi.createPlayer(payload);
        savedId = res.player._id;
      } else if (modal === "edit" && editId) {
        await adminApi.updatePlayer(editId, payload);
      }

      // If a custom file was picked, upload it to Cloudinary (overrides imageUrl)
      if (imageFile && savedId) {
        setUploading(true);
        try {
          await adminApi.uploadPlayerImage(savedId, imageFile);
        } catch (imgErr: unknown) {
          setError(`Player saved but image upload failed: ${imgErr instanceof Error ? imgErr.message : "Unknown error"}`);
          setUploading(false);
          setSaving(false);
          load();
          return;
        }
        setUploading(false);
      }

      setModal(null);
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally { setSaving(false); }
  }

  async function handleDeactivate(id: string) {
    if (!confirm("Deactivate this player?")) return;
    try {
      await adminApi.deletePlayer(id);
      load();
    } catch (e: unknown) { alert(e instanceof Error ? e.message : "Failed"); }
  }

  async function handleUpdateInfo(id: string) {
    setRefreshingId(id);
    try {
      await adminApi.refreshPlayerMetrics(id);
      load();
      loadProgress();
    } catch (e: unknown) { alert(e instanceof Error ? e.message : "Failed"); }
    finally { setRefreshingId(null); }
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const basePrice     = Math.max(0, (form.rvRating - 60) * 150);
  const displayPreview = imagePreview ?? currentImageUrl ?? null;
  const showSuggestions = !apiSelected && apiSuggestions.length > 0;
  const showSearchSection = modal === "create" && !manualMode;
  const showForm = modal === "edit" || manualMode || apiSelected;

  // Sorted unique clubs from the loaded roster
  const clubs = Array.from(new Set(players.map((p) => p.club))).sort((a, b) => a.localeCompare(b));

  const filtered = players.filter((p) => {
    const matchSearch = search === "" || p.name.toLowerCase().includes(search.toLowerCase());
    const matchPos    = posFilter === "ALL" || p.position === posFilter;
    const matchClub   = clubFilter === "" || p.club === clubFilter;
    return matchSearch && matchPos && matchClub;
  });

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-8 flex flex-col gap-6">
      {/* ── Page header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-text">Players</h1>
          <p className="text-sm text-muted mt-0.5">{players.filter((p) => p.isActive).length} active players in roster</p>
        </div>
        {tab === "roster" && (
          <button onClick={openCreate} className="px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-dim transition-colors">
            + Add Player
          </button>
        )}
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 bg-surface-2 border border-border rounded-xl p-1 w-fit">
        <button
          onClick={() => setTab("roster")}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === "roster" ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text"}`}
        >
          Roster
        </button>
        {adminRole === "superadmin" && (
          <button
            onClick={() => setTab("bulk")}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-1.5 ${tab === "bulk" ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text"}`}
          >
            <Download size={14} />
            Bulk Import
            <span className="text-[9px] bg-primary/15 text-primary border border-primary/20 px-1.5 py-0.5 rounded font-bold uppercase tracking-wide">Super</span>
          </button>
        )}
      </div>

      {/* ── Bulk Import tab ── */}
      {tab === "bulk" && adminRole === "superadmin" && (
        <BulkImportTab existingPlayers={players} onImportDone={load} />
      )}

      {/* ── Roster tab ── */}
      {tab === "roster" && (<>

      {/* Season-stats coverage — the resumable team-batched refresh (Pro
          admin page's "Recalculate Pricing") is what actually advances this;
          shown here too since this is the page admins actually manage
          players from. */}
      {metricsProgress && (
        <div className="rounded-xl bg-surface border border-border px-4 py-3 flex items-center gap-4">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-semibold text-text">
                {metricsProgress.withRealStats.toLocaleString()} / {metricsProgress.total.toLocaleString()} players have real season stats
              </p>
              <span className="text-[11px] text-muted">
                {Math.round((metricsProgress.withRealStats / Math.max(metricsProgress.total, 1)) * 100)}%
              </span>
            </div>
            <div className="w-full h-1.5 bg-surface-3 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${Math.min((metricsProgress.withRealStats / Math.max(metricsProgress.total, 1)) * 100, 100)}%` }}
              />
            </div>
          </div>
          <a
            href="/pro"
            className="shrink-0 text-xs font-semibold text-primary hover:underline whitespace-nowrap"
            title="Free API tier — click Recalculate Pricing repeatedly to keep making progress"
          >
            Recalculate on Pro page →
          </a>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-3">
        {/* Row 1 — text search + club dropdown */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex items-center">
            <Search size={14} className="absolute left-3 text-faint pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search player name…"
              className="bg-surface border border-border rounded-xl pl-9 pr-4 py-2.5 text-sm text-text outline-none focus:border-primary/50 placeholder:text-faint w-56"
            />
          </div>

          {/* Club / team picker */}
          <div className="relative flex items-center">
            <select
              value={clubFilter}
              onChange={(e) => setClubFilter(e.target.value)}
              className="bg-surface border border-border rounded-xl pl-4 pr-8 py-2.5 text-sm text-text outline-none focus:border-primary/50 [color-scheme:dark] appearance-none cursor-pointer"
            >
              <option value="">All teams</option>
              {clubs.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-muted" />
          </div>

          {/* Active filter chips */}
          {clubFilter && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-xs font-semibold text-primary">
              {clubFilter}
              <button onClick={() => setClubFilter("")} className="ml-1 text-primary/60 hover:text-primary leading-none">
                <X size={11} />
              </button>
            </div>
          )}

          {/* Result count when filtering */}
          {(search || clubFilter || posFilter !== "ALL") && (
            <p className="text-xs text-muted ml-auto">
              {filtered.length} player{filtered.length !== 1 ? "s" : ""}
            </p>
          )}
        </div>

        {/* Row 2 — position pills */}
        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => setPosFilter("ALL")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${posFilter === "ALL" ? "bg-primary/10 border-primary/30 text-primary" : "bg-surface border-border text-muted hover:text-text"}`}
          >
            All positions
          </button>
          {POSITIONS.map((pos) => (
            <button
              key={pos}
              onClick={() => setPosFilter(pos === posFilter ? "ALL" : pos)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${posFilter === pos ? "bg-primary/10 border-primary/30 text-primary" : "bg-surface border-border text-muted hover:text-text"}`}
            >
              {pos}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-xs text-danger bg-danger/10 border border-danger/20 rounded-lg px-3 py-2">{error}</p>}

      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {["Player", "Pos", "Club", "League", "RV Rating", "Status", "Actions"].map((h) => (
                <th key={h} className="px-5 py-3 text-left text-[10px] font-bold text-muted uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading && <tr><td colSpan={7} className="px-5 py-8 text-center text-sm text-muted">Loading…</td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={7} className="px-5 py-8 text-center text-sm text-muted">No players found.</td></tr>}
            {filtered.map((p) => (
              <tr key={p._id} className="hover:bg-surface-2 transition-colors">
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <PlayerThumb player={p} />
                    <div>
                      <p className="text-sm font-semibold text-text">{p.name}</p>
                      <p className="text-[10px] text-muted">{p.nationality}</p>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-4">
                  <span className="text-[10px] font-bold text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded">{p.position}</span>
                </td>
                <td className="px-5 py-4 text-sm text-muted">{p.club}</td>
                <td className="px-5 py-4 text-xs text-faint">{p.league}</td>
                <td className="px-5 py-4 text-sm font-bold text-primary">{p.rvRating}</td>
                <td className="px-5 py-4">
                  <Badge label={p.isActive ? "active" : "inactive"} variant={p.isActive ? "success" : "neutral"} />
                </td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <button onClick={() => openEdit(p)} className="text-xs text-info hover:underline font-semibold">Edit</button>
                    {p.apiFootballId && (
                      <button
                        onClick={() => handleUpdateInfo(p._id)}
                        disabled={refreshingId === p._id}
                        className="text-xs text-primary hover:underline font-semibold disabled:opacity-50"
                        title="Fetch this player's real season stats from api-football (1 request)"
                      >
                        {refreshingId === p._id ? "Updating…" : "Update Info"}
                      </button>
                    )}
                    {p.isActive && (
                      <button onClick={() => handleDeactivate(p._id)} className="text-xs text-danger hover:underline">Deactivate</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      </>)} {/* end roster tab */}

      {/* ── Create / Edit modal ────────────────────────────────────────────── */}
      {modal && (
        <Modal
          title={modal === "create" ? "Add Player" : "Edit Player"}
          onClose={() => setModal(null)}
          width="max-w-2xl"
        >
          {/* ── API-Football search (create mode only, before selection) ── */}
          {showSearchSection && (
            <div className="flex flex-col gap-3">
              <div>
                <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
                  Search API-Football
                </p>
                <p className="text-[11px] text-faint mb-3">
                  Select a league, then type the player name — club, nationality and season stats fill automatically.
                  RV Rating must always be set manually.
                </p>

                {/* League selector */}
                <div className="mb-2">
                  <label className="text-[10px] font-semibold text-muted uppercase tracking-wider block mb-1">League</label>
                  <select
                    value={apiLeagueId}
                    onChange={(e) => handleLeagueChange(parseInt(e.target.value))}
                    className="w-full bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm text-text outline-none focus:border-primary/50 [color-scheme:dark]"
                  >
                    {API_LEAGUES.map((l) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </div>

                {/* Player name search */}
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-3.5 text-faint pointer-events-none" />
                  <input
                    value={apiQuery}
                    onChange={(e) => handleApiQueryChange(e.target.value)}
                    placeholder="e.g. Salah, Mbappé, Haaland…"
                    className="w-full bg-surface-2 border border-border rounded-xl pl-9 pr-10 py-3 text-sm text-text outline-none focus:border-primary/50 placeholder:text-faint"
                  />
                  {apiSearching && (
                    <Loader2 size={14} className="absolute right-3 top-3.5 animate-spin text-muted" />
                  )}
                </div>

                {apiError && (
                  <p className="text-[11px] text-danger mt-1.5">{apiError}</p>
                )}
                {!apiError && apiQuery.length > 0 && apiQuery.length < 3 && (
                  <p className="text-[11px] text-faint mt-1.5">Type at least 3 characters to search…</p>
                )}

                {/* Suggestions dropdown */}
                {showSuggestions && (
                  <div className="mt-1 bg-surface border border-border rounded-xl overflow-hidden divide-y divide-border shadow-lg">
                    {apiSuggestions.map((s) => (
                      <SuggestionRow key={s.apiFootballId} s={s} onSelect={handleSelectSuggestion} />
                    ))}
                  </div>
                )}

                {!apiSearching && apiQuery.length >= 3 && apiSuggestions.length === 0 && !apiError && (
                  <p className="text-[11px] text-faint mt-1.5">No results found. Try a different spelling or add manually.</p>
                )}
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-border" />
                <span className="text-[10px] text-faint font-semibold uppercase tracking-wider">or</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              <button
                type="button"
                onClick={() => setManualMode(true)}
                className="w-full py-2.5 rounded-xl border border-border text-sm font-semibold text-muted hover:text-text hover:border-primary/30 transition-colors"
              >
                Add manually (no API lookup)
              </button>
            </div>
          )}

          {/* ── Selected suggestion banner ─────────────────────────────── */}
          {modal === "create" && apiSelected && (
            <div className="flex items-center gap-3 px-4 py-3 bg-primary/5 border border-primary/20 rounded-xl">
              <div className="w-9 h-9 rounded-lg bg-surface-3 border border-border overflow-hidden shrink-0">
                {apiSelected.photo
                  ? <img src={apiSelected.photo} alt={apiSelected.name} className="w-full h-full object-cover" />
                  : <span className="w-full h-full flex items-center justify-center text-[10px] font-black text-muted">{apiSelected.name[0]}</span>
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-text">{apiSelected.name}</p>
                <p className="text-[11px] text-muted">{apiSelected.club} · {apiSelected.league} · {apiSelected.nationality}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded">{apiSelected.position}</span>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="text-faint hover:text-danger transition-colors"
                >
                  <X size={13} />
                </button>
              </div>
            </div>
          )}

          {/* ── Form (shown after API selection OR manual mode OR edit) ── */}
          {showForm && (
            <>
              {/* Player photo */}
              <div className="flex items-center gap-4 p-4 bg-surface-2 rounded-xl border border-border">
                <div className="w-16 h-16 rounded-xl bg-surface-3 border border-border flex items-center justify-center overflow-hidden shrink-0">
                  {displayPreview ? (
                    <img src={displayPreview} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xl font-black text-faint">
                      {form.shortName ? form.shortName.split(" ").map((n) => n[0]).join("").slice(0, 2) : "?"}
                    </span>
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-xs font-semibold text-text mb-1">Player Photo</p>
                  {apiSelected && !imageFile && (
                    <p className="text-[10px] text-muted mb-1.5">Using API-Football photo. Upload a custom photo to override.</p>
                  )}
                  {!apiSelected && !imageFile && (
                    <p className="text-[10px] text-muted mb-2">JPEG, PNG, WebP or GIF · max 5 MB · cropped to 400×400</p>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="px-3 py-1.5 rounded-lg bg-surface-3 border border-border text-xs font-semibold text-muted hover:text-text hover:border-primary/30 transition-colors flex items-center gap-1.5"
                    >
                      <Upload size={12} />
                      {imageFile ? "Change Photo" : displayPreview ? "Override Photo" : "Upload Photo"}
                    </button>
                    {imageFile && (
                      <button
                        type="button"
                        onClick={clearImage}
                        className="px-3 py-1.5 rounded-lg border border-border text-xs text-danger hover:bg-danger/10 transition-colors"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImagePick} />
                </div>
              </div>

              {/* Fields */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-muted uppercase tracking-wider">Full Name</label>
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm text-text outline-none focus:border-primary/50" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-muted uppercase tracking-wider">Short Name</label>
                  <input value={form.shortName} onChange={(e) => setForm({ ...form, shortName: e.target.value })}
                    className="bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm text-text outline-none focus:border-primary/50" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-muted uppercase tracking-wider">Position</label>
                  <select value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })}
                    className="bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm text-text outline-none [color-scheme:dark]">
                    {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-muted uppercase tracking-wider">Preferred Foot</label>
                  <select value={form.preferredFoot} onChange={(e) => setForm({ ...form, preferredFoot: e.target.value })}
                    className="bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm text-text outline-none [color-scheme:dark]">
                    {["Right","Left","Both"].map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-muted uppercase tracking-wider">Club</label>
                  <input value={form.club} onChange={(e) => setForm({ ...form, club: e.target.value })}
                    className="bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm text-text outline-none focus:border-primary/50" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-muted uppercase tracking-wider">League</label>
                  <select value={form.league} onChange={(e) => setForm({ ...form, league: e.target.value })}
                    className="bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm text-text outline-none [color-scheme:dark]">
                    {LEAGUES.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-muted uppercase tracking-wider">Nationality</label>
                  <input value={form.nationality} onChange={(e) => setForm({ ...form, nationality: e.target.value })}
                    placeholder="e.g. French"
                    className="bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm text-text outline-none focus:border-primary/50 placeholder:text-faint" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-muted uppercase tracking-wider">
                    RV Rating
                    <span className="text-faint normal-case font-normal ml-1">(base price: {fmtCurrency(basePrice)})</span>
                  </label>
                  <input type="number" min={60} max={99} value={form.rvRating}
                    onChange={(e) => setForm({ ...form, rvRating: parseInt(e.target.value) || 75 })}
                    className="bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm text-text outline-none focus:border-primary/50 ring-1 ring-primary/30" />
                  <p className="text-[10px] text-primary -mt-0.5">⚡ Always set manually — not from any API</p>
                </div>
              </div>

              {/* Season stats */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-muted uppercase tracking-wider">Season Stats</p>
                  {apiSelected && (
                    <span className="text-[10px] text-info">Auto-filled from API-Football · edit if needed</span>
                  )}
                </div>
                <div className="grid grid-cols-5 gap-3">
                  {(["appearances","goals","assists","cleanSheets","avgRating"] as const).map((field) => (
                    <div key={field} className="flex flex-col gap-1">
                      <label className="text-[10px] text-faint capitalize">{field}</label>
                      <input
                        type="number" step={field === "avgRating" ? "0.1" : "1"}
                        value={form.seasonStats[field]}
                        onChange={(e) => setForm({ ...form, seasonStats: { ...form.seasonStats, [field]: parseFloat(e.target.value) || 0 } })}
                        className="bg-surface-2 border border-border rounded-lg px-3 py-2 text-xs text-text outline-none focus:border-primary/50"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {error && <p className="text-xs text-danger bg-danger/10 border border-danger/20 rounded-lg px-3 py-2">{error}</p>}

              <div className="flex gap-3 pt-1">
                <button onClick={() => setModal(null)} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted hover:text-text transition-colors">Cancel</button>
                <button
                  onClick={handleSave}
                  disabled={saving || !form.name || !form.club}
                  className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-bold disabled:opacity-50 hover:bg-primary-dim transition-colors flex items-center justify-center gap-2"
                >
                  {uploading ? (
                    <><Loader2 size={14} className="animate-spin" />Uploading image…</>
                  ) : saving ? (
                    <><Loader2 size={14} className="animate-spin" />Saving…</>
                  ) : modal === "create" ? "Add Player" : "Save Changes"}
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
