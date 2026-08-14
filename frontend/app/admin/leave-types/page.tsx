"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Protected } from "@/components/layout/protected";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export default function LeaveTypesPage() {
  return (
    <Protected>
      <LeaveTypesContent />
    </Protected>
  );
}

function LeaveTypesContent() {
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");

  const types = useQuery({
    queryKey: ["leave-types-admin"],
    queryFn: async () => (await api.get("/api/leave/types", { params: { active_only: false } })).data,
  });

  const create = useMutation({
    mutationFn: async () => (await api.post("/api/leave/types", { code, name, is_active: true })).data,
    onSuccess: () => {
      toast.success("Leave type created");
      setCode("");
      setName("");
      qc.invalidateQueries({ queryKey: ["leave-types-admin"] });
      qc.invalidateQueries({ queryKey: ["leave-types"] });
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e.response?.data?.detail || "Create failed"),
  });

  const deactivate = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/api/leave/types/${id}`)).data,
    onSuccess: () => {
      toast.success("Deactivated");
      qc.invalidateQueries({ queryKey: ["leave-types-admin"] });
    },
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="page-title">Leave types</h1>
        <p className="text-muted-foreground">Manage dynamic leave categories</p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Add leave type</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label>Code</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="CL" />
          </div>
          <div className="space-y-1">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Casual Leave" />
          </div>
          <Button onClick={() => create.mutate()} disabled={!code || !name || create.isPending}>
            Create
          </Button>
        </CardContent>
      </Card>
      <div className="grid gap-3">
        {(types.data || []).map((t: { id: string; code: string; name: string; is_active: boolean }) => (
          <Card key={t.id}>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium">
                  {t.code} — {t.name}
                </p>
                <Badge variant={t.is_active ? "success" : "secondary"} className="mt-1">
                  {t.is_active ? "Active" : "Inactive"}
                </Badge>
              </div>
              {t.is_active && (
                <Button variant="outline" size="sm" onClick={() => deactivate.mutate(t.id)}>
                  Deactivate
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
