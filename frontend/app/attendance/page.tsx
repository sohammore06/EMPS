"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Protected } from "@/components/layout/protected";
import { api } from "@/lib/api";
import { formatMinutes } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function AttendancePage() {
  return (
    <Protected>
      <AttendanceContent />
    </Protected>
  );
}

function AttendanceContent() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const qc = useQueryClient();

  const summary = useQuery({
    queryKey: ["attendance-me", month, year],
    queryFn: async () =>
      (await api.get("/api/attendance/me", { params: { month, year } })).data,
  });

  const today = useQuery({
    queryKey: ["attendance-today"],
    queryFn: async () => (await api.get("/api/attendance/today")).data,
  });

  const checkIn = useMutation({
    mutationFn: async (work_mode: "OFFICE" | "WFH") =>
      (await api.post("/api/attendance/check-in", { work_mode })).data,
    onSuccess: () => {
      toast.success("Checked in");
      qc.invalidateQueries({ queryKey: ["attendance"] });
      qc.invalidateQueries({ queryKey: ["attendance-today"] });
      qc.invalidateQueries({ queryKey: ["attendance-me"] });
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e.response?.data?.detail || "Failed"),
  });

  const checkOut = useMutation({
    mutationFn: async () => (await api.post("/api/attendance/check-out", {})).data,
    onSuccess: (data) => {
      toast.success(`Checked out · worked ${formatMinutes(data.total_minutes_worked || 0)}`);
      qc.invalidateQueries({ queryKey: ["attendance-today"] });
      qc.invalidateQueries({ queryKey: ["attendance-me"] });
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e.response?.data?.detail || "Failed"),
  });

  const s = summary.data;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="page-title">My Attendance</h1>
        <p className="text-muted-foreground">Daily check-in, check-out, and monthly summary</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Check in / Check out</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          {today.data?.status === "HOLIDAY" && !today.data?.check_in_time ? (
            <Badge variant="secondary">Holiday{today.data.notes ? ` · ${today.data.notes}` : ""}</Badge>
          ) : !today.data?.check_in_time ? (
            <>
              <Button onClick={() => checkIn.mutate("OFFICE")}>Office</Button>
              <Button variant="accent" onClick={() => checkIn.mutate("WFH")}>
                WFH
              </Button>
            </>
          ) : !today.data?.check_out_time ? (
            <>
              <Badge variant="success">In · {today.data.work_mode}</Badge>
              <Button variant="outline" onClick={() => checkOut.mutate()}>
                Check out
              </Button>
            </>
          ) : (
            <Badge variant="secondary">
              Done · {formatMinutes(today.data.total_minutes_worked || 0)} · OT{" "}
              {formatMinutes(today.data.overtime_minutes || 0)}
            </Badge>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs text-muted-foreground">Month</label>
          <select
            className="form-select ml-2 w-auto"
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Year</label>
          <select
            className="form-select ml-2 w-auto"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {[year - 1, year, year + 1].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {s && (
        <div className="grid gap-3 sm:grid-cols-4">
          <Mini label="Worked" value={formatMinutes(s.total_worked_minutes)} />
          <Mini label="Overtime" value={formatMinutes(s.total_overtime_minutes)} />
          <Mini label="Office days" value={s.present_count} />
          <Mini label="WFH days" value={s.wfh_count} />
        </div>
      )}

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b bg-surface-muted text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Mode</th>
                <th className="px-4 py-3">In</th>
                <th className="px-4 py-3">Out</th>
                <th className="px-4 py-3">Worked</th>
                <th className="px-4 py-3">OT</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {(s?.records || []).map(
                (r: {
                  id: string;
                  attendance_date: string;
                  work_mode: string;
                  check_in_time?: string;
                  check_out_time?: string;
                  total_minutes_worked?: number;
                  overtime_minutes: number;
                  status: string;
                }) => (
                  <tr key={r.id} className="border-b">
                    <td className="px-4 py-3">{r.attendance_date}</td>
                    <td className="px-4 py-3">{r.work_mode}</td>
                    <td className="px-4 py-3">
                      {r.check_in_time ? new Date(r.check_in_time).toLocaleTimeString() : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {r.check_out_time ? new Date(r.check_out_time).toLocaleTimeString() : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {r.total_minutes_worked != null ? formatMinutes(r.total_minutes_worked) : "—"}
                    </td>
                    <td className="px-4 py-3">{formatMinutes(r.overtime_minutes || 0)}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline">{r.status}</Badge>
                    </td>
                  </tr>
                )
              )}
              {!s?.records?.length && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    No attendance records for this month
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-white p-4 shadow-soft">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight text-brand-deep">{value}</p>
    </div>
  );
}
