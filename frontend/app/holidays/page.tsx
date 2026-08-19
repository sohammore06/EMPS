"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Protected } from "@/components/layout/protected";
import { useAuth } from "@/lib/auth/auth-provider";
import { api, hasAnyRole } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";

type Holiday = {
  holiday_id: number;
  holiday_date: string;
  holiday_name: string;
  holiday_type: string;
  created_date?: string | null;
};

type HolidayForm = {
  mode: "add" | "edit";
  holiday_id?: number;
  holiday_date: string;
  holiday_name: string;
  holiday_type: string;
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const SELECT_CLASS =
  "flex h-10 w-full rounded-md border border-[var(--border-subtle)] bg-white px-3 py-2 text-sm text-foreground shadow-soft focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(1,99,206,0.2)]";

function toISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseISO(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatLong(iso: string) {
  return parseISO(iso).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function HolidaysPage() {
  return (
    <Protected>
      <HolidaysContent />
    </Protected>
  );
}

function HolidaysContent() {
  const { user } = useAuth();
  const canManage = hasAnyRole(user, ["HR", "SUPERADMIN"]);
  const qc = useQueryClient();
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth() + 1);
  const [filterYear, setFilterYear] = useState(String(now.getFullYear()));
  const [filterMonth, setFilterMonth] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [selectedDate, setSelectedDate] = useState(toISODate(now));
  const [form, setForm] = useState<HolidayForm | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Holiday | null>(null);

  const typesQuery = useQuery({
    queryKey: ["holiday-types"],
    queryFn: async () => (await api.get("/api/holidays/types")).data as string[],
  });

  const holidaysQuery = useQuery({
    queryKey: ["holidays", filterYear, filterMonth, filterType],
    queryFn: async () => {
      const params: Record<string, string | number> = { year: Number(filterYear) };
      if (filterMonth !== "all") params.month = Number(filterMonth);
      if (filterType !== "all") params.holiday_type = filterType;
      return (await api.get("/api/holidays", { params })).data as Holiday[];
    },
  });

  const save = useMutation({
    mutationFn: async (payload: HolidayForm) => {
      const body = {
        holiday_date: payload.holiday_date,
        holiday_name: payload.holiday_name,
        holiday_type: payload.holiday_type,
      };
      if (payload.mode === "edit" && payload.holiday_id != null) {
        return (await api.put(`/api/holidays/${payload.holiday_id}`, body)).data;
      }
      return (await api.post("/api/holidays", body)).data;
    },
    onSuccess: () => {
      toast.success(form?.mode === "edit" ? "Holiday updated" : "Holiday added");
      setForm(null);
      qc.invalidateQueries({ queryKey: ["holidays"] });
      qc.invalidateQueries({ queryKey: ["dashboard-me"] });
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e.response?.data?.detail || "Could not save holiday"),
  });

  const remove = useMutation({
    mutationFn: async (id: number) => (await api.delete(`/api/holidays/${id}`)).data,
    onSuccess: () => {
      toast.success("Holiday deleted");
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ["holidays"] });
      qc.invalidateQueries({ queryKey: ["dashboard-me"] });
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e.response?.data?.detail || "Could not delete holiday"),
  });

  const holidays = holidaysQuery.data || [];
  const types = typesQuery.data || ["PUBLIC", "COMPANY", "OPTIONAL", "FESTIVAL", "OTHER"];
  const todayIso = toISODate(now);

  const monthHolidays = useMemo(
    () =>
      holidays.filter((h) => {
        const d = parseISO(h.holiday_date);
        return d.getFullYear() === viewYear && d.getMonth() + 1 === viewMonth;
      }),
    [holidays, viewYear, viewMonth]
  );

  const byDate = useMemo(() => {
    const map = new Map<string, Holiday[]>();
    for (const holiday of monthHolidays) {
      const list = map.get(holiday.holiday_date) || [];
      list.push(holiday);
      map.set(holiday.holiday_date, list);
    }
    return map;
  }, [monthHolidays]);

  const selectedHolidays = byDate.get(selectedDate) || [];

  const calendarCells = useMemo(() => {
    const first = new Date(viewYear, viewMonth - 1, 1);
    const startPad = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
    const cells: Array<{ date: Date | null; iso: string | null }> = [];
    for (let i = 0; i < startPad; i++) cells.push({ date: null, iso: null });
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(viewYear, viewMonth - 1, d);
      cells.push({ date, iso: toISODate(date) });
    }
    while (cells.length % 7 !== 0) cells.push({ date: null, iso: null });
    return cells;
  }, [viewYear, viewMonth]);

  function shiftMonth(delta: number) {
    const next = new Date(viewYear, viewMonth - 1 + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth() + 1);
    setFilterYear(String(next.getFullYear()));
    setFilterMonth(String(next.getMonth() + 1));
  }

  function openAdd(iso?: string) {
    setForm({
      mode: "add",
      holiday_date: iso || selectedDate,
      holiday_name: "",
      holiday_type: types[0] || "PUBLIC",
    });
  }

  function openEdit(holiday: Holiday) {
    setForm({
      mode: "edit",
      holiday_id: holiday.holiday_id,
      holiday_date: holiday.holiday_date,
      holiday_name: holiday.holiday_name,
      holiday_type: holiday.holiday_type,
    });
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">Holiday Calendar</h1>
          <p className="text-muted-foreground">Company holidays used by leave and attendance</p>
        </div>
        {canManage && (
          <Button onClick={() => openAdd()}>
            <Plus className="h-4 w-4" />
            Add Holiday
          </Button>
        )}
      </header>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="space-y-1">
            <Label htmlFor="filter-year">Year</Label>
            <select
              id="filter-year"
              className={SELECT_CLASS}
              value={filterYear}
              onChange={(e) => {
                setFilterYear(e.target.value);
                setViewYear(Number(e.target.value));
              }}
            >
              {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="filter-month">Month</Label>
            <select
              id="filter-month"
              className={SELECT_CLASS}
              value={filterMonth}
              onChange={(e) => {
                setFilterMonth(e.target.value);
                if (e.target.value !== "all") setViewMonth(Number(e.target.value));
              }}
            >
              <option value="all">All months</option>
              {MONTH_NAMES.map((name, idx) => (
                <option key={name} value={idx + 1}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="filter-type">Holiday type</Label>
            <select
              id="filter-type"
              className={SELECT_CLASS}
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
            >
              <option value="all">All types</option>
              {types.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.45fr_1fr]">
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0 border-b border-[var(--border-subtle)] bg-surface-secondary/60">
            <div>
              <CardTitle className="text-xl">
                {MONTH_NAMES[viewMonth - 1]} {viewYear}
              </CardTitle>
              <CardDescription>★ marks a company holiday</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => shiftMonth(-1)} aria-label="Previous month">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={() => shiftMonth(1)} aria-label="Next month">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-4 md:p-5">
            <div className="mb-2 grid grid-cols-7 gap-1 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {WEEKDAYS.map((d) => (
                <div key={d} className="py-2">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {calendarCells.map((cell, idx) => {
                if (!cell.iso || !cell.date) {
                  return <div key={`empty-${idx}`} className="min-h-[78px] rounded-lg bg-transparent" />;
                }
                const dayHolidays = byDate.get(cell.iso) || [];
                const isToday = cell.iso === todayIso;
                const isSelected = cell.iso === selectedDate;
                const hasHoliday = dayHolidays.length > 0;
                return (
                  <button
                    key={cell.iso}
                    type="button"
                    onClick={() => {
                      setSelectedDate(cell.iso!);
                      if (canManage && !hasHoliday) openAdd(cell.iso!);
                    }}
                    className={cn(
                      "min-h-[78px] rounded-lg border p-2 text-left transition-all duration-200",
                      hasHoliday
                        ? "border-brand/25 bg-gradient-to-b from-surface-muted to-white hover:border-brand hover:shadow-soft"
                        : "border-transparent bg-white hover:bg-surface-muted",
                      isSelected && "border-brand ring-2 ring-[rgba(1,99,206,0.2)]",
                      isToday && !isSelected && "border-brand/50"
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <span
                        className={cn(
                          "inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold",
                          isToday ? "bg-brand text-white" : "text-foreground"
                        )}
                      >
                        {cell.date.getDate()}
                      </span>
                      {hasHoliday && <Star className="h-4 w-4 text-brand" />}
                    </div>
                    {hasHoliday && (
                      <p className="mt-1 truncate text-[11px] font-medium text-brand">{dayHolidays[0].holiday_name}</p>
                    )}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Star className="h-5 w-5 text-brand" />
              {selectedDate === todayIso ? "Today" : formatLong(selectedDate)}
            </CardTitle>
            <CardDescription>
              {selectedHolidays.length ? "Holiday details" : "No holiday on this day"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {selectedHolidays.map((holiday) => (
              <div key={holiday.holiday_id} className="rounded-lg border border-[var(--border-subtle)] p-4">
                <p className="font-semibold text-foreground">{holiday.holiday_name}</p>
                <p className="mt-1 text-sm text-muted-foreground">{formatLong(holiday.holiday_date)}</p>
                <p className="mt-1 text-sm">
                  <Badge variant="secondary">{holiday.holiday_type}</Badge>
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Created {holiday.created_date ? new Date(holiday.created_date).toLocaleString() : "—"}
                </p>
                {canManage && (
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEdit(holiday)}>
                      <Pencil className="h-4 w-4" />
                      Edit
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => setDeleteTarget(holiday)}>
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </Button>
                  </div>
                )}
              </div>
            ))}
            {!selectedHolidays.length && canManage && (
              <Button size="sm" onClick={() => openAdd(selectedDate)}>
                <Plus className="h-4 w-4" />
                Add holiday on this day
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Holiday list</CardTitle>
          <CardDescription>
            {holidays.length} holiday{holidays.length === 1 ? "" : "s"} in the current filter
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b bg-surface-muted text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Holiday</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Created</th>
                {canManage && <th className="px-4 py-3">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {holidays.map((holiday) => (
                <tr key={holiday.holiday_id} className="border-b">
                  <td className="px-4 py-3">{formatLong(holiday.holiday_date)}</td>
                  <td className="px-4 py-3 font-medium">{holiday.holiday_name}</td>
                  <td className="px-4 py-3">
                    <Badge variant="secondary">{holiday.holiday_type}</Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {holiday.created_date ? new Date(holiday.created_date).toLocaleString() : "—"}
                  </td>
                  {canManage && (
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => openEdit(holiday)}>
                          Edit
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => setDeleteTarget(holiday)}>
                          Delete
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {!holidays.length && (
                <tr>
                  <td colSpan={canManage ? 5 : 4} className="px-4 py-8 text-center text-muted-foreground">
                    No holidays match the current filters
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {canManage && (
        <Dialog open={!!form} onOpenChange={(open) => !open && setForm(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{form?.mode === "edit" ? "Edit holiday" : "Add holiday"}</DialogTitle>
            </DialogHeader>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (!form?.holiday_date || !form.holiday_name.trim() || !form.holiday_type) {
                  toast.error("Date, name, and type are required");
                  return;
                }
                save.mutate(form);
              }}
            >
              <div className="space-y-1">
                <Label htmlFor="holiday-date">Date</Label>
                <Input
                  id="holiday-date"
                  type="date"
                  value={form?.holiday_date || ""}
                  onChange={(e) => form && setForm({ ...form, holiday_date: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="holiday-name">Holiday name</Label>
                <Input
                  id="holiday-name"
                  value={form?.holiday_name || ""}
                  onChange={(e) => form && setForm({ ...form, holiday_name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="holiday-type">Type</Label>
                <select
                  id="holiday-type"
                  className={SELECT_CLASS}
                  value={form?.holiday_type || types[0]}
                  onChange={(e) => form && setForm({ ...form, holiday_type: e.target.value })}
                  required
                >
                  {types.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setForm(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={save.isPending}>
                  {save.isPending ? "Saving..." : "Save"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {canManage && (
        <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete holiday</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Delete {deleteTarget?.holiday_name} on{" "}
              {deleteTarget ? formatLong(deleteTarget.holiday_date) : ""}? This is recorded in the audit log.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={remove.isPending}
                onClick={() => deleteTarget && remove.mutate(deleteTarget.holiday_id)}
              >
                {remove.isPending ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
