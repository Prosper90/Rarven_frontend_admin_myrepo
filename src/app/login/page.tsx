"use client";
import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { adminApi } from "@/lib/api";
import { setToken, setAdminInfo, isLoggedIn } from "@/lib/auth";
import BrandName from "@/components/BrandName";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail]     = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady]     = useState(false); // true once client has checked localStorage

  // Skip the login page if already authed — runs only on client
  useEffect(() => {
    if (isLoggedIn()) {
      router.replace("/dashboard");
    } else {
      setReady(true);
    }
  }, [router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await adminApi.login(email, password);
      setToken(res.accessToken);
      setAdminInfo(res.admin);
      router.push("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
      setLoading(false);
    }
  }

  // Don't render the form until we've confirmed the user isn't already logged in
  if (!ready) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-8">
          <Image src="/logo.png" alt="raRVen" width={48} height={48} className="rounded-xl" />
          <div>
            <BrandName className="text-lg font-black text-text" />
            <p className="text-[10px] text-faint uppercase tracking-[0.15em]">Admin Console</p>
          </div>
        </div>

        <div className="bg-surface border border-border rounded-2xl p-6">
          <h1 className="text-base font-bold text-text mb-1">Sign in</h1>
          <p className="text-xs text-muted mb-6">Enter your admin credentials to continue.</p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted uppercase tracking-wider">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                placeholder="admin@rarven.gg"
                className="bg-surface-2 border border-border rounded-xl px-4 py-3 text-sm text-text outline-none focus:border-primary/50 placeholder:text-faint transition-colors"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted uppercase tracking-wider">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="bg-surface-2 border border-border rounded-xl px-4 py-3 text-sm text-text outline-none focus:border-primary/50 placeholder:text-faint transition-colors"
              />
            </div>

            {error && (
              <p className="text-xs text-danger bg-danger/10 border border-danger/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full py-3 rounded-xl bg-primary text-white font-bold text-sm transition-all hover:bg-primary-dim disabled:opacity-50 disabled:cursor-not-allowed mt-1"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>

        <p className="text-[10px] text-faint text-center mt-4">
          raRVen Admin · Authorised personnel only
        </p>
      </div>
    </div>
  );
}
