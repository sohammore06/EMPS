"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Eye, FileText, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Protected } from "@/components/layout/protected";
import { useAuth } from "@/lib/auth/auth-provider";
import { api, hasAnyRole } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type PolicyItem = {
  id: string;
  title: string;
  description?: string;
  file_name: string;
  version: number;
  updated_at: string;
  uploaded_by_name?: string;
};

function guessMime(fileName: string) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".txt")) return "text/plain";
  if (lower.endsWith(".doc") || lower.endsWith(".docx")) return "application/msword";
  return "application/octet-stream";
}

export default function PoliciesPage() {
  return (
    <Protected>
      <PoliciesContent />
    </Protected>
  );
}

function PoliciesContent() {
  const { user } = useAuth();
  const canDelete = hasAnyRole(user, ["HR", "SUPERADMIN"]);
  const qc = useQueryClient();

  const [preview, setPreview] = useState<{
    title: string;
    fileName: string;
    url: string;
    mime: string;
  } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PolicyItem | null>(null);

  const policies = useQuery({
    queryKey: ["policies"],
    queryFn: async () => (await api.get("/api/policies")).data as PolicyItem[],
  });

  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/api/policies/${id}`)).data,
    onSuccess: () => {
      toast.success("Policy deleted");
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ["policies"] });
      qc.invalidateQueries({ queryKey: ["policies-admin"] });
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e.response?.data?.detail || "Failed to delete policy"),
  });

  async function fetchPolicyBlob(id: string, inline = false) {
    const res = await api.get(`/api/policies/${id}/download`, {
      params: inline ? { inline: true } : undefined,
      responseType: "blob",
    });
    return res;
  }

  async function download(id: string, fileName: string) {
    setBusyId(id);
    try {
      const res = await fetchPolicyBlob(id, false);
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to download policy");
    } finally {
      setBusyId(null);
    }
  }

  async function view(policy: PolicyItem) {
    setBusyId(policy.id);
    try {
      const res = await fetchPolicyBlob(policy.id, true);
      const headerType = (res.headers["content-type"] as string | undefined) || "";
      const mime =
        headerType && !headerType.includes("octet-stream")
          ? headerType.split(";")[0]
          : guessMime(policy.file_name);
      const blob = new Blob([res.data], { type: mime });
      const url = URL.createObjectURL(blob);
      setPreview({
        title: policy.title,
        fileName: policy.file_name,
        url,
        mime,
      });
    } catch {
      toast.error("Failed to open policy");
    } finally {
      setBusyId(null);
    }
  }

  function closePreview() {
    if (preview?.url) URL.revokeObjectURL(preview.url);
    setPreview(null);
  }

  const canEmbed =
    !!preview &&
    (preview.mime.includes("pdf") ||
      preview.mime.startsWith("image/") ||
      preview.mime.startsWith("text/"));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="page-title">HR Policies</h1>
        <p className="text-muted-foreground">Company policies and guidelines</p>
      </header>
      <div className="grid gap-3">
        {(policies.data || []).map((p) => (
          <Card key={p.id}>
            <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
              <div>
                <CardTitle>{p.title}</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">{p.description}</p>
              </div>
              <Badge variant="secondary">v{p.version}</Badge>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Updated {new Date(p.updated_at).toLocaleString()}
                {p.uploaded_by_name ? ` · ${p.uploaded_by_name}` : ""}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => view(p)}
                  disabled={busyId === p.id || remove.isPending}
                >
                  <Eye className="h-4 w-4" />
                  View
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => download(p.id, p.file_name)}
                  disabled={busyId === p.id || remove.isPending}
                >
                  <Download className="h-4 w-4" />
                  Download
                </Button>
                {canDelete && (
                  <Button
                    variant="destructive"
                    onClick={() => setDeleteTarget(p)}
                    disabled={busyId === p.id || remove.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        {!policies.data?.length && (
          <p className="text-sm text-muted-foreground">No policies published yet.</p>
        )}
      </div>

      <Dialog open={!!preview} onOpenChange={(open) => !open && closePreview()}>
        <DialogContent className="flex max-h-[90vh] w-[min(960px,95vw)] max-w-4xl flex-col overflow-hidden p-0">
          <DialogHeader className="border-b border-[var(--border-subtle)] px-6 py-4 pr-12">
            <DialogTitle>{preview?.title}</DialogTitle>
            <p className="text-xs text-muted-foreground">{preview?.fileName}</p>
          </DialogHeader>

          <div className="min-h-0 flex-1 bg-surface-secondary">
            {preview && canEmbed && preview.mime.startsWith("image/") && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview.url}
                alt={preview.title}
                className="mx-auto max-h-[70vh] w-auto object-contain p-4"
              />
            )}
            {preview && canEmbed && preview.mime.includes("pdf") && (
              <iframe
                title={preview.title}
                src={preview.url}
                className="h-[70vh] w-full border-0"
              />
            )}
            {preview && canEmbed && preview.mime.startsWith("text/") && (
              <iframe
                title={preview.title}
                src={preview.url}
                className="h-[70vh] w-full border-0 bg-white"
              />
            )}
            {preview && !canEmbed && (
              <div className="flex h-[50vh] flex-col items-center justify-center gap-3 px-6 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-muted text-brand">
                  <FileText className="h-7 w-7" />
                </div>
                <p className="font-medium text-foreground">Preview not available for this file type</p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  {preview.fileName} can&apos;t be shown in the browser. Download it to open locally.
                </p>
                <Button
                  onClick={() => {
                    const a = document.createElement("a");
                    a.href = preview.url;
                    a.download = preview.fileName;
                    a.click();
                  }}
                >
                  <Download className="h-4 w-4" />
                  Download file
                </Button>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-[var(--border-subtle)] px-6 py-3">
            <Button variant="outline" onClick={closePreview}>
              Close
            </Button>
            {preview && (
              <Button
                onClick={() => {
                  const a = document.createElement("a");
                  a.href = preview.url;
                  a.download = preview.fileName;
                  a.click();
                }}
              >
                <Download className="h-4 w-4" />
                Download
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete policy?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will remove{" "}
            <span className="font-medium text-foreground">{deleteTarget?.title}</span> from the
            policy portal. Employees will no longer be able to view or download it.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={remove.isPending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!deleteTarget || remove.isPending}
              onClick={() => deleteTarget && remove.mutate(deleteTarget.id)}
            >
              <Trash2 className="h-4 w-4" />
              {remove.isPending ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
