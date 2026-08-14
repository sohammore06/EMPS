"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Protected } from "@/components/layout/protected";
import { api } from "@/lib/api";
import { formatMinutes } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";

export default function AttendanceReportPage() {
  return (
    <Protected>
      <ReportContent />
    </Protected>
  );
}

function ReportContent() {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [workMode, setWorkMode] = useState("");
  const [employeeId, setEmployeeId] = useState("");

  const report = useQuery({
    queryKey: ["attendance-report", fromDate, toDate, workMode, employeeId],
    queryFn: async () =>
      (
        await api.get("/api/attendance/report", {
          params: {
            from_date: fromDate || undefined,
            to_date: toDate || undefined,
            work_mode: workMode || undefined,
            employee_id: employeeId || undefined,
          },
        })
      ).data,
  });

  async function exportCsv() {
    const res = await api.get("/api/attendance/report", {
      params: {
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
        work_mode: workMode || undefined,
        employee_id: employeeId || undefined,
        export: "csv",
      },
      responseType: "blob",
    });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = "attendance_report.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="page-title">Attendance report</h1>
        <p className="text-muted-foreground">Filter and export organization attendance</p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <Label>From</Label>
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>To</Label>
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Work mode</Label>
            <select
              className="form-select"
              value={workMode}
              onChange={(e) => setWorkMode(e.target.value)}
            >
              <option value="">All</option>
              <option value="OFFICE">Office</option>
              <option value="WFH">WFH</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label>Employee ID</Label>
            <Input value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} />
          </div>
          <Button onClick={exportCsv}>Export CSV</Button>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b bg-surface-muted text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Mode</th>
                <th className="px-4 py-3">Worked</th>
                <th className="px-4 py-3">OT</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {(report.data || []).map(
                (r: {
                  id: string;
                  employee_name?: string;
                  attendance_date: string;
                  work_mode: string;
                  total_minutes_worked?: number;
                  overtime_minutes: number;
                  status: string;
                }) => (
                  <tr key={r.id} className="border-b">
                    <td className="px-4 py-3">{r.employee_name}</td>
                    <td className="px-4 py-3">{r.attendance_date}</td>
                    <td className="px-4 py-3">{r.work_mode}</td>
                    <td className="px-4 py-3">
                      {r.total_minutes_worked != null ? formatMinutes(r.total_minutes_worked) : "—"}
                    </td>
                    <td className="px-4 py-3">{formatMinutes(r.overtime_minutes || 0)}</td>
                    <td className="px-4 py-3">{r.status}</td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
