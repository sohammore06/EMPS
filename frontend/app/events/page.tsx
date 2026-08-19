"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Award,
  Cake,
  CalendarHeart,
  ChevronLeft,
  ChevronRight,
  Gift,
  PartyPopper,
  Pencil,
  Plus,
  Sparkles,
  Mail,
} from "lucide-react";
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

type EventType = "BIRTHDAY" | "WORK_ANNIVERSARY";

type CalendarEvent = {
  id: string;
  user_id: string;
  name: string;
  email: string;
  department?: string;
  designation?: string;
  event_type: EventType;
  event_date: string;
  occurs_on: string;
  years: number;
};

type EventEmployee = {
  id: string;
  name: string;
  email: string;
  employee_code?: string;
  department?: string;
  designation?: string;
  date_of_birth?: string | null;
  date_of_joining?: string | null;
};

type EventForm = {
  mode: "add" | "edit";
  eventType: EventType;
  userId: string;
  name: string;
  eventDate: string;
};

type EventFilter = "ALL" | EventType;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
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

function daysUntil(iso: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = parseISO(iso);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("");
}

function isBirthday(event: CalendarEvent) {
  return event.event_type === "BIRTHDAY";
}

function eventLabel(type: EventType) {
  return type === "BIRTHDAY" ? "Birthday" : "Work anniversary";
}

function eventEmoji(type: EventType) {
  return type === "BIRTHDAY" ? "🎂" : "🏅";
}

function employeeDate(emp: EventEmployee, type: EventType) {
  return type === "BIRTHDAY" ? emp.date_of_birth : emp.date_of_joining;
}

function planningTip(days: number, events: CalendarEvent[]) {
  const hasAnniversary = events.some((e) => e.event_type === "WORK_ANNIVERSARY");
  const hasBirthday = events.some((e) => e.event_type === "BIRTHDAY");
  if (days === 0) {
    if (hasBirthday && hasAnniversary) return "Celebrate today — birthday and work anniversary!";
    if (hasAnniversary) return "Celebrate their work anniversary today.";
    return "Celebrate today — send wishes & maybe cake!";
  }
  if (days === 1) return "Tomorrow — plan a huddle or a small gift";
  if (days <= 7) return "This week — plan a small team moment";
  if (days <= 14) return "Coming up — reserve a card or shout-out";
  return "On the horizon — add a reminder to your calendar";
}

function wishSubject(event: CalendarEvent) {
  return isBirthday(event)
    ? `Happy Birthday ${event.name}!`
    : `Happy Work Anniversary ${event.name}!`;
}

export default function EventsPage() {
  return (
    <Protected>
      <EventsContent />
    </Protected>
  );
}

