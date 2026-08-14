"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Protected } from "@/components/layout/protected";
import { api } from "@/lib/api";
import { formatMinutes } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export default function TeamAttendancePage() {
  return (
    <Protected>
      <TeamAttendanceContent />
    </Protected>
  );
}

function TeamAttendanceContent() {
  const [day, setDay] = useState(new Date().toISOString().slice(0, 10));
  const rows = useQuery({
    queryKey: ["team-attendance", day],
    queryFn: async () =>
      (await api.get("/api/attendance/team", { params: { attendance_date: day } })).data,
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="page-title">Team attendance</h1>
        <p className="text-muted-foreground">Daily view of your direct reports</p>
      </header>
      <div className="space-y-1">
        <Label>Date</Label>
        <Input type="date" className="max-w-xs" value={day} onChange={(e) => setDay(e.target.value)} />
      </div>
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b bg-surface-muted text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Mode</th>
                <th className="px-4 py-3">In</th>
                <th className="px-4 py-3">Out</th>
                <th className="px-4 py-3">Worked</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {(rows.data || []).map(
                (r: {
                  id: string;
                  employee_name?: string;
                  work_mode: string;
                  check_in_time?: string;
                  check_out_time?: string;
                  total_minutes_worked?: number;
                  status: string;
                }) => (
                  <tr key={r.id} className="border-b">
                    <td className="px-4 py-3">{r.employee_name}</td>
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
                    <td className="px-4 py-3">
                      <Badge variant="outline">{r.status}</Badge>
                    </td>
                  </tr>
                )
              )}
              {!rows.data?.length && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    No team attendance for this date
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
