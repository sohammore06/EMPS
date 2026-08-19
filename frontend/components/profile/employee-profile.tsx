"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type CatalogSkill = {
  id: string;
  name: string;
  category?: string | null;
};

type UserSkill = {
  id: string;
  skill_id: string;
  skill_name: string;
  skill_category?: string | null;
  proficiency: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "EXPERT";
};

const PROFICIENCY_OPTIONS = [
  { value: "BEGINNER", label: "Beginner" },
  { value: "INTERMEDIATE", label: "Intermediate" },
  { value: "ADVANCED", label: "Advanced" },
  { value: "EXPERT", label: "Expert" },
] as const;

const OTHER_VALUE = "__other__";

const SELECT_CLASS =
  "flex h-10 w-full rounded-md border border-[var(--border-subtle)] bg-white px-3 py-2 text-sm text-foreground shadow-soft focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(1,99,206,0.2)]";

const PILL_CLASS =
  "inline-flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-white px-3 py-1 text-sm text-foreground";

type ProfileForm = {
  phone?: string;
  date_of_birth?: string;
  address?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  linkedin_url?: string;
  github_url?: string;
};

type EmployeeProfileProps = {
  userId?: string;
  readOnly?: boolean;
  backHref?: string;
  title?: string;
};

export function EmployeeProfile({
  userId,
  readOnly = false,
  backHref,
  title,
}: EmployeeProfileProps) {
  const qc = useQueryClient();
  const form = useForm<ProfileForm>();
  const profilePath = userId ? `/api/users/${userId}` : "/api/users/me";
  const certsPath = userId ? `/api/users/${userId}/certifications` : "/api/users/me/certifications";
  const skillsPath = userId ? `/api/users/${userId}/skills` : "/api/users/me/skills";

  const profile = useQuery({
    queryKey: ["profile", userId || "me"],
    queryFn: async () => (await api.get(profilePath)).data,
  });

  const certs = useQuery({
    queryKey: ["certs", userId || "me"],
    queryFn: async () => (await api.get(certsPath)).data,
  });

  const catalog = useQuery({
    queryKey: ["skill-catalog"],
    queryFn: async () => (await api.get("/api/skills")).data as CatalogSkill[],
    enabled: !readOnly,
  });

  const mySkills = useQuery({
    queryKey: ["skills", userId || "me"],
    queryFn: async () => (await api.get(skillsPath)).data as UserSkill[],
  });

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [customNames, setCustomNames] = useState<string[]>([]);
  const [pickerValue, setPickerValue] = useState("");
  const [showOther, setShowOther] = useState(false);
  const [otherName, setOtherName] = useState("");
  const [proficiency, setProficiency] = useState<UserSkill["proficiency"]>("INTERMEDIATE");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editProficiency, setEditProficiency] = useState<UserSkill["proficiency"]>("INTERMEDIATE");

  const savedSkillIds = useMemo(
    () => new Set((mySkills.data || []).map((skill) => skill.skill_id)),
    [mySkills.data]
  );
  const savedSkillNames = useMemo(
    () => new Set((mySkills.data || []).map((skill) => skill.skill_name.toLowerCase())),
    [mySkills.data]
  );
  const availableSkills = useMemo(
    () =>
      (catalog.data || []).filter(
        (skill) => !savedSkillIds.has(skill.id) && !selectedIds.includes(skill.id)
      ),
    [catalog.data, savedSkillIds, selectedIds]
  );
  const selectedCatalog = useMemo(
    () => (catalog.data || []).filter((skill) => selectedIds.includes(skill.id)),
    [catalog.data, selectedIds]
  );

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
      qc.invalidateQueries({ queryKey: ["profile", "me"] });
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
      qc.invalidateQueries({ queryKey: ["certs", "me"] });
    },
    onError: () => toast.error("Failed to add certification"),
  });

  const addOtherName = () => {
    const name = otherName.trim().replace(/\s+/g, " ");
    if (!name) {
      toast.error("Enter a skill name");
      return;
    }
    const catalogMatch = (catalog.data || []).find(
      (skill) => skill.name.toLowerCase() === name.toLowerCase()
    );
    if (catalogMatch) {
      if (savedSkillIds.has(catalogMatch.id)) {
        toast.error(`${catalogMatch.name} is already on your profile`);
      } else if (!selectedIds.includes(catalogMatch.id)) {
        setSelectedIds((current) => [...current, catalogMatch.id]);
      }
    } else if (savedSkillNames.has(name.toLowerCase())) {
      toast.error(`${name} is already on your profile`);
    } else if (!customNames.some((item) => item.toLowerCase() === name.toLowerCase())) {
      setCustomNames((current) => [...current, name]);
    }
    setOtherName("");
  };

  const addSkills = useMutation({
    mutationFn: async (payload: {
      skill_ids: string[];
      custom_names: string[];
      proficiency: UserSkill["proficiency"];
    }) => (await api.post("/api/users/me/skills/bulk", payload)).data,
    onSuccess: () => {
      toast.success("Skills saved");
      setSelectedIds([]);
      setCustomNames([]);
      setShowOther(false);
      setOtherName("");
      setPickerValue("");
      setProficiency("INTERMEDIATE");
      qc.invalidateQueries({ queryKey: ["skills", "me"] });
      qc.invalidateQueries({ queryKey: ["skill-catalog"] });
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e.response?.data?.detail || "Could not save skills"),
  });

  const updateSkill = useMutation({
    mutationFn: async (payload: { id: string; proficiency: UserSkill["proficiency"] }) =>
      (await api.put(`/api/users/me/skills/${payload.id}`, { proficiency: payload.proficiency })).data,
    onSuccess: () => {
      toast.success("Skill updated");
      setEditingId(null);
      qc.invalidateQueries({ queryKey: ["skills", "me"] });
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e.response?.data?.detail || "Could not update skill"),
  });

  const deleteSkill = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/api/users/me/skills/${id}`)).data,
    onSuccess: () => {
      toast.success("Skill removed");
      qc.invalidateQueries({ queryKey: ["skills", "me"] });
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e.response?.data?.detail || "Could not delete skill"),
  });

  const deleteCert = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/api/users/me/certifications/${id}`)).data,
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["certs", "me"] });
    },
  });

  const p = profile.data;

  if (profile.isError) {
    return (
      <div className="space-y-4">
        {backHref && (
          <Link href={backHref} className="inline-flex items-center gap-2 text-sm text-brand">
            <ArrowLeft className="h-4 w-4" /> Back to employees
          </Link>
        )}
        <p className="text-sm text-muted-foreground">This employee profile could not be opened.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        {backHref && (
          <Link href={backHref} className="inline-flex items-center gap-2 text-sm text-brand">
            <ArrowLeft className="h-4 w-4" /> Back to employees
          </Link>
        )}
        <h1 className="page-title">{title || (readOnly ? "Employee profile" : "My Profile")}</h1>
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
          <TabsTrigger value="edit">{readOnly ? "Details" : "Editable details"}</TabsTrigger>
          <TabsTrigger value="certs">Certifications</TabsTrigger>
          <TabsTrigger value="skills">Skills</TabsTrigger>
        </TabsList>
        <TabsContent value="edit">
          <Card>
            <CardHeader>
              <CardTitle>{readOnly ? "Contact details" : "Update profile"}</CardTitle>
            </CardHeader>
            <CardContent>
              {readOnly ? (
                <div className="grid max-w-2xl gap-3 sm:grid-cols-2">
                  <Info label="Phone" value={p?.phone} />
                  <Info label="Date of birth" value={p?.date_of_birth} />
                  <div className="sm:col-span-2">
                    <Info label="Address" value={p?.address} />
                  </div>
                  <Info label="Emergency contact" value={p?.emergency_contact_name} />
                  <Info label="Emergency phone" value={p?.emergency_contact_phone} />
                  <Info label="LinkedIn" value={p?.linkedin_url} />
                  <Info label="GitHub" value={p?.github_url} />
                </div>
              ) : (
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
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="certs">
          {!readOnly && (
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
          )}
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
                    {!readOnly && (
                      <Button variant="destructive" size="sm" onClick={() => deleteCert.mutate(c.id)}>
                        Delete
                      </Button>
                    )}
                  </CardContent>
                </Card>
              )
            )}
            {!(certs.data || []).length && (
              <p className="text-sm text-muted-foreground">No certifications added yet.</p>
            )}
          </div>
        </TabsContent>
        <TabsContent value="skills">
          {!readOnly && (
            <Card className="mb-4">
              <CardHeader>
                <CardTitle>Add skills</CardTitle>
              </CardHeader>
              <CardContent>
                <form
                  className="grid max-w-2xl gap-4 sm:grid-cols-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const pending = otherName.trim().replace(/\s+/g, " ");
                    let nextIds = selectedIds;
                    let nextCustom = customNames;
                    if (pending) {
                      const catalogMatch = (catalog.data || []).find(
                        (skill) => skill.name.toLowerCase() === pending.toLowerCase()
                      );
                      if (catalogMatch) {
                        if (savedSkillIds.has(catalogMatch.id)) {
                          toast.error(`${catalogMatch.name} is already on your profile`);
                          return;
                        }
                        if (!nextIds.includes(catalogMatch.id)) {
                          nextIds = [...nextIds, catalogMatch.id];
                        }
                      } else if (savedSkillNames.has(pending.toLowerCase())) {
                        toast.error(`${pending} is already on your profile`);
                        return;
                      } else if (!nextCustom.some((item) => item.toLowerCase() === pending.toLowerCase())) {
                        nextCustom = [...nextCustom, pending];
                      }
                    }
                    if (!nextIds.length && !nextCustom.length) {
                      toast.error("Select at least one skill, or choose Other to add your own");
                      return;
                    }
                    addSkills.mutate({
                      skill_ids: nextIds,
                      custom_names: nextCustom,
                      proficiency,
                    });
                  }}
                >
                  <div className="space-y-1 sm:col-span-2">
                    <Label htmlFor="skill-name">Skills</Label>
                    <select
                      id="skill-name"
                      className={SELECT_CLASS}
                      value={pickerValue}
                      onChange={(e) => {
                        const value = e.target.value;
                        setPickerValue("");
                        if (value === OTHER_VALUE) {
                          setShowOther(true);
                          return;
                        }
                        if (value) {
                          setSelectedIds((current) =>
                            current.includes(value) ? current : [...current, value]
                          );
                        }
                      }}
                    >
                      <option value="">Select one or more skills</option>
                      {availableSkills.map((skill) => (
                        <option key={skill.id} value={skill.id}>
                          {skill.category ? `${skill.category} · ${skill.name}` : skill.name}
                        </option>
                      ))}
                      <option value={OTHER_VALUE}>Other</option>
                    </select>
                  </div>
                  {(selectedCatalog.length > 0 || customNames.length > 0) && (
                    <div className="flex flex-wrap gap-2 sm:col-span-2">
                      {selectedCatalog.map((skill) => (
                        <span key={skill.id} className={PILL_CLASS}>
                          {skill.name}
                          <button
                            type="button"
                            className="rounded-full p-0.5 text-muted-foreground hover:bg-surface-muted hover:text-foreground"
                            aria-label={`Remove ${skill.name}`}
                            onClick={() =>
                              setSelectedIds((current) => current.filter((id) => id !== skill.id))
                            }
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      ))}
                      {customNames.map((name) => (
                        <span key={name} className={PILL_CLASS}>
                          {name}
                          <button
                            type="button"
                            className="rounded-full p-0.5 text-muted-foreground hover:bg-surface-muted hover:text-foreground"
                            aria-label={`Remove ${name}`}
                            onClick={() =>
                              setCustomNames((current) => current.filter((item) => item !== name))
                            }
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  {showOther && (
                    <div className="space-y-1 sm:col-span-2">
                      <Label htmlFor="other-skill">Other skill</Label>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Input
                          id="other-skill"
                          value={otherName}
                          onChange={(e) => setOtherName(e.target.value)}
                          placeholder="Type a skill that is not in the list"
                          maxLength={150}
                        />
                        <Button type="button" variant="outline" onClick={addOtherName}>
                          Add other
                        </Button>
                      </div>
                    </div>
                  )}
                  <div className="space-y-1">
                    <Label htmlFor="skill-level">Proficiency</Label>
                    <select
                      id="skill-level"
                      className={SELECT_CLASS}
                      value={proficiency}
                      onChange={(e) => setProficiency(e.target.value as UserSkill["proficiency"])}
                    >
                      {PROFICIENCY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <Button type="submit" disabled={addSkills.isPending}>
                      {addSkills.isPending ? "Saving..." : "Save skills"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader className="flex flex-row items-center gap-2 space-y-0">
              <CardTitle>Key skills</CardTitle>
              {!readOnly && <Pencil className="h-4 w-4 text-muted-foreground" aria-hidden />}
            </CardHeader>
            <CardContent>
              {(mySkills.data || []).length ? (
                <div className="flex flex-wrap gap-2">
                  {(mySkills.data || []).map((skill) => (
                    <div key={skill.id} className="flex flex-wrap items-center gap-2">
                      <span className={PILL_CLASS}>
                        {skill.skill_name}
                        <span className="text-xs capitalize text-muted-foreground">
                          {skill.proficiency.toLowerCase()}
                        </span>
                        {!readOnly && (
                          <>
                            <button
                              type="button"
                              className="rounded-full p-0.5 text-muted-foreground hover:bg-surface-muted hover:text-foreground"
                              aria-label={`Edit ${skill.skill_name}`}
                              onClick={() => {
                                setEditingId(skill.id);
                                setEditProficiency(skill.proficiency);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              className="rounded-full p-0.5 text-muted-foreground hover:bg-surface-muted hover:text-foreground"
                              aria-label={`Remove ${skill.skill_name}`}
                              disabled={deleteSkill.isPending}
                              onClick={() => deleteSkill.mutate(skill.id)}
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </span>
                      {!readOnly && editingId === skill.id && (
                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            className={SELECT_CLASS}
                            value={editProficiency}
                            onChange={(e) =>
                              setEditProficiency(e.target.value as UserSkill["proficiency"])
                            }
                          >
                            {PROFICIENCY_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <Button
                            size="sm"
                            disabled={updateSkill.isPending}
                            onClick={() =>
                              updateSkill.mutate({ id: skill.id, proficiency: editProficiency })
                            }
                          >
                            Save
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                            Cancel
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {readOnly
                    ? "No skills added yet."
                    : "No skills added yet. Choose from the standard list above, or select Other to add your own."}
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-white p-4 shadow-soft">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 break-all font-medium text-foreground">{value || "—"}</p>
    </div>
  );
}