function EventsContent() {
  const { user } = useAuth();
  const isHr = hasAnyRole(user, ["HR", "SUPERADMIN"]);
  const qc = useQueryClient();
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth() + 1);
  const [selectedDate, setSelectedDate] = useState(toISODate(now));
  const [filter, setFilter] = useState<EventFilter>("ALL");
  const [form, setForm] = useState<EventForm | null>(null);

  const monthQuery = useQuery({
    queryKey: ["events-month", viewYear, viewMonth],
    queryFn: async () =>
      (
        await api.get("/api/events/month", {
          params: { month: viewMonth, year: viewYear },
        })
      ).data as CalendarEvent[],
  });

  const upcomingQuery = useQuery({
    queryKey: ["events-upcoming"],
    queryFn: async () =>
      (await api.get("/api/events/upcoming", { params: { days: 60 } })).data as CalendarEvent[],
  });

  const employeesQuery = useQuery({
    queryKey: ["events-employees"],
    queryFn: async () => (await api.get("/api/events/employees")).data as EventEmployee[],
    enabled: isHr,
  });

  function invalidateEvents() {
    qc.invalidateQueries({ queryKey: ["events-month"] });
    qc.invalidateQueries({ queryKey: ["events-upcoming"] });
    qc.invalidateQueries({ queryKey: ["events-employees"] });
    qc.invalidateQueries({ queryKey: ["bday-month"] });
    qc.invalidateQueries({ queryKey: ["bday-upcoming"] });
  }

  const saveEvent = useMutation({
    mutationFn: async (payload: { userId: string; eventType: EventType; eventDate: string }) =>
      (
        await api.put(`/api/events/${payload.userId}`, {
          event_type: payload.eventType,
          event_date: payload.eventDate,
        })
      ).data,
    onSuccess: () => {
      toast.success(form?.mode === "edit" ? "Event updated" : "Event added");
      setForm(null);
      invalidateEvents();
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e.response?.data?.detail || "Could not save event"),
  });

  const removeEvent = useMutation({
    mutationFn: async (payload: { userId: string; eventType: EventType }) =>
      (await api.delete(`/api/events/${payload.userId}`, { params: { event_type: payload.eventType } })).data,
    onSuccess: () => {
      toast.success("Event removed");
      setForm(null);
      invalidateEvents();
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e.response?.data?.detail || "Could not remove event"),
  });

  function openAdd(eventType: EventType = "BIRTHDAY") {
    const monthDay = selectedDate.slice(5);
    setForm({
      mode: "add",
      eventType,
      userId: "",
      name: "",
      eventDate: monthDay ? `${eventType === "BIRTHDAY" ? "1990" : "2020"}-${monthDay}` : "",
    });
  }

  function openEdit(event: CalendarEvent) {
    setForm({
      mode: "edit",
      eventType: event.event_type,
      userId: event.user_id,
      name: event.name,
      eventDate: event.event_date,
    });
  }

  const todayIso = toISODate(now);
  const monthEvents = (monthQuery.data || []).filter((e) => filter === "ALL" || e.event_type === filter);
  const upcoming = (upcomingQuery.data || []).filter((e) => filter === "ALL" || e.event_type === filter);

  const byDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of monthEvents) {
      const list = map.get(event.occurs_on) || [];
      list.push(event);
      map.set(event.occurs_on, list);
    }
    return map;
  }, [monthEvents]);

  const selectedEvents = byDate.get(selectedDate) || [];
  const todayEvents = upcoming.filter((e) => e.occurs_on === todayIso);
  const nextUp = upcoming.filter((e) => e.occurs_on !== todayIso).slice(0, 6);
  const monthBirthdays = monthEvents.filter(isBirthday).length;
  const monthAnniversaries = monthEvents.filter((e) => e.event_type === "WORK_ANNIVERSARY").length;

  const calendarCells = useMemo(() => {
    const first = new Date(viewYear, viewMonth - 1, 1);
    const startPad = first.getDay();
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
  }

  function goToday() {
    const t = new Date();
    setViewYear(t.getFullYear());
    setViewMonth(t.getMonth() + 1);
    setSelectedDate(toISODate(t));
  }

  return (
    <div className="space-y-6">
      <section className="birthday-hero relative overflow-hidden rounded-xl text-white shadow-card">
        <div className="birthday-confetti" aria-hidden />
        <div className="relative z-10 grid gap-6 p-6 md:grid-cols-[1.2fr_auto] md:items-center md:p-8">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium backdrop-blur">
              <PartyPopper className="h-3.5 w-3.5" />
              Event planner
            </div>
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Plan smiles ahead of time</h1>
            <p className="mt-2 max-w-xl text-sm text-white/85 md:text-base">
              Track birthdays and work anniversaries on one calendar, then prepare wishes before the day arrives.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              {isHr && (
                <Button size="sm" className="bg-white text-brand hover:bg-white/90" onClick={() => openAdd()}>
                  <Plus className="h-4 w-4" />
                  Add event
                </Button>
              )}
              <Badge className="bg-white text-brand hover:bg-white">
                <Cake className="mr-1 h-3.5 w-3.5" />
                {monthBirthdays} birthdays
              </Badge>
              <Badge className="bg-white/15 text-white hover:bg-white/20">
                <Award className="mr-1 h-3.5 w-3.5" />
                {monthAnniversaries} anniversaries
              </Badge>
              <Badge className="bg-white/15 text-white hover:bg-white/20">
                <CalendarHeart className="mr-1 h-3.5 w-3.5" />
                {monthEvents.length} in {MONTH_NAMES[viewMonth - 1]}
              </Badge>
            </div>
          </div>
          <div className="flex justify-center md:justify-end">
            <CelebratoryIllustration />
          </div>
        </div>
      </section>

      {todayEvents.length > 0 && (
        <Card className="overflow-hidden border-brand/20 bg-gradient-to-r from-white via-white to-surface-muted">
          <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand text-white shadow-soft">
                <Sparkles className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-brand">Celebrating today</p>
                <p className="mt-1 text-lg font-semibold text-foreground">
                  {todayEvents.map((e) => `${e.name} (${eventLabel(e.event_type)})`).join(", ")}
                </p>
                <p className="text-sm text-muted-foreground">
                  Drop a message, grab coffee, or schedule a 5‑minute wish huddle.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {todayEvents.map((event) => (
                <a key={event.id} href={`mailto:${event.email}?subject=${encodeURIComponent(wishSubject(event))}`} className="inline-flex">
                  <Button size="sm">
                    <Mail className="h-4 w-4" /> Wish {event.name.split(" ")[0]}
                  </Button>
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["ALL", "All events"],
            ["BIRTHDAY", "Birthdays"],
            ["WORK_ANNIVERSARY", "Work anniversary"],
          ] as const
        ).map(([value, label]) => (
          <Button key={value} size="sm" variant={filter === value ? "default" : "outline"} onClick={() => setFilter(value)}>
            {label}
          </Button>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.45fr_1fr]">
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0 border-b border-[var(--border-subtle)] bg-surface-secondary/60">
            <div>
              <CardTitle className="text-xl">
                {MONTH_NAMES[viewMonth - 1]} {viewYear}
              </CardTitle>
              <CardDescription>
                {isHr ? "Tap a day, then add or edit an event" : "🎂 birthday · 🏅 work anniversary"}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {isHr && (
                <Button size="sm" onClick={() => openAdd()}>
                  <Plus className="h-4 w-4" />
                  Add
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={goToday}>
                Today
              </Button>
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
                const dayEvents = byDate.get(cell.iso) || [];
                const isToday = cell.iso === todayIso;
                const isSelected = cell.iso === selectedDate;
                const hasEvent = dayEvents.length > 0;
                const markers = Array.from(new Set(dayEvents.map((e) => eventEmoji(e.event_type)))).join("");

                return (
                  <button
                    key={cell.iso}
                    type="button"
                    onClick={() => setSelectedDate(cell.iso!)}
                    className={cn(
                      "group relative min-h-[78px] rounded-lg border p-2 text-left transition-all duration-200",
                      hasEvent
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
                      {hasEvent && (
                        <span className="text-base leading-none" aria-hidden>
                          {markers}
                        </span>
                      )}
                    </div>
                    {hasEvent && (
                      <div className="mt-1 space-y-0.5">
                        {dayEvents.slice(0, 2).map((event) => (
                          <p key={event.id} className="truncate text-[11px] font-medium text-brand">
                            {event.name.split(" ")[0]}
                          </p>
                        ))}
                        {dayEvents.length > 2 && (
                          <p className="text-[10px] text-muted-foreground">+{dayEvents.length - 2} more</p>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gift className="h-5 w-5 text-brand" />
                {selectedDate === todayIso
                  ? "Today's celebrations"
                  : `Plan for ${parseISO(selectedDate).toLocaleDateString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}`}
              </CardTitle>
              <CardDescription>
                {selectedEvents.length
                  ? planningTip(daysUntil(selectedDate), selectedEvents)
                  : isHr
                    ? "No events on this day — add a birthday or work anniversary."
                    : "No events on this day — pick another highlighted date."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {selectedEvents.map((event) => (
                <EventCard key={event.id} event={event} highlight canManage={isHr} onEdit={() => openEdit(event)} />
              ))}
              {!selectedEvents.length && (
                <div className="rounded-lg border border-dashed border-[var(--border-subtle)] bg-surface-secondary px-4 py-8 text-center">
                  <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-surface-muted text-2xl">
                    🎈
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {isHr ? "No one is listed for this day yet." : "Select a highlighted day to prep wishes."}
                  </p>
                  {isHr && (
                    <Button className="mt-3" size="sm" onClick={() => openAdd()}>
                      <Plus className="h-4 w-4" />
                      Add event
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarHeart className="h-5 w-5 text-brand" />
                Upcoming planner
              </CardTitle>
              <CardDescription>Next 60 days — sorted soonest first</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {nextUp.map((event) => (
                <div
                  key={event.id}
                  role="button"
                  tabIndex={0}
                  className="w-full cursor-pointer text-left"
                  onClick={() => {
                    const d = parseISO(event.occurs_on);
                    setViewYear(d.getFullYear());
                    setViewMonth(d.getMonth() + 1);
                    setSelectedDate(event.occurs_on);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      const d = parseISO(event.occurs_on);
                      setViewYear(d.getFullYear());
                      setViewMonth(d.getMonth() + 1);
                      setSelectedDate(event.occurs_on);
                    }
                  }}
                >
                  <EventCard event={event} showCountdown canManage={isHr} onEdit={() => openEdit(event)} />
                </div>
              ))}
              {!nextUp.length && !todayEvents.length && (
                <p className="text-sm text-muted-foreground">No upcoming events in the next 60 days.</p>
              )}
              {!nextUp.length && todayEvents.length > 0 && (
                <p className="text-sm text-muted-foreground">Everyone else is more than 60 days out — enjoy today!</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {isHr && (
        <Dialog open={!!form} onOpenChange={(open) => !open && setForm(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{form?.mode === "edit" ? "Edit event" : "Add event"}</DialogTitle>
            </DialogHeader>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (!form?.userId || !form.eventDate) {
                  toast.error("Select an employee, event type, and date");
                  return;
                }
                saveEvent.mutate({
                  userId: form.userId,
                  eventType: form.eventType,
                  eventDate: form.eventDate,
                });
              }}
            >
              <div className="space-y-1">
                <Label htmlFor="event-type">Event type</Label>
                <select
                  id="event-type"
                  className={SELECT_CLASS}
                  value={form?.eventType || "BIRTHDAY"}
                  disabled={form?.mode === "edit"}
                  onChange={(e) => {
                    if (!form) return;
                    const nextType = e.target.value as EventType;
                    const selected = (employeesQuery.data || []).find((emp) => emp.id === form.userId);
                    setForm({
                      ...form,
                      eventType: nextType,
                      eventDate: (selected && employeeDate(selected, nextType)) || form.eventDate,
                    });
                  }}
                >
                  <option value="BIRTHDAY">Birthday</option>
                  <option value="WORK_ANNIVERSARY">Work anniversary</option>
                </select>
              </div>
              {form?.mode === "add" ? (
                <div className="space-y-1">
                  <Label htmlFor="event-employee">Employee</Label>
                  <select
                    id="event-employee"
                    className={SELECT_CLASS}
                    value={form.userId}
                    onChange={(e) => {
                      const selected = (employeesQuery.data || []).find((emp) => emp.id === e.target.value);
                      setForm({
                        ...form,
                        userId: e.target.value,
                        name: selected?.name || "",
                        eventDate: (selected && employeeDate(selected, form.eventType)) || form.eventDate,
                      });
                    }}
                    required
                  >
                    <option value="">Select employee</option>
                    {(employeesQuery.data || [])
                      .slice()
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.name}
                          {employeeDate(emp, form.eventType) ? " (already set)" : ""}
                        </option>
                      ))}
                  </select>
                </div>
              ) : (
                <div className="space-y-1">
                  <Label>Employee</Label>
                  <Input value={form?.name || ""} disabled />
                </div>
              )}
              <div className="space-y-1">
                <Label htmlFor="event-date">
                  {form?.eventType === "WORK_ANNIVERSARY" ? "Date of joining" : "Date of birth"}
                </Label>
                <Input
                  id="event-date"
                  type="date"
                  max={toISODate(now)}
                  value={form?.eventDate || ""}
                  onChange={(e) => form && setForm({ ...form, eventDate: e.target.value })}
                  required
                />
              </div>
              <div className="flex flex-wrap justify-end gap-2 pt-2">
                {form?.mode === "edit" && (
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={removeEvent.isPending || saveEvent.isPending}
                    onClick={() => form && removeEvent.mutate({ userId: form.userId, eventType: form.eventType })}
                  >
                    Remove
                  </Button>
                )}
                <Button type="button" variant="outline" onClick={() => setForm(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saveEvent.isPending || removeEvent.isPending}>
                  {saveEvent.isPending ? "Saving..." : "Save"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function EventCard({
  event,
  highlight,
  showCountdown,
  canManage,
  onEdit,
}: {
  event: CalendarEvent;
  highlight?: boolean;
  showCountdown?: boolean;
  canManage?: boolean;
  onEdit?: () => void;
}) {
  const days = daysUntil(event.occurs_on);
  const anniversaryText =
    event.event_type === "WORK_ANNIVERSARY"
      ? event.years <= 0
        ? "Joined this year"
        : `${event.years} year${event.years === 1 ? "" : "s"}`
      : null;

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border border-[var(--border-subtle)] bg-white p-3 transition-all duration-200 hover:border-brand/30 hover:shadow-soft",
        highlight && "border-brand/30 bg-surface-muted/50"
      )}
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-semibold text-white shadow-soft">
        {initials(event.name)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-semibold text-foreground">{event.name}</p>
          <Badge variant="secondary">{eventEmoji(event.event_type)} {eventLabel(event.event_type)}</Badge>
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {event.designation || "Team member"}
          {event.department ? ` · ${event.department}` : ""}
          {anniversaryText ? ` · ${anniversaryText}` : ""}
        </p>
        <p className="mt-0.5 text-xs font-medium text-brand">
          {parseISO(event.occurs_on).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </p>
      </div>
      {showCountdown && (
        <div className="shrink-0 text-right">
          <p className="text-lg font-semibold text-brand-deep">{days === 0 ? "🎉" : days}</p>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {days === 0 ? "today" : days === 1 ? "day" : "days"}
          </p>
        </div>
      )}
      {canManage && onEdit && (
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={`Edit ${event.name} ${eventLabel(event.event_type)}`}
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
        >
          <Pencil className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

function CelebratoryIllustration() {
  return (
    <div className="birthday-scene relative h-40 w-44 md:h-44 md:w-52">
      <div className="absolute inset-0 rounded-full bg-white/10 blur-2xl" />
      <svg viewBox="0 0 200 180" className="relative z-10 h-full w-full drop-shadow-lg" aria-hidden>
        <ellipse cx="100" cy="150" rx="70" ry="12" fill="rgba(255,255,255,0.25)" />
        <rect x="45" y="95" width="110" height="50" rx="10" fill="#FFFFFF" />
        <path d="M45 105c10-12 20-12 30 0s20 12 30 0 20-12 30 0 20 12 20 0v40H45V105z" fill="#EEF3FA" />
        <rect x="55" y="70" width="90" height="30" rx="8" fill="#FFFFFF" />
        <path d="M55 80c8-10 16-10 24 0s16 10 24 0 16-10 24 0 16 10 18 0v20H55V80z" fill="#BFD8F6" />
        <g className="birthday-candle">
          <rect x="78" y="48" width="6" height="24" rx="2" fill="#0163CE" />
          <circle className="birthday-flame" cx="81" cy="42" r="5" fill="#FFF3B0" />
        </g>
        <g className="birthday-candle" style={{ animationDelay: "0.15s" }}>
          <rect x="97" y="45" width="6" height="27" rx="2" fill="#004EBC" />
          <circle className="birthday-flame" cx="100" cy="39" r="5" fill="#FFE28A" />
        </g>
        <g className="birthday-candle" style={{ animationDelay: "0.3s" }}>
          <rect x="116" y="48" width="6" height="24" rx="2" fill="#015CC9" />
          <circle className="birthday-flame" cx="119" cy="42" r="5" fill="#FFF3B0" />
        </g>
        <g className="birthday-balloon" style={{ animationDelay: "0s" }}>
          <ellipse cx="38" cy="48" rx="14" ry="18" fill="#FFFFFF" opacity="0.95" />
          <path d="M38 66 L38 85" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" />
        </g>
        <g className="birthday-balloon" style={{ animationDelay: "0.4s" }}>
          <ellipse cx="162" cy="42" rx="14" ry="18" fill="#BFD8F6" />
          <path d="M162 60 L162 82" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" />
        </g>
      </svg>
    </div>
  );
}
