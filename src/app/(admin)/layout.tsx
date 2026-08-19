"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isLoggedIn } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  // Three-state: null = not yet checked (SSR/first paint), true = authed, false = not authed
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    const ok = isLoggedIn();
    setAuthed(ok);
    if (!ok) router.replace("/login");
  }, [router]);

  // While checking (SSR + first paint): render nothing — avoids hydration mismatch
  if (authed === null) return null;

  // Redirect in progress
  if (!authed) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
