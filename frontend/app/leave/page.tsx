"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Protected } from "@/components/layout/protected";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const schema = z.object({
  leave_type_id: z.string().min(1),
  from_date: z.string().min(1),
  to_date: z.string().min(1),
  is_half_day: z.boolean().default(false),
  half_day_session: z.enum(["FIRST_HALF", "SECOND_HALF"]).optional(),
  reason: z.string().min(3),
});

type FormValues = z.infer<typeof schema>;

export default function LeavePage() {
  return (
    <Protected>
      <LeaveContent />
    </Protected>
  );
}

function LeaveContent() {
  const qc = useQueryClient();
  const [halfDay, setHalfDay] = useState(false);

  const types = useQuery({
    queryKey: ["leave-types"],
    queryFn: async () => (await api.get("/api/leave/types")).data,
  });
  const balance = useQuery({
    queryKey: ["leave-balance"],
    queryFn: async () => (await api.get("/api/leave/balance")).data,
  });
  const history = useQuery({
    queryKey: ["leave-my"],
    queryFn: async () => (await api.get("/api/leave/my")).data,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      leave_type_id: "",
      from_date: "",
      to_date: "",
      is_half_day: false,
      reason: "",
    },
  });

  const apply = useMutation({
    mutationFn: async (values: FormValues) =>
      (
        await api.post("/api/leave/apply", {
          ...values,
          is_half_day: halfDay,
          half_day_session: halfDay ? values.half_day_session : null,
          to_date: halfDay ? values.from_date : values.to_date,
        })
      ).data,
    onSuccess: () => {
      toast.success("Leave applied");
      form.reset();
      setHalfDay(false);
      qc.invalidateQueries({ queryKey: ["leave-my"] });
      qc.invalidateQueries({ queryKey: ["leave-balance"] });
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e.response?.data?.detail || "Failed to apply leave"),
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="page-title">Leave</h1>
        <p className="text-muted-foreground">Apply, track balances, and view history</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(balance.data || []).map(
          (b: {
            leave_type_id: string;
            leave_type_code: string;
            leave_type_name: string;
            balance: number;
          }) => (
            <Card key={b.leave_type_id}>
              <CardContent className="p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{b.leave_type_code}</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight text-brand-deep">{b.balance}</p>
                <p className="text-sm text-muted-foreground">{b.leave_type_name}</p>
              </CardContent>
            </Card>
          )
        )}
        {!balance.data?.length && (
          <p className="text-sm text-muted-foreground">No leave balances allocated yet.</p>
        )}
      </div>

      <Tabs defaultValue="apply">
        <TabsList>
          <TabsTrigger value="apply">Apply</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        <TabsContent value="apply">
          <Card>
            <CardHeader>
              <CardTitle>Apply for leave</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                className="grid max-w-xl gap-4"
                onSubmit={form.handleSubmit((v) => apply.mutate(v))}
              >
                <div className="space-y-1">
                  <Label>Leave type</Label>
                  <select
                    className="form-select"
                    {...form.register("leave_type_id")}
                  >
                    <option value="">Select type</option>
                    {(types.data || []).map((t: { id: string; code: string; name: string }) => (
                      <option key={t.id} value={t.id}>
                        {t.code} — {t.name}
                      </option>
                    ))}
                  </select>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={halfDay}
                    onChange={(e) => {
                      setHalfDay(e.target.checked);
                      form.setValue("is_half_day", e.target.checked);
                    }}
                  />
                  Half day
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label>From</Label>
                    <Input type="date" {...form.register("from_date")} />
                  </div>
                  {!halfDay && (
                    <div className="space-y-1">
                      <Label>To</Label>
                      <Input type="date" {...form.register("to_date")} />
                    </div>
                  )}
                  {halfDay && (
                    <div className="space-y-1">
                      <Label>Session</Label>
                      <select
                        className="form-select"
                        {...form.register("half_day_session")}
                      >
                        <option value="FIRST_HALF">First half</option>
                        <option value="SECOND_HALF">Second half</option>
                      </select>
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  <Label>Reason</Label>
                  <Textarea {...form.register("reason")} />
                </div>
                <Button type="submit" disabled={apply.isPending}>
                  Submit request
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="history">
          <Card>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="border-b bg-surface-muted text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Dates</th>
                    <th className="px-4 py-3">Days</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {(history.data || []).map(
                    (r: {
                      id: string;
                      leave_type_code?: string;
                      from_date: string;
                      to_date: string;
                      total_days?: number;
                      status: string;
                      reason?: string;
                      is_half_day?: boolean;
                      half_day_session?: string;
                    }) => (
                      <tr key={r.id} className="border-b">
                        <td className="px-4 py-3">{r.leave_type_code || "—"}</td>
                        <td className="px-4 py-3">
                          {r.from_date} → {r.to_date}
                          {r.is_half_day ? ` (${r.half_day_session})` : ""}
                        </td>
                        <td className="px-4 py-3">{r.total_days ?? "—"}</td>
                        <td className="px-4 py-3">
                          <Badge
                            variant={
                              r.status === "APPROVED"
                                ? "success"
                                : r.status === "REJECTED"
                                  ? "destructive"
                                  : "warning"
                            }
                          >
                            {r.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">{r.reason}</td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
