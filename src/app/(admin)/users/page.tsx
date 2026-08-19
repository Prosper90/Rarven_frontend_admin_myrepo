"use client";
import { useEffect, useState } from "react";
import { adminApi, AdminUser, PromoCredit } from "@/lib/api";
import { getAdminInfo } from "@/lib/auth";
import Badge from "@/components/Badge";
import StatCard from "@/components/StatCard";
import { Gift, Search, Loader2, CheckCircle } from "lucide-react";

const REGIONS = ["ALL","NG","GB","US","GH","KE","ZA","UG"];

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" });
}
function fmtCurrency(n: number, currency = "NGN") {
  const sym: Record<string, string> = { NGN: "₦", GBP: "£", USD: "$" };
  return (sym[currency] ?? currency + " ") + n.toLocaleString();
}

export default function UsersPage() {
  const admin       = getAdminInfo();
  const canCredit   = admin?.role === "superadmin" || admin?.role === "pool_manager";

  const [users, setUsers]     = useState<AdminUser[]>([]);
  const [total, setTotal]     = useState(0);
  const [pages, setPages]     = useState(1);
  const [page, setPage]       = useState(1);
  const [region, setRegion]   = useState("ALL");
  const [search, setSearch]   = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [stats, setStats]     = useState<{ _id: string; count: number }[]>([]);

  // Credit form state
  const [identifier, setIdentifier] = useState("");
  const [creditAmount, setCreditAmount] = useState("");
  const [creditNote, setCreditNote]     = useState("");
  const [crediting, setCrediting]       = useState(false);
  const [creditError, setCreditError]   = useState("");
  const [creditSuccess, setCreditSuccess] = useState<{ name: string; amount: number } | null>(null);

  // History state
  const [credits, setCredits]         = useState<PromoCredit[]>([]);
  const [creditsLoading, setCreditsLoading] = useState(false);

  useEffect(() => {
    load();
    adminApi.stats()
      .then((s) => setStats(s.usersByRegion ?? []))
      .catch(() => {});
    if (canCredit) {
      setCreditsLoading(true);
      adminApi.listPromoCredits()
        .then((r) => setCredits(r.credits))
        .catch(() => {})
        .finally(() => setCreditsLoading(false));
    }
  }, [page, region]); // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true);
    try {
      const res = await adminApi.listUsers({ region: region === "ALL" ? undefined : region, page });
      setUsers(res.users ?? []);
      setTotal(res.total ?? 0);
      setPages(res.pages ?? 1);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally { setLoading(false); }
  }

  async function handleCredit(e: React.FormEvent) {
    e.preventDefault();
    if (!identifier.trim() || !creditAmount) return;
    const amount = Number(creditAmount);
    if (isNaN(amount) || amount <= 0) { setCreditError("Enter a valid amount"); return; }
    setCrediting(true);
    setCreditError("");
    setCreditSuccess(null);
    try {
      const res = await adminApi.creditUser(identifier.trim(), amount, creditNote.trim() || undefined);
      setCreditSuccess({ name: res.user.name, amount });
      setIdentifier("");
      setCreditAmount("");
      setCreditNote("");
      // Refresh credit history
      const h = await adminApi.listPromoCredits();
      setCredits(h.credits);
    } catch (e: unknown) {
      setCreditError(e instanceof Error ? e.message : "Credit failed");
    } finally { setCrediting(false); }
  }

  const filtered = search
    ? users.filter((u) => u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase()))
    : users;

  const regionCounts = stats.sort((a, b) => b.count - a.count);

  return (
    <div className="p-8 flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-black text-text">Users</h1>
        <p className="text-sm text-muted mt-0.5">{total.toLocaleString()} registered users across all regions</p>
      </div>

      {/* Region breakdown */}
      <div className="grid grid-cols-5 gap-4">
        {regionCounts.slice(0, 5).map((r) => (
          <StatCard key={r._id} label={r._id} value={r.count.toLocaleString()} accent="primary" />
        ))}
        {regionCounts.length === 0 && (
          <div className="col-span-5">
            <p className="text-sm text-muted">No region data available.</p>
          </div>
        )}
      </div>

      {/* ── Promo Credit Panel ─────────────────────────────────────────────── */}
      {canCredit && (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <Gift size={15} className="text-primary" />
            <div>
              <p className="text-sm font-bold text-text">Issue Promo Credit</p>
              <p className="text-xs text-muted mt-0.5">Credit a user from the platform reserve. Look them up by phone number, email, referral code, or User ID.</p>
            </div>
          </div>

          <form onSubmit={handleCredit} className="px-5 py-4 flex flex-col gap-3">
            <div className="grid grid-cols-3 gap-3">
              {/* Identifier */}
              <div className="col-span-1 flex flex-col gap-1.5">
                <label className="text-[10px] font-semibold text-muted uppercase tracking-wider">User ID / Email / Referral Code</label>
                <div className="relative flex items-center">
                  <Search size={13} className="absolute left-3 text-faint pointer-events-none" />
                  <input
                    value={identifier}
                    onChange={(e) => { setIdentifier(e.target.value); setCreditError(""); setCreditSuccess(null); }}
                    placeholder="e.g. 08012345678, email, or referral code"
                    required
                    className="w-full bg-surface-2 border border-border rounded-xl pl-8 pr-4 py-2.5 text-sm text-text outline-none focus:border-primary/50 placeholder:text-faint font-mono"
                  />
                </div>
              </div>

              {/* Amount */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-semibold text-muted uppercase tracking-wider">Amount (₦)</label>
                <input
                  type="number"
                  min="10"
                  value={creditAmount}
                  onChange={(e) => setCreditAmount(e.target.value)}
                  placeholder="e.g. 500"
                  required
                  className="bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm text-text outline-none focus:border-primary/50 placeholder:text-faint"
                />
              </div>

              {/* Note */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-semibold text-muted uppercase tracking-wider">Note (optional)</label>
                <input
                  value={creditNote}
                  onChange={(e) => setCreditNote(e.target.value)}
                  placeholder="e.g. Welcome bonus, promo code XYZ"
                  className="bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm text-text outline-none focus:border-primary/50 placeholder:text-faint"
                />
              </div>
            </div>

            <div className="flex items-center gap-4">
              <button
                type="submit"
                disabled={crediting || !identifier.trim() || !creditAmount}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-bold disabled:opacity-50 hover:bg-primary-dim transition-colors"
              >
                {crediting ? <Loader2 size={14} className="animate-spin" /> : <Gift size={14} />}
                {crediting ? "Sending…" : "Issue Credit"}
              </button>

              {creditSuccess && (
                <div className="flex items-center gap-2 text-sm text-success">
                  <CheckCircle size={14} />
                  <span>₦{creditSuccess.amount.toLocaleString()} credited to <strong>{creditSuccess.name}</strong></span>
                </div>
              )}
              {creditError && <p className="text-sm text-danger">{creditError}</p>}
            </div>
          </form>

          {/* Credit history */}
          <div className="border-t border-border">
            <div className="px-5 py-3 flex items-center justify-between">
              <p className="text-xs font-semibold text-muted uppercase tracking-wider">Credit History</p>
              <p className="text-xs text-faint">{credits.length} total</p>
            </div>
            {creditsLoading ? (
              <div className="px-5 py-4 text-sm text-muted flex items-center gap-2">
                <Loader2 size={13} className="animate-spin" /> Loading…
              </div>
            ) : credits.length === 0 ? (
              <p className="px-5 pb-4 text-xs text-faint">No credits issued yet.</p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    {["User", "Email", "Amount", "Note", "Date"].map((h) => (
                      <th key={h} className="px-5 py-2 text-left text-[10px] font-bold text-muted uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {credits.map((c) => {
                    const u = typeof c.user === "object" ? c.user : null;
                    return (
                      <tr key={c._id} className="hover:bg-surface-2 transition-colors">
                        <td className="px-5 py-3 text-sm font-semibold text-text">{u?.name ?? "—"}</td>
                        <td className="px-5 py-3 text-xs text-muted">{u?.email ?? "—"}</td>
                        <td className="px-5 py-3 text-sm font-bold text-success">+₦{c.amount.toLocaleString()}</td>
                        <td className="px-5 py-3 text-xs text-muted max-w-[200px] truncate">{c.description}</td>
                        <td className="px-5 py-3 text-xs text-faint">
                          {fmtDate(c.createdAt)} · {fmtTime(c.createdAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── Users Table ────────────────────────────────────────────────────── */}
      {/* Filters */}
      <div className="flex items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or email…"
          className="bg-surface border border-border rounded-xl px-4 py-2.5 text-sm text-text outline-none focus:border-primary/50 placeholder:text-faint w-64"
        />
        <div className="flex gap-1.5">
          {REGIONS.map((r) => (
            <button
              key={r}
              onClick={() => { setRegion(r); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${region === r ? "bg-primary/10 border-primary/30 text-primary" : "bg-surface border-border text-muted hover:text-text"}`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}

      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {["Name", "Email", "Phone", "Region", "Currency", "Balance", "KYC", "Joined", "ID"].map((h) => (
                <th key={h} className="px-5 py-3 text-left text-[10px] font-bold text-muted uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading && <tr><td colSpan={9} className="px-5 py-8 text-center text-sm text-muted">Loading…</td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={9} className="px-5 py-8 text-center text-sm text-muted">No users found.</td></tr>}
            {filtered.map((u) => (
              <tr key={u._id} className="hover:bg-surface-2 transition-colors">
                <td className="px-5 py-4">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-surface-3 border border-border flex items-center justify-center text-[10px] font-black text-muted shrink-0">
                      {u.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                    <p className="text-sm font-semibold text-text">{u.name}</p>
                  </div>
                </td>
                <td className="px-5 py-4 text-xs text-muted">{u.email}</td>
                <td className="px-5 py-4 text-xs text-muted font-mono">{u.phone ?? <span className="text-faint">—</span>}</td>
                <td className="px-5 py-4">
                  <span className="text-xs font-bold text-text bg-surface-3 border border-border px-2 py-0.5 rounded">{u.region}</span>
                </td>
                <td className="px-5 py-4 text-xs text-faint">{u.currency}</td>
                <td className="px-5 py-4 text-sm font-semibold text-primary">{fmtCurrency(u.walletBalance, u.currency)}</td>
                <td className="px-5 py-4">
                  <Badge label={u.kycVerified ? "verified" : "pending"} variant={u.kycVerified ? "success" : "warning"} />
                </td>
                <td className="px-5 py-4 text-xs text-muted">{fmtDate(u.createdAt)}</td>
                <td className="px-5 py-4">
                  <button
                    onClick={() => { setIdentifier(u._id); }}
                    className="text-xs text-faint hover:text-primary font-mono transition-colors"
                    title="Click to pre-fill credit form"
                  >
                    #{u._id.slice(-8)}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        {pages > 1 && (
          <div className="px-5 py-4 border-t border-border flex items-center justify-between">
            <p className="text-xs text-muted">Page {page} of {pages} · {total} users</p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 rounded-lg bg-surface-2 border border-border text-xs font-semibold text-muted hover:text-text disabled:opacity-40 transition-colors"
              >← Prev</button>
              <button
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
                disabled={page === pages}
                className="px-3 py-1.5 rounded-lg bg-surface-2 border border-border text-xs font-semibold text-muted hover:text-text disabled:opacity-40 transition-colors"
              >Next →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
