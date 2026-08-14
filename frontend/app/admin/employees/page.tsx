"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Protected } from "@/components/layout/protected";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";

export default function EmployeesPage() {
  return (
    <Protected>
      <EmployeesContent />
    </Protected>
  );
}

function EmployeesContent() {
  const [q, setQ] = useState("");
  const employees = useQuery({
    queryKey: ["directory", q],
    queryFn: async () =>
      (await api.get("/api/users/directory", { params: q ? { q } : {} })).data,
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="page-title">Employee directory</h1>
        <p className="text-muted-foreground">Browse employees registered in EPMS</p>
      </header>
      <div className="max-w-md space-y-1">
        <Label>Search</Label>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, email, code..." />
      </div>
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b bg-surface-muted text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Designation</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {(employees.data || []).map(
                (e: {
                  id: string;
                  employee_code?: string;
                  name: string;
                  email: string;
                  department?: string;
                  designation?: string;
                  employment_status?: string;
                }) => (
                  <tr key={e.id} className="border-b">
                    <td className="px-4 py-3">{e.employee_code || "—"}</td>
                    <td className="px-4 py-3">{e.name}</td>
                    <td className="px-4 py-3">{e.email}</td>
                    <td className="px-4 py-3">{e.department || "—"}</td>
                    <td className="px-4 py-3">{e.designation || "—"}</td>
                    <td className="px-4 py-3">{e.employment_status || "—"}</td>
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
