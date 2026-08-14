"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Protected } from "@/components/layout/protected";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type ProfileForm = {
  phone?: string;
  date_of_birth?: string;
  address?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  linkedin_url?: string;
  github_url?: string;
};

export default function ProfilePage() {
  return (
    <Protected>
      <ProfileContent />
    </Protected>
  );
}

function ProfileContent() {
  const qc = useQueryClient();
  const form = useForm<ProfileForm>();

  const profile = useQuery({
    queryKey: ["profile-me"],
    queryFn: async () => (await api.get("/api/users/me")).data,
  });

  const certs = useQuery({
    queryKey: ["my-certs"],
    queryFn: async () => (await api.get("/api/users/me/certifications")).data,
  });

  useEffect(() => {
    if (profile.data) {
      form.reset({
        phone: profile.data.phone || "",
        date_of_birth: profile.data.date_of_birth || "",
        address: profile.data.address || "",
        emergency_contact_name: profile.data.emergency_contact_name || "",
        emergency_contact_phone: profile.data.emergency_contact_phone || "",
        linkedin_url: profile.data.linkedin_url || "",
        github_url: profile.data.github_url || "",
      });
    }
  }, [profile.data, form]);

  const save = useMutation({
    mutationFn: async (values: ProfileForm) => (await api.put("/api/users/me", values)).data,
    onSuccess: () => {
      toast.success("Profile updated");
      qc.invalidateQueries({ queryKey: ["profile-me"] });
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e.response?.data?.detail || "Update failed"),
  });

  const addCert = useMutation({
    mutationFn: async (formData: FormData) =>
      (
        await api.post("/api/users/me/certifications", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        })
      ).data,
    onSuccess: () => {
      toast.success("Certification added");
      qc.invalidateQueries({ queryKey: ["my-certs"] });
    },
    onError: () => toast.error("Failed to add certification"),
  });

  const deleteCert = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/api/users/me/certifications/${id}`)).data,
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["my-certs"] });
    },
  });

  const p = profile.data;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="page-title">My Profile</h1>
        <p className="text-muted-foreground">
          {p?.first_name} {p?.last_name} · {p?.email}
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Info label="Employee code" value={p?.employee_code} />
        <Info label="Department" value={p?.department_name} />
        <Info label="Designation" value={p?.designation_name} />
        <Info label="Manager" value={p?.reporting_manager_name} />
        <Info label="Status" value={p?.employment_status} />
        <Info label="Date of joining" value={p?.date_of_joining} />
      </div>

      <Tabs defaultValue="edit">
        <TabsList>
          <TabsTrigger value="edit">Editable details</TabsTrigger>
          <TabsTrigger value="certs">Certifications</TabsTrigger>
        </TabsList>
        <TabsContent value="edit">
          <Card>
            <CardHeader>
              <CardTitle>Update profile</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="grid max-w-2xl gap-4 sm:grid-cols-2" onSubmit={form.handleSubmit((v) => save.mutate(v))}>
                <div className="space-y-1">
                  <Label>Phone</Label>
                  <Input {...form.register("phone")} />
                </div>
                <div className="space-y-1">
                  <Label>Date of birth</Label>
                  <Input type="date" {...form.register("date_of_birth")} />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label>Address</Label>
                  <Textarea {...form.register("address")} />
                </div>
                <div className="space-y-1">
                  <Label>Emergency contact</Label>
                  <Input {...form.register("emergency_contact_name")} />
                </div>
                <div className="space-y-1">
                  <Label>Emergency phone</Label>
                  <Input {...form.register("emergency_contact_phone")} />
                </div>
                <div className="space-y-1">
                  <Label>LinkedIn</Label>
                  <Input {...form.register("linkedin_url")} />
                </div>
                <div className="space-y-1">
                  <Label>GitHub</Label>
                  <Input {...form.register("github_url")} />
                </div>
                <div className="sm:col-span-2">
                  <Button type="submit" disabled={save.isPending}>
                    Save changes
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="certs">
          <Card className="mb-4">
            <CardHeader>
              <CardTitle>Add certification</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                className="grid max-w-2xl gap-3 sm:grid-cols-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  addCert.mutate(fd);
                  e.currentTarget.reset();
                }}
              >
                <Input name="name" placeholder="Certification name" required />
                <Input name="issuing_organization" placeholder="Issuing organization" />
                <Input name="issue_date" type="date" />
                <Input name="expiry_date" type="date" />
                <Input name="credential_id" placeholder="Credential ID" />
                <Input name="credential_url" placeholder="Credential URL" />
                <Input name="file" type="file" className="sm:col-span-2" />
                <Button type="submit" disabled={addCert.isPending}>
                  Add
                </Button>
              </form>
            </CardContent>
          </Card>
          <div className="grid gap-3">
            {(certs.data || []).map(
              (c: {
                id: string;
                name: string;
                issuing_organization?: string;
                issue_date?: string;
                expiry_date?: string;
              }) => (
                <Card key={c.id}>
                  <CardContent className="flex items-center justify-between gap-3 p-4">
                    <div>
                      <p className="font-medium">{c.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {c.issuing_organization || "—"} · {c.issue_date || "—"}
                        {c.expiry_date ? ` → ${c.expiry_date}` : ""}
                      </p>
                    </div>
                    <Button variant="destructive" size="sm" onClick={() => deleteCert.mutate(c.id)}>
                      Delete
                    </Button>
                  </CardContent>
                </Card>
              )
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-white p-4 shadow-soft">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium text-foreground">{value || "—"}</p>
    </div>
  );
}
