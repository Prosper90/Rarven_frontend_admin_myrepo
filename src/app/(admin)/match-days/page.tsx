"use client";
import { useEffect, useState } from "react";
import { adminApi, MatchdayRecord } from "@/lib/api";
import Badge from "@/components/Badge";
import Modal from "@/components/Modal";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-NG", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export default function MatchDaysPage() {
  const [matchdays, setMatchdays] = useState<MatchdayRecord[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState("");

  const today = new Date().toISOString().split("T")[0];
  const [date, setDate]   = useState(today);
  const [label, setLabel] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await adminApi.listMatchdays();
      setMatchdays(res.matchdays ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally { setLoading(false); }
  }

  async function handleCreate() {
    setSaving(true);
    setError("");
    try {
      await adminApi.createMatchday({ matchDate: new Date(date).toISOString(), label: label.trim() || undefined });
      setShowCreate(false);
      setDate(today);
      setLabel("");
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create");
    } finally { setSaving(false); }
  }

  async function handleStatusChange(id: string, status: string) {
    try {
      await adminApi.updateMatchdayStatus(id, status);
      load();
    } catch (e: unknown) { alert(e instanceof Error ? e.message : "Failed"); }
  }

  return (
    <div className="p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-text">Match Days</h1>
          <p className="text-sm text-muted mt-0.5">Daily pool sessions — best performer of the day</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-dim transition-colors"
        >
          + New Match Day
        </button>
      </div>

      {/* Info strip */}
      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-5 py-3 text-xs text-amber-400">
        Daily pools settle <span className="font-semibold">same day</span> after admin enters Sofascore ratings.
        Players compete within their category (Attackers / Midfielders / Defenders / Goalkeepers) for that day's matches only.
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}

      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {["Date", "Label", "Status", "Actions"].map((h) => (
                <th key={h} className="px-5 py-3 text-left text-[10px] font-bold text-muted uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading && (
              <tr><td colSpan={4} className="px-5 py-8 text-center text-sm text-muted">Loading…</td></tr>
            )}
            {!loading && matchdays.length === 0 && (
              <tr><td colSpan={4} className="px-5 py-8 text-center text-sm text-muted">No match days yet. Create one above.</td></tr>
            )}
            {matchdays.map((m) => (
              <tr key={m._id} className="hover:bg-surface-2 transition-colors">
                <td className="px-5 py-4 text-sm text-muted">{fmtDate(m.matchDate)}</td>
                <td className="px-5 py-4 text-sm font-semibold text-text">{m.label}</td>
                <td className="px-5 py-4"><Badge label={m.status} variant={m.status} /></td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-2">
                    <a href={`/match-days/${m._id}`} className="text-xs text-primary hover:underline font-semibold">
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
        <Modal title="Create Match Day" onClose={() => setShowCreate(false)}>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted uppercase tracking-wider">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="bg-surface-2 border border-border rounded-xl px-4 py-3 text-sm text-text outline-none focus:border-primary/50 [color-scheme:dark]"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted uppercase tracking-wider">Label (optional)</label>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Champions League Night"
                className="bg-surface-2 border border-border rounded-xl px-4 py-3 text-sm text-text outline-none focus:border-primary/50 placeholder:text-faint"
              />
              <p className="text-[11px] text-faint px-1">Leave blank to auto-generate from date.</p>
            </div>
            {error && <p className="text-xs text-danger">{error}</p>}
            <div className="flex gap-3">
              <button onClick={() => setShowCreate(false)} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted hover:text-text transition-colors">
                Cancel
              </button>
              <button onClick={handleCreate} disabled={saving || !date} className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-dim disabled:opacity-50 transition-colors">
                {saving ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
