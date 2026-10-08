"use client";
import { useEffect, useState } from "react";
import { adminApi, AdminUser, PlatformStats, PromoCredit } from "@/lib/api";
import { getAdminInfo } from "@/lib/auth";
import Badge from "@/components/Badge";
import StatCard from "@/components/StatCard";
import { Gift, Search, Loader2, CheckCircle } from "lucide-react";

// Region filters went with the old signup form. Search is server-side now:
// the backend's `q` matches an exact username, a 0x wallet address, or an
// ObjectId — which is also why there are no filter chips left to offer.
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" });
}
// raRVen is single-currency: every balance in the admin is USDC, so the
// user's stored `currency` field is legacy data and no longer drives display.
// One raw unit is one USDC.
function fmtCurrency(n: number) {
  return "$" + n.toLocaleString();
}

export default function UsersPage() {
  const admin       = getAdminInfo();
  const canCredit   = admin?.role === "superadmin" || admin?.role === "pool_manager";

  const [users, setUsers]     = useState<AdminUser[]>([]);
  const [total, setTotal]     = useState(0);
  const [pages, setPages]     = useState(1);
  const [page, setPage]       = useState(1);
  const [query, setQuery]         = useState("");  // what's in the input
  const [appliedQuery, setApplied] = useState(""); // debounced — drives the fetch
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [stats, setStats]     = useState<PlatformStats["usersByWallet"]>([]);

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

  // Debounce so typing a wallet address doesn't fire a request per keystroke,
  // and reset to page 1 — keeping the old page number would land past the end
  // of a much smaller result set.
  useEffect(() => {
    const t = setTimeout(() => {
      setApplied(query.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  // The list itself. Depends on the *debounced* query, not the raw input.
  useEffect(() => {
    load();
  }, [page, appliedQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  // Wallet split, fetched once — paging the table below doesn't change it.
  useEffect(() => {
    adminApi.stats()
      .then((s) => setStats(s.usersByWallet ?? []))
      .catch(() => {});
  }, []);

  // Credit history, likewise loaded once.
  useEffect(() => {
    if (!canCredit) return;
    setCreditsLoading(true);
    adminApi.listPromoCredits()
      .then((r) => setCredits(r.credits))
      .catch(() => {})
      .finally(() => setCreditsLoading(false));
  }, [canCredit]);

  async function load() {
    setLoading(true);
    try {
      const res = await adminApi.listUsers({ q: appliedQuery || undefined, page });
      setUsers(res.users ?? []);
      setTotal(res.total ?? 0);
      setPages(res.pages ?? 1);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally { setLoading(false); }
  }

  async function handleToggleStatus(u: AdminUser) {
    const action = u.isActive ? "suspend" : "reactivate";
    if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} ${u.username}? ${u.isActive ? "They will be unable to log in." : ""}`)) return;
    try {
      await adminApi.updateUserStatus(u._id, !u.isActive);
      load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed");
    }
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
      setCreditSuccess({ name: res.user.username, amount });
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

  // Search and paging are both server-side (see `appliedQuery` above), so
  // this is the page as the backend returned it — filtering it here would
  // only ever search the current 50 rows and silently ignore everyone else.
  const walletSplit = stats;

  return (
    <div className="p-8 flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-black text-text">Users</h1>
        <p className="text-sm text-muted mt-0.5">
          {total.toLocaleString()} accounts{appliedQuery ? ` matching “${appliedQuery}”` : ""}
        </p>
      </div>

      {/* Wallet split — 'none' is house accounts. */}
      <div className="grid grid-cols-5 gap-4">
        {walletSplit.slice(0, 5).map((r) => (
          <StatCard
            key={r._id}
            label={r._id === "connected" ? "Wallet connected" : "No wallet"}
            value={r.count.toLocaleString()}
            accent="primary"
          />
        ))}
        {walletSplit.length === 0 && (
          <div className="col-span-5">
            <p className="text-sm text-muted">No wallet data available.</p>
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
              <p className="text-xs text-muted mt-0.5">Credit a user from the platform reserve. Look them up by username, wallet address, referral code, or User ID.</p>
            </div>
          </div>

          <form onSubmit={handleCredit} className="px-5 py-4 flex flex-col gap-3">
            <div className="grid grid-cols-3 gap-3">
              {/* Identifier */}
              <div className="col-span-1 flex flex-col gap-1.5">
                <label className="text-[10px] font-semibold text-muted uppercase tracking-wider">Username / Wallet / Referral Code</label>
                <div className="relative flex items-center">
                  <Search size={13} className="absolute left-3 text-faint pointer-events-none" />
                  <input
                    value={identifier}
                    onChange={(e) => { setIdentifier(e.target.value); setCreditError(""); setCreditSuccess(null); }}
                    placeholder="e.g. striker99, 0xabc…, or referral code"
                    required
                    className="w-full bg-surface-2 border border-border rounded-xl pl-8 pr-4 py-2.5 text-sm text-text outline-none focus:border-primary/50 placeholder:text-faint font-mono"
                  />
                </div>
              </div>

              {/* Amount */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-semibold text-muted uppercase tracking-wider">Amount (USDC)</label>
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
                  placeholder="e.g. Promo credit, compensation"
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
                  <span>${creditSuccess.amount.toLocaleString()} credited to <strong>{creditSuccess.name}</strong></span>
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
                    {["User", "Referral", "Amount", "Note", "Date"].map((h) => (
                      <th key={h} className="px-5 py-2 text-left text-[10px] font-bold text-muted uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {credits.map((c) => {
                    const u = typeof c.user === "object" ? c.user : null;
                    return (
                      <tr key={c._id} className="hover:bg-surface-2 transition-colors">
                        <td className="px-5 py-3 text-sm font-semibold text-text">{u?.username ?? "—"}</td>
                        <td className="px-5 py-3 text-xs text-muted font-mono">{u?.referralCode ?? "—"}</td>
                        <td className="px-5 py-3 text-sm font-bold text-success">+${c.amount.toLocaleString()}</td>
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
      {/* Filters — search only. It goes to the server on a 350ms debounce, so
          a wallet address matches on any page, not just this one. */}
      <div className="flex items-center gap-3">
        <div className="relative flex items-center">
          <Search size={14} className="absolute left-3 text-faint pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search username, wallet, or ID…"
            className="bg-surface border border-border rounded-xl pl-9 pr-4 py-2.5 text-sm text-text outline-none focus:border-primary/50 placeholder:text-faint w-80"
          />
        </div>
        {query && (
          <button
            onClick={() => setQuery("")}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-surface border border-border text-muted hover:text-text transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}

      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {["Username", "Wallet", "Network", "Referral", "Currency", "Balance", "Status", "Joined", "ID"].map((h) => (
                <th key={h} className="px-5 py-3 text-left text-[10px] font-bold text-muted uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading && <tr><td colSpan={9} className="px-5 py-8 text-center text-sm text-muted">Loading…</td></tr>}
            {!loading && users.length === 0 && <tr><td colSpan={9} className="px-5 py-8 text-center text-sm text-muted">No users found.</td></tr>}
            {users.map((u) => (
              <tr key={u._id} className="hover:bg-surface-2 transition-colors">
                <td className="px-5 py-4">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-surface-3 border border-border flex items-center justify-center text-[10px] font-black text-muted shrink-0">
                      {u.username.slice(0, 2).toUpperCase()}
                    </div>
                    <p className="text-sm font-semibold text-text">{u.username}</p>
                  </div>
                </td>
                <td className="px-5 py-4 text-xs text-muted font-mono">
                  {u.walletAddress ? (
                    <span title={u.walletAddress}>{u.walletAddress.slice(0, 10)}…{u.walletAddress.slice(-6)}</span>
                  ) : (
                    <span className="text-faint">house — none</span>
                  )}
                </td>
                <td className="px-5 py-4 text-xs text-muted">{u.walletNetwork ?? <span className="text-faint">—</span>}</td>
                <td className="px-5 py-4 text-xs text-muted font-mono">{u.referralCode}</td>
                <td className="px-5 py-4 text-xs text-faint">USDC</td>
                <td className="px-5 py-4 text-sm font-semibold text-primary">{fmtCurrency(u.walletBalance)}</td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-2">
                    <Badge label={u.isActive ? "active" : "suspended"} variant={u.isActive ? "success" : "danger"} />
                    {canCredit && (
                      <button
                        onClick={() => handleToggleStatus(u)}
                        className={`text-[11px] font-semibold hover:underline ${u.isActive ? "text-danger" : "text-success"}`}
                      >
                        {u.isActive ? "Suspend" : "Reactivate"}
                      </button>
                    )}
                  </div>
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
