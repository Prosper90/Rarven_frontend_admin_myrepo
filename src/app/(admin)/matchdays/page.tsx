"use client";
import { useEffect, useState } from "react";
import { adminApi, Matchday } from "@/lib/api";
import Badge from "@/components/Badge";
import Modal from "@/components/Modal";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" });
}

export default function MatchWeeksPage() {
  const [matchweeks, setMatchweeks] = useState<Matchday[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState("");

  const today = new Date();
  const [date, setDate]     = useState(today.toISOString().split("T")[0]);
  const [season, setSeason] = useState("2025/26");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await adminApi.listMatchweeks();
      setMatchweeks(res.matchweeks ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally { setLoading(false); }
  }

  async function handleCreate() {
    setSaving(true);
    setError("");
    try {
      const d = new Date(date);
      const startsAt       = new Date(d); startsAt.setHours(6, 0, 0, 0);
      const endsAt         = new Date(d); endsAt.setHours(23, 30, 0, 0);
      const ratingDeadline = new Date(d); ratingDeadline.setHours(23, 59, 0, 0);
      const weekNumber     = Math.ceil((d.getTime() - new Date("2026-01-01").getTime()) / 86400000);

      await adminApi.createMatchweek({
        weekNumber,
        season,
        startsAt:       startsAt.toISOString(),
        endsAt:         endsAt.toISOString(),
        ratingDeadline: ratingDeadline.toISOString(),
        status:         "open",
      });
      setShowCreate(false);
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create");
    } finally { setSaving(false); }
  }

  async function handleStatusChange(id: string, status: string) {
    try {
      await adminApi.updateMatchweekStatus(id, status);
      load();
    } catch (e: unknown) { alert(e instanceof Error ? e.message : "Failed"); }
  }

  return (
    <div className="p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-text">Match Weeks</h1>
          <p className="text-sm text-muted mt-0.5">Weekly pool sessions — best of the week</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-dim transition-colors"
        >
          + New Match Week
        </button>
      </div>

      {/* Schedule note */}
      <div className="bg-surface border border-border rounded-xl px-5 py-4 flex gap-8">
        {[
          ["Market opens",    "06:00", "text-success"],
          ["Pro closes",      "14:00", "text-primary"],
          ["Classic closes",  "23:30", "text-warning"],
          ["Rating deadline", "23:59", "text-muted"],
        ].map(([label, time, color]) => (
          <div key={label}>
            <p className="text-[10px] text-faint uppercase tracking-wider">{label}</p>
            <p className={`text-lg font-black ${color}`}>{time}</p>
          </div>
        ))}
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}

      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {["Week #", "Date", "Season", "Opens", "Classic closes", "Status", "Actions"].map((h) => (
                <th key={h} className="px-5 py-3 text-left text-[10px] font-bold text-muted uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading && (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-sm text-muted">Loading…</td></tr>
            )}
            {!loading && matchweeks.length === 0 && (
              <tr><td colSpan={7} className="px-5 py-8 text-center text-sm text-muted">No match weeks yet. Create one above.</td></tr>
            )}
            {matchweeks.map((m) => (
              <tr key={m._id} className="hover:bg-surface-2 transition-colors">
                <td className="px-5 py-4 text-sm font-bold text-text">GW{m.weekNumber}</td>
                <td className="px-5 py-4 text-sm text-muted">{fmtDate(m.startsAt)}</td>
                <td className="px-5 py-4 text-xs text-muted">{m.season}</td>
                <td className="px-5 py-4 text-xs text-success">{fmtTime(m.startsAt)}</td>
                <td className="px-5 py-4 text-xs text-warning">{fmtTime(m.endsAt)}</td>
                <td className="px-5 py-4"><Badge label={m.status} variant={m.status} /></td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-2">
                    <a href={`/matchdays/${m._id}`} className="text-xs text-primary hover:underline font-semibold">
                      Manage →
                    </a>
                    {m.status === "upcoming" && (
                      <button onClick={() => handleStatusChange(m._id, "open")} className="text-xs text-success hover:underline">Open</button>
                    )}
                    {m.status === "open" && (
                      <button onClick={() => handleStatusChange(m._id, "locked")} className="text-xs text-warning hover:underline">Lock</button>
                    )}
                    {m.status === "locked" && (
                      <button onClick={() => handleStatusChange(m._id, "settled")} className="text-xs text-muted hover:underline">Mark settled</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <Modal title="Create Match Week" onClose={() => setShowCreate(false)}>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted uppercase tracking-wider">Start Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="bg-surface-2 border border-border rounded-xl px-4 py-3 text-sm text-text outline-none focus:border-primary/50 [color-scheme:dark]"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted uppercase tracking-wider">Season</label>
              <input
                value={season}
                onChange={(e) => setSeason(e.target.value)}
                className="bg-surface-2 border border-border rounded-xl px-4 py-3 text-sm text-text outline-none focus:border-primary/50"
              />
            </div>
            <div className="bg-surface-2 border border-border rounded-xl p-3 text-xs text-muted">
              Market opens <span className="text-success font-semibold">06:00</span> ·
              Pro closes <span className="text-primary font-semibold"> 14:00</span> ·
              Classic closes <span className="text-warning font-semibold"> 23:30</span>
            </div>
            {error && <p className="text-xs text-danger">{error}</p>}
            <div className="flex gap-3">
              <button onClick={() => setShowCreate(false)} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted hover:text-text transition-colors">
                Cancel
              </button>
              <button onClick={handleCreate} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-dim disabled:opacity-50 transition-colors">
                {saving ? "Creating…" : "Create Match Week"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
