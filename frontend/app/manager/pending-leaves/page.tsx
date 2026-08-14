"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Protected } from "@/components/layout/protected";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea, Label } from "@/components/ui/input";

export default function PendingLeavesPage() {
  return (
    <Protected>
      <PendingContent />
    </Protected>
  );
}

function PendingContent() {
  const qc = useQueryClient();
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const pending = useQuery({
    queryKey: ["leave-pending"],
    queryFn: async () => (await api.get("/api/leave/pending")).data,
  });

  const approve = useMutation({
    mutationFn: async (id: string) => (await api.post(`/api/leave/${id}/approve`)).data,
    onSuccess: () => {
      toast.success("Leave approved");
      qc.invalidateQueries({ queryKey: ["leave-pending"] });
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e.response?.data?.detail || "Approve failed"),
  });

  const reject = useMutation({
    mutationFn: async () =>
      (
        await api.post(`/api/leave/${rejectId}/reject`, {
          rejection_reason: reason,
        })
      ).data,
    onSuccess: () => {
      toast.success("Leave rejected");
      setRejectId(null);
      setReason("");
      qc.invalidateQueries({ queryKey: ["leave-pending"] });
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e.response?.data?.detail || "Reject failed"),
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="page-title">Pending leave requests</h1>
        <p className="text-muted-foreground">Approve or reject requests from your team</p>
      </header>

      <div className="grid gap-3">
        {(pending.data || []).map(
          (r: {
            id: string;
            employee_name?: string;
            leave_type_name?: string;
            from_date: string;
            to_date: string;
            total_days?: number;
            reason?: string;
            is_half_day?: boolean;
            half_day_session?: string;
          }) => (
            <Card key={r.id}>
              <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-medium">{r.employee_name}</p>
                  <p className="text-sm text-muted-foreground">
                    {r.leave_type_name} · {r.from_date} → {r.to_date} · {r.total_days} day(s)
                    {r.is_half_day ? ` · ${r.half_day_session}` : ""}
                  </p>
                  <p className="mt-1 text-sm">{r.reason}</p>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => approve.mutate(r.id)} disabled={approve.isPending}>
                    Approve
                  </Button>
                  <Button variant="outline" onClick={() => setRejectId(r.id)}>
                    Reject
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        )}
        {!pending.data?.length && (
          <p className="text-sm text-muted-foreground">No pending requests.</p>
        )}
      </div>

      <Dialog open={!!rejectId} onOpenChange={(open) => !open && setRejectId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject leave request</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Reason</Label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            <Button variant="destructive" onClick={() => reject.mutate()} disabled={reject.isPending}>
              Confirm reject
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
