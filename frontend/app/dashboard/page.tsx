"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Protected } from "@/components/layout/protected";
import { useAuth } from "@/lib/auth/auth-provider";
import { api, hasAnyRole } from "@/lib/api";
import { formatMinutes } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

export default function DashboardPage() {
  return (
    <Protected>
      <DashboardContent />
    </Protected>
  );
}

function DashboardContent() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isHr = hasAnyRole(user, ["HR", "SUPERADMIN"]);
  const isManager = hasAnyRole(user, ["MANAGER", "HR", "SUPERADMIN"]);

  const me = useQuery({
    queryKey: ["dashboard-me"],
    queryFn: async () => (await api.get("/api/dashboard/me")).data,
  });

  const hr = useQuery({
    queryKey: ["dashboard-hr"],
    queryFn: async () => (await api.get("/api/dashboard/hr")).data,
    enabled: isHr,
  });

  const manager = useQuery({
    queryKey: ["dashboard-manager"],
    queryFn: async () => (await api.get("/api/dashboard/manager")).data,
    enabled: isManager,
  });

  const checkIn = useMutation({
    mutationFn: async (work_mode: "OFFICE" | "WFH") =>
      (await api.post("/api/attendance/check-in", { work_mode })).data,
    onSuccess: () => {
      toast.success("Checked in");
      qc.invalidateQueries({ queryKey: ["dashboard-me"] });
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e.response?.data?.detail || "Check-in failed"),
  });

  const checkOut = useMutation({
    mutationFn: async () => (await api.post("/api/attendance/check-out", {})).data,
    onSuccess: (data) => {
      toast.success(`Checked out · ${formatMinutes(data.total_minutes_worked || 0)}`);
      qc.invalidateQueries({ queryKey: ["dashboard-me"] });
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e.response?.data?.detail || "Check-out failed"),
  });

  const d = me.data;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="page-title">Welcome, {user?.name}</h1>
        <p className="page-subtitle">
          {user?.designation || "Employee"}
          {user?.department ? ` · ${user.department}` : ""}
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Today&apos;s attendance</CardTitle>
          <CardDescription>Check in and out for the day</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          {d?.is_holiday_today && !d?.checked_in_today ? (
            <Badge variant="secondary">Holiday{d.today_holiday_name ? ` · ${d.today_holiday_name}` : ""}</Badge>
          ) : d?.checked_in_today ? (
            <Badge variant="success">
              Checked in{d.today_work_mode ? ` · ${d.today_work_mode}` : ""}
            </Badge>
          ) : (
            <>
              <Button onClick={() => checkIn.mutate("OFFICE")} disabled={checkIn.isPending}>
                Check in · Office
              </Button>
              <Button variant="accent" onClick={() => checkIn.mutate("WFH")} disabled={checkIn.isPending}>
                Check in · WFH
              </Button>
            </>
          )}
          {d?.checked_in_today && !d?.checked_out_today && (
            <Button variant="outline" onClick={() => checkOut.mutate()} disabled={checkOut.isPending}>
              Check out
            </Button>
          )}
          {d?.checked_out_today && <Badge variant="secondary">Checked out</Badge>}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat title="Leave balance" value={String(d?.leave_balance_total ?? "—")} />
        <Stat title="Pending leaves" value={String(d?.pending_leaves ?? "—")} />
        <Stat title="Month worked" value={d ? formatMinutes(d.month_worked_minutes || 0) : "—"} />
        <Stat title="Birthdays this week" value={String(d?.upcoming_birthdays ?? "—")} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upcoming Holidays</CardTitle>
          <CardDescription>
            <Link href="/holidays" className="text-primary underline-offset-4 hover:underline">
              Open holiday calendar
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {(d?.upcoming_holidays || []).map(
            (holiday: { holiday_id: number; holiday_date: string; holiday_name: string; holiday_type: string }) => (
              <div key={holiday.holiday_id} className="flex items-center justify-between rounded-md border border-[var(--border-subtle)] px-3 py-2">
                <p className="font-medium">{holiday.holiday_name}</p>
                <p className="text-sm text-muted-foreground">
                  {(() => {
                    const [y, m, day] = holiday.holiday_date.split("-").map(Number);
                    return new Date(y, m - 1, day).toLocaleDateString(undefined, { day: "2-digit", month: "short" });
                  })()}
                  <span className="ml-2 text-xs uppercase">{holiday.holiday_type}</span>
                </p>
              </div>
            )
          )}
          {!d?.upcoming_holidays?.length && (
            <p className="text-sm text-muted-foreground">No upcoming holidays</p>
          )}
        </CardContent>
      </Card>

      {isManager && manager.data && (
        <Card>
          <CardHeader>
            <CardTitle>Team snapshot</CardTitle>
            <CardDescription>
              <Link href="/manager/pending-leaves" className="text-primary underline-offset-4 hover:underline">
                Review pending leave requests
              </Link>
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-4">
            <Stat title="Team size" value={manager.data.team_size} compact />
            <Stat title="Present" value={manager.data.present_today} compact />
            <Stat title="WFH" value={manager.data.wfh_today} compact />
            <Stat title="Pending leaves" value={manager.data.pending_leave_requests} compact />
          </CardContent>
        </Card>
      )}

      {isHr && hr.data && (
        <Card>
          <CardHeader>
            <CardTitle>HR dashboard</CardTitle>
            <CardDescription>Organization-wide attendance and leave pulse</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat title="Employees" value={hr.data.total_employees} compact />
            <Stat title="Present" value={hr.data.present_today} compact />
            <Stat title="WFH" value={hr.data.wfh_today} compact />
            <Stat title="On leave" value={hr.data.employees_on_leave_today} compact />
            <Stat title="Birthdays" value={hr.data.today_birthdays} compact />
            <Stat title="Pending" value={hr.data.pending_leave_requests} compact />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({
  title,
  value,
  compact,
}: {
  title: string;
  value: string | number;
  compact?: boolean;
}) {
  return (
    <div
      className={
        compact
          ? "rounded-md border border-[var(--border-subtle)] bg-surface-muted/70 p-3"
          : "rounded-lg border border-[var(--border-subtle)] bg-white p-4 shadow-soft"
      }
    >
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-brand-deep">{value}</p>
    </div>
  );
}
