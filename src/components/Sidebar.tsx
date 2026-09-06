"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import {
  LayoutDashboard,
  CalendarRange,
  CalendarDays,
  Zap,
  TrendingUp,
  User,
  Users,
  Shield,
  Trophy,
  LogOut,
} from "lucide-react";
import { clearToken, getAdminInfo, StoredAdminInfo } from "@/lib/auth";
import BrandName from "@/components/BrandName";

type AdminRole = "superadmin" | "pool_manager" | "support";

const NAV: { href: string; label: string; icon: React.ElementType; roles: AdminRole[]; disabled?: boolean }[] = [
  { href: "/dashboard",  label: "Dashboard",   icon: LayoutDashboard, roles: ["superadmin", "pool_manager", "support"] },
  { href: "/matchdays",  label: "Match Weeks", icon: CalendarRange,   roles: ["superadmin", "pool_manager"] },
  { href: "/match-days", label: "Match Days",  icon: CalendarDays,    roles: ["superadmin", "pool_manager"] },
  { href: "/classic",    label: "Classic",     icon: Zap,             roles: ["superadmin", "pool_manager"] },
  { href: "/pro",        label: "Fantasy",     icon: TrendingUp,      roles: ["superadmin", "pool_manager"] },
  { href: "/competitions", label: "Competitions", icon: Trophy,       roles: ["superadmin", "pool_manager"] },
  { href: "/players",    label: "Players",     icon: User,            roles: ["superadmin", "pool_manager"] },
  { href: "/users",      label: "Users",       icon: Users,           roles: ["superadmin", "pool_manager", "support"] },
  { href: "/admins",     label: "Admins",      icon: Shield,          roles: ["superadmin"] },
];

export default function Sidebar() {
  const path   = usePathname();
  const router = useRouter();

  const [admin, setAdmin] = useState<StoredAdminInfo | null>(null);

  useEffect(() => {
    setAdmin(getAdminInfo());
  }, []);

  const role       = (admin?.role ?? "support") as AdminRole;
  const visibleNav = NAV.filter((item) => item.roles.includes(role));

  function handleLogout() {
    clearToken();
    router.push("/login");
  }

  return (
    <aside className="w-56 shrink-0 bg-surface border-r border-border flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-border">
        <div className="flex items-center gap-2.5">
          <Image src="/logo.png" alt="raRVen" width={38} height={38} className="rounded-xl" />
          <div>
            <BrandName className="text-sm font-black text-text" />
            <p className="text-[9px] text-faint uppercase tracking-[0.15em] leading-none mt-0.5">Admin Console</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5 overflow-y-auto">
        {visibleNav.map((item) => {
          const active = !item.disabled && (path === item.href || (item.href !== "/dashboard" && path.startsWith(item.href)));
          const Icon = item.icon;

          if (item.disabled) {
            return (
              <div
                key={item.href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm opacity-35 cursor-not-allowed select-none"
                title="Coming soon"
              >
                <Icon size={16} strokeWidth={2} className="text-faint" />
                <span className="text-faint flex-1">{item.label}</span>
                <span className="text-[9px] font-black uppercase tracking-wider text-faint border border-faint/30 px-1.5 py-0.5 rounded">
                  Soon
                </span>
              </div>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                active
                  ? "bg-primary/10 text-primary font-semibold"
                  : "text-muted hover:text-text hover:bg-surface-2"
              }`}
            >
              <Icon size={16} strokeWidth={active ? 2.5 : 2} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Role badge + logout */}
      <div className="px-4 py-4 border-t border-border">
        {admin && (
          <div className="mb-3">
            <p className="text-xs font-semibold text-text truncate">{admin.name}</p>
            <span className={`inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
              role === "superadmin"
                ? "bg-primary/10 border-primary/20 text-primary"
                : role === "pool_manager"
                ? "bg-info/10 border-info/20 text-info"
                : "bg-warning/10 border-warning/20 text-warning"
            }`}>
              {role === "superadmin" ? "Super Admin" : role === "pool_manager" ? "Pool Manager" : "Support"}
            </span>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="w-full text-xs text-muted hover:text-danger transition-colors text-left px-1 flex items-center gap-2"
        >
          <LogOut size={13} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
