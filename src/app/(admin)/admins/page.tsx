"use client";
import { useEffect, useState } from "react";
import { adminApi, AdminMember } from "@/lib/api";
import { getAdminInfo } from "@/lib/auth";
import Badge from "@/components/Badge";
import Modal from "@/components/Modal";

const ROLE_LABELS: Record<string, string> = {
  superadmin:   "Super Admin",
  pool_manager: "Pool Manager",
  support:      "Support",
};

const ROLE_DESCRIPTIONS: Record<string, string> = {
  pool_manager: "Can create & manage matchdays, pools, listings and players. Can view revenue stats.",
  support:      "Can view users and dashboard. Cannot see revenue or manage markets.",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

const EMPTY_FORM = { name: "", email: "", password: "", role: "support" };

export default function AdminsPage() {
  const currentAdmin = getAdminInfo();
  const isSuperAdmin = currentAdmin?.role === "superadmin";

  const [admins, setAdmins]   = useState<AdminMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  const [modal, setModal]   = useState(false);
  const [form, setForm]     = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [showPw, setShowPw] = useState(false);

  useEffect(() => {
    if (isSuperAdmin) load();
    else setLoading(false);
  }, [isSuperAdmin]);

  async function load() {
    setLoading(true);
    try {
      const res = await adminApi.listAdmins();
      setAdmins(res.admins ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally { setLoading(false); }
  }

  async function handleCreate() {
    if (!form.name || !form.email || !form.password || !form.role) return;
    setSaving(true);
    setError("");
    try {
      await adminApi.createAdmin(form);
      setModal(false);
      setForm(EMPTY_FORM);
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create admin");
    } finally { setSaving(false); }
  }

  async function handleToggle(admin: AdminMember) {
    const action = admin.isActive ? "deactivate" : "reactivate";
    if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} ${admin.name}?`)) return;
    try {
      await adminApi.updateAdmin(admin._id, { isActive: !admin.isActive });
      load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed");
    }
  }

  if (!isSuperAdmin) {
    return (
      <div className="p-8 flex flex-col items-center justify-center gap-3 h-64">
        <p className="text-2xl">🔒</p>
        <p className="text-sm font-semibold text-text">Superadmin access required</p>
        <p className="text-xs text-muted">Only superadmins can manage admin accounts.</p>
      </div>
    );
  }

  return (
    <div className="p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-text">Admin Accounts</h1>
          <p className="text-sm text-muted mt-0.5">
            {admins.filter((a) => a.isActive).length} active admin{admins.filter((a) => a.isActive).length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => { setForm(EMPTY_FORM); setError(""); setModal(true); }}
          className="px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-dim transition-colors"
        >
          + Add Admin
        </button>
      </div>

      {/* Role legend */}
      <div className="grid grid-cols-2 gap-3">
        {Object.entries(ROLE_DESCRIPTIONS).map(([role, desc]) => (
          <div key={role} className="bg-surface border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                role === "pool_manager"
                  ? "bg-info/10 border-info/20 text-info"
                  : "bg-warning/10 border-warning/20 text-warning"
              }`}>
                {ROLE_LABELS[role]}
              </span>
            </div>
            <p className="text-xs text-muted">{desc}</p>
          </div>
        ))}
      </div>

      {error && <p className="text-xs text-danger bg-danger/10 border border-danger/20 rounded-lg px-3 py-2">{error}</p>}

      {/* Table */}
      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {["Admin", "Role", "Status", "Created", "Actions"].map((h) => (
                <th key={h} className="px-5 py-3 text-left text-[10px] font-bold text-muted uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading && <tr><td colSpan={5} className="px-5 py-8 text-center text-sm text-muted">Loading…</td></tr>}
            {!loading && admins.length === 0 && (
              <tr><td colSpan={5} className="px-5 py-8 text-center text-sm text-muted">No admins yet.</td></tr>
            )}
            {admins.map((a) => {
              const isSelf = a._id === currentAdmin?.id;
              const isSuper = a.role === "superadmin";
              return (
                <tr key={a._id} className={`transition-colors ${a.isActive ? "hover:bg-surface-2" : "opacity-50"}`}>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-surface-3 border border-border flex items-center justify-center text-xs font-bold text-primary">
                        {a.name[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-text">
                          {a.name}
                          {isSelf && <span className="ml-2 text-[10px] text-muted">(you)</span>}
                        </p>
                        <p className="text-xs text-muted">{a.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      isSuper
                        ? "bg-primary/10 border-primary/20 text-primary"
                        : a.role === "pool_manager"
                        ? "bg-info/10 border-info/20 text-info"
                        : "bg-warning/10 border-warning/20 text-warning"
                    }`}>
                      {ROLE_LABELS[a.role] ?? a.role}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <Badge label={a.isActive ? "active" : "inactive"} variant={a.isActive ? "success" : "neutral"} />
                  </td>
                  <td className="px-5 py-4 text-xs text-muted">{fmtDate(a.createdAt)}</td>
                  <td className="px-5 py-4">
                    {!isSelf && !isSuper ? (
                      <button
                        onClick={() => handleToggle(a)}
                        className={`text-xs font-semibold hover:underline ${a.isActive ? "text-danger" : "text-success"}`}
                      >
                        {a.isActive ? "Deactivate" : "Reactivate"}
                      </button>
                    ) : (
                      <span className="text-xs text-faint">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Create admin modal */}
      {modal && (
        <Modal title="Add Admin" onClose={() => setModal(false)} width="max-w-md">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted uppercase tracking-wider">Full Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Jane Okafor"
                className="bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm text-text outline-none focus:border-primary/50 placeholder:text-faint"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted uppercase tracking-wider">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="admin@rarven.gg"
                className="bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm text-text outline-none focus:border-primary/50 placeholder:text-faint"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted uppercase tracking-wider">Password</label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="Min 8 characters"
                  className="w-full bg-surface-2 border border-border rounded-xl px-4 py-2.5 text-sm text-text outline-none focus:border-primary/50 placeholder:text-faint pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-muted hover:text-text transition-colors"
                >
                  {showPw ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted uppercase tracking-wider">Role</label>
              <div className="flex flex-col gap-2">
                {(["pool_manager", "support"] as const).map((role) => (
                  <label
                    key={role}
                    className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                      form.role === role
                        ? "bg-primary/5 border-primary/30"
                        : "bg-surface-2 border-border hover:border-border-2"
                    }`}
                  >
                    <input
                      type="radio"
                      name="role"
                      value={role}
                      checked={form.role === role}
                      onChange={() => setForm({ ...form, role })}
                      className="mt-0.5 accent-[#ff500b]"
                    />
                    <div>
                      <p className="text-xs font-semibold text-text">{ROLE_LABELS[role]}</p>
                      <p className="text-[10px] text-muted mt-0.5">{ROLE_DESCRIPTIONS[role]}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {error && <p className="text-xs text-danger bg-danger/10 border border-danger/20 rounded-lg px-3 py-2">{error}</p>}

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => { setModal(false); setError(""); }}
                className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted hover:text-text transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={saving || !form.name || !form.email || form.password.length < 8}
                className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-bold disabled:opacity-50 hover:bg-primary-dim transition-colors"
              >
                {saving ? "Creating…" : "Create Admin"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
