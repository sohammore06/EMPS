"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Baby,
  CalendarCheck2,
  ClipboardList,
  FileText,
  LayoutDashboard,
  LogOut,
  Users,
  UserCircle2,
  Cake,
  Clock3,
} from "lucide-react";
import { useAuth } from "@/lib/auth/auth-provider";
import { hasAnyRole } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const employeeLinks = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/attendance", label: "Attendance", icon: Clock3 },
  { href: "/leave", label: "Leave", icon: CalendarCheck2 },
  { href: "/birthdays", label: "Birthdays", icon: Cake },
  { href: "/policies", label: "Policies", icon: FileText },
  { href: "/profile", label: "Profile", icon: UserCircle2 },
];

const managerLinks = [
  { href: "/manager/pending-leaves", label: "Pending Leaves", icon: ClipboardList },
  { href: "/manager/team-attendance", label: "Team Attendance", icon: Users },
];

const hrLinks = [
  { href: "/admin/employees", label: "Employees", icon: Users },
  { href: "/admin/attendance-report", label: "Attendance Report", icon: Clock3 },
  { href: "/admin/leave-types", label: "Leave Types", icon: Baby },
  { href: "/admin/policies", label: "Manage Policies", icon: FileText },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const isManager = hasAnyRole(user, ["MANAGER", "HR", "SUPERADMIN"]);
  const isHr = hasAnyRole(user, ["HR", "SUPERADMIN"]);

  return (
    <div className="mx-auto flex min-h-screen max-w-[1440px] gap-5 px-3 py-4 md:gap-6 md:px-6 md:py-6">
      <aside className="hidden w-64 shrink-0 flex-col rounded-lg border border-[var(--border-subtle)] bg-white p-4 shadow-card md:flex">
        <div className="mb-6 border-b border-[var(--border-subtle)] px-2 pb-4">
          <p className="text-xl font-semibold tracking-tight text-brand">Intellify HRMS</p>
          <p className="mt-1 text-xs text-muted-foreground">Employee Self-Service</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {employeeLinks.map((link) => (
            <NavItem key={link.href} {...link} active={pathname.startsWith(link.href)} />
          ))}
          {isManager && (
            <>
              <p className="mb-1 mt-5 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Manager
              </p>
              {managerLinks.map((link) => (
                <NavItem key={link.href} {...link} active={pathname.startsWith(link.href)} />
              ))}
            </>
          )}
          {isHr && (
            <>
              <p className="mb-1 mt-5 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                HR Admin
              </p>
              {hrLinks.map((link) => (
                <NavItem key={link.href} {...link} active={pathname.startsWith(link.href)} />
              ))}
            </>
          )}
        </nav>
        <div className="mt-4 border-t border-[var(--border-subtle)] pt-4">
          <p className="truncate px-2 text-sm font-medium text-foreground">{user?.name}</p>
          <p className="truncate px-2 text-xs text-muted-foreground">{user?.email}</p>
          <Button variant="ghost" className="mt-2 w-full justify-start" onClick={() => logout()}>
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </div>
      </aside>
      <main className="min-w-0 flex-1">
        <div className="mb-4 flex items-center justify-between rounded-lg border border-[var(--border-subtle)] bg-white px-4 py-3 shadow-soft md:hidden">
          <p className="text-lg font-semibold text-brand">Intellify HRMS</p>
          <Button size="sm" variant="outline" onClick={() => logout()}>
            Sign out
          </Button>
        </div>
        {children}
      </main>
    </div>
  );
}

function NavItem({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-all duration-200",
        active
          ? "bg-brand text-white shadow-soft"
          : "text-slate-600 hover:bg-surface-muted hover:text-brand"
      )}
    >
      <Icon className={cn("h-4 w-4", active ? "text-white" : "text-brand")} />
      {label}
    </Link>
  );
}
