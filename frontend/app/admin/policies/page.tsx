"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Protected } from "@/components/layout/protected";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export default function AdminPoliciesPage() {
  return (
    <Protected>
      <AdminPoliciesContent />
    </Protected>
  );
}

function AdminPoliciesContent() {
  const qc = useQueryClient();
  const policies = useQuery({
    queryKey: ["policies-admin"],
    queryFn: async () =>
      (await api.get("/api/policies", { params: { include_inactive: true } })).data,
  });

  const upload = useMutation({
    mutationFn: async (formData: FormData) =>
      (
        await api.post("/api/policies", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        })
      ).data,
    onSuccess: () => {
      toast.success("Policy uploaded");
      qc.invalidateQueries({ queryKey: ["policies-admin"] });
      qc.invalidateQueries({ queryKey: ["policies"] });
    },
    onError: () => toast.error("Upload failed"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/api/policies/${id}`)).data,
    onSuccess: () => {
      toast.success("Policy deactivated");
      qc.invalidateQueries({ queryKey: ["policies-admin"] });
    },
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="page-title">Manage policies</h1>
        <p className="text-muted-foreground">Upload and version HR policy documents</p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Upload policy</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid max-w-xl gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              upload.mutate(fd);
              e.currentTarget.reset();
            }}
          >
            <div className="space-y-1">
              <Label>Title</Label>
              <Input name="title" required />
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea name="description" />
            </div>
            <div className="space-y-1">
              <Label>File</Label>
              <Input name="file" type="file" required />
            </div>
            <Button type="submit" disabled={upload.isPending}>
              Upload
            </Button>
          </form>
        </CardContent>
      </Card>
      <div className="grid gap-3">
        {(policies.data || []).map(
          (p: {
            id: string;
            title: string;
            version: number;
            is_active: boolean;
            updated_at: string;
            uploaded_by_name?: string;
          }) => (
            <Card key={p.id}>
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-medium">{p.title}</p>
                  <p className="text-xs text-muted-foreground">
                    v{p.version} · {new Date(p.updated_at).toLocaleString()}
                    {p.uploaded_by_name ? ` · ${p.uploaded_by_name}` : ""}
                  </p>
                  <Badge className="mt-1" variant={p.is_active ? "success" : "secondary"}>
                    {p.is_active ? "Active" : "Inactive"}
                  </Badge>
                </div>
                {p.is_active && (
                  <Button variant="outline" size="sm" onClick={() => remove.mutate(p.id)}>
                    Deactivate
                  </Button>
                )}
              </CardContent>
            </Card>
          )
        )}
      </div>
    </div>
  );
}
