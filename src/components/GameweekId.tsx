"use client";

/**
 * The platform's display id for a gameweek: a short, greyed slice of the Mongo
 * `_id` so the run of ids reads distinctly at a glance, concatenated with the
 * per-league matchweek code.
 *
 * The code is each league's OWN real matchweek, not the platform week number —
 * that's the point: in October 2026 the Premier League is on MW 8 while the
 * Bundesliga is on MW 7, and the admin wants to see that spread before pulling
 * a window. Letters are the five supported leagues in a fixed order:
 *
 *   P = Premier League (39)   L = La Liga (140)   S = Serie A (135)
 *   G = Bundesliga  (78)      F = Ligue 1 (61)
 *
 *   (P8L9S7G7F7)
 *
 * The greyed slice is deterministic — the first four chars of the ObjectId —
 * so the same week always shows the same grey run and adjacent weeks look
 * different without being random.
 */

/** Fixed order + letters for the five default leagues. */
export const LEAGUE_CODE: { id: number; letter: string; name: string }[] = [
  { id: 39,  letter: "P", name: "Premier League" },
  { id: 140, letter: "L", name: "La Liga" },
  { id: 135, letter: "S", name: "Serie A" },
  { id: 78,  letter: "G", name: "Bundesliga" },
  { id: 61,  letter: "F", name: "Ligue 1" },
];

/** First four hex chars of the ObjectId, uppercased — the greyed run. */
export function idSlice(id: string, len = 4): string {
  return id.replace(/[^0-9a-fA-F]/g, "").slice(0, len).toUpperCase();
}

/**
 * Build the per-league code from a league → matchweek map.
 * Leagues with no known matchweek are omitted rather than shown as a zero.
 */
export function leagueCode(matchweeks: Record<number, number | null | undefined>): string {
  const parts = LEAGUE_CODE
    .filter((l) => matchweeks[l.id] != null)
    .map((l) => `${l.letter}${matchweeks[l.id]}`);
  return parts.length > 0 ? `(${parts.join("")})` : "";
}

interface Props {
  /** Mongo `_id`; only its first chars are shown, greyed. */
  id: string;
  /** Per-league matchweeks, keyed by api-football league id. Optional. */
  matchweeks?: Record<number, number | null | undefined>;
  /** Fallback label when no matchweeks are known (e.g. the platform week no.). */
  fallback?: string;
  className?: string;
}

export default function GameweekId({ id, matchweeks, fallback, className = "" }: Props) {
  const code = matchweeks ? leagueCode(matchweeks) : "";
  return (
    <span className={`inline-flex items-center font-mono text-xs ${className}`}>
      <span className="text-faint/70" title={id}>
        {idSlice(id)}
      </span>
      {code && (
        <>
          <span className="text-faint">-</span>
          <span className="text-primary font-bold" title="per-league matchweek">
            {code}
          </span>
        </>
      )}
      {!code && fallback && <span className="text-muted ml-1">{fallback}</span>}
    </span>
  );
}
