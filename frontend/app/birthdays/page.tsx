"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Cake,
  CalendarHeart,
  ChevronLeft,
  ChevronRight,
  Gift,
  PartyPopper,
  Sparkles,
  Mail,
} from "lucide-react";
import { Protected } from "@/components/layout/protected";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Birthday = {
  id: string;
  name: string;
  email: string;
  department?: string;
  designation?: string;
  date_of_birth: string;
  birthday_this_year: string;
};

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

function planningTip(days: number) {
  if (days === 0) return "Celebrate today — send wishes & maybe cake!";
  if (days === 1) return "Tomorrow — order cake / book a huddle slot";
  if (days <= 7) return "This week — plan a small team moment";
  if (days <= 14) return "Coming up — reserve a greetings card or gift";
  return "On the horizon — add a reminder to your calendar";
}

export default function BirthdaysPage() {
  return (
    <Protected>
      <BirthdaysContent />
    </Protected>
  );
}

function BirthdaysContent() {
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth() + 1); // 1-12
  const [selectedDate, setSelectedDate] = useState(toISODate(now));

  const monthQuery = useQuery({
    queryKey: ["bday-month", viewYear, viewMonth],
    queryFn: async () =>
      (
        await api.get("/api/birthdays/month", {
          params: { month: viewMonth, year: viewYear },
        })
      ).data as Birthday[],
  });

  const upcomingQuery = useQuery({
    queryKey: ["bday-upcoming"],
    queryFn: async () =>
      (await api.get("/api/birthdays/upcoming", { params: { days: 60 } })).data as Birthday[],
  });

  const todayIso = toISODate(now);
  const monthBirthdays = monthQuery.data || [];
  const upcoming = upcomingQuery.data || [];

  const byDate = useMemo(() => {
    const map = new Map<string, Birthday[]>();
    for (const b of monthBirthdays) {
      const key = b.birthday_this_year;
      const list = map.get(key) || [];
      list.push(b);
      map.set(key, list);
    }
    return map;
  }, [monthBirthdays]);

  const selectedPeople = byDate.get(selectedDate) || [];
  const todayPeople = upcoming.filter((b) => b.birthday_this_year === todayIso);
  const nextUp = upcoming.filter((b) => b.birthday_this_year !== todayIso).slice(0, 6);

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
      {/* Celebratory hero */}
      <section className="birthday-hero relative overflow-hidden rounded-xl text-white shadow-card">
        <div className="birthday-confetti" aria-hidden />
        <div className="relative z-10 grid gap-6 p-6 md:grid-cols-[1.2fr_auto] md:items-center md:p-8">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium backdrop-blur">
              <PartyPopper className="h-3.5 w-3.5" />
              Birthday planner
            </div>
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
              Plan smiles ahead of time
            </h1>
            <p className="mt-2 max-w-xl text-sm text-white/85 md:text-base">
              Spot upcoming birthdays on the calendar, prepare wishes early, and never miss a
              teammate&apos;s special day.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Badge className="bg-white text-brand hover:bg-white">
                <Cake className="mr-1 h-3.5 w-3.5" />
                {todayPeople.length} today
              </Badge>
              <Badge className="bg-white/15 text-white hover:bg-white/20">
                <Gift className="mr-1 h-3.5 w-3.5" />
                {upcoming.filter((b) => daysUntil(b.birthday_this_year) > 0 && daysUntil(b.birthday_this_year) <= 7).length}{" "}
                this week
              </Badge>
              <Badge className="bg-white/15 text-white hover:bg-white/20">
                <CalendarHeart className="mr-1 h-3.5 w-3.5" />
                {monthBirthdays.length} in {MONTH_NAMES[viewMonth - 1]}
              </Badge>
            </div>
          </div>

          <div className="flex justify-center md:justify-end">
            <CelebratoryIllustration />
          </div>
        </div>
      </section>

      {/* Today spotlight */}
      {todayPeople.length > 0 && (
        <Card className="overflow-hidden border-brand/20 bg-gradient-to-r from-white via-white to-surface-muted">
          <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand text-white shadow-soft">
                <Sparkles className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-brand">
                  Celebrating today
                </p>
                <p className="mt-1 text-lg font-semibold text-foreground">
                  {todayPeople.map((p) => p.name).join(", ")}
                </p>
                <p className="text-sm text-muted-foreground">
                  Drop a message, grab coffee, or schedule a 5‑minute wish huddle.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {todayPeople.map((p) => (
                <a
                  key={p.id}
                  href={`mailto:${p.email}?subject=Happy Birthday ${encodeURIComponent(p.name)}!`}
                  className="inline-flex"
                >
                  <Button size="sm">
                    <Mail className="h-4 w-4" /> Wish {p.name.split(" ")[0]}
                  </Button>
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.45fr_1fr]">
        {/* Calendar */}
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0 border-b border-[var(--border-subtle)] bg-surface-secondary/60">
            <div>
              <CardTitle className="text-xl">
                {MONTH_NAMES[viewMonth - 1]} {viewYear}
              </CardTitle>
              <CardDescription>Tap a day with 🎂 to plan ahead</CardDescription>
            </div>
            <div className="flex items-center gap-2">
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
                const people = byDate.get(cell.iso) || [];
                const isToday = cell.iso === todayIso;
                const isSelected = cell.iso === selectedDate;
                const hasBirthday = people.length > 0;

                return (
                  <button
                    key={cell.iso}
                    type="button"
                    onClick={() => setSelectedDate(cell.iso!)}
                    className={cn(
                      "group relative min-h-[78px] rounded-lg border p-2 text-left transition-all duration-200",
                      hasBirthday
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
                      {hasBirthday && (
                        <span className="text-base leading-none" aria-hidden>
                          🎂
                        </span>
                      )}
                    </div>
                    {hasBirthday && (
                      <div className="mt-1 space-y-0.5">
                        {people.slice(0, 2).map((p) => (
                          <p key={p.id} className="truncate text-[11px] font-medium text-brand">
                            {p.name.split(" ")[0]}
                          </p>
                        ))}
                        {people.length > 2 && (
                          <p className="text-[10px] text-muted-foreground">+{people.length - 2} more</p>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Side panel: selected day + upcoming planner */}
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
                {selectedPeople.length
                  ? planningTip(daysUntil(selectedDate))
                  : "No birthdays on this day — pick another highlighted date."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {selectedPeople.map((p) => (
                <PersonCard key={p.id} person={p} highlight />
              ))}
              {!selectedPeople.length && (
                <div className="rounded-lg border border-dashed border-[var(--border-subtle)] bg-surface-secondary px-4 py-8 text-center">
                  <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-surface-muted text-2xl">
                    🎈
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Select a cake day on the calendar to prep wishes & gifts.
                  </p>
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
              {nextUp.map((p) => (
                <button
                  key={`${p.id}-${p.birthday_this_year}`}
                  type="button"
                  className="w-full text-left"
                  onClick={() => {
                    const d = parseISO(p.birthday_this_year);
                    setViewYear(d.getFullYear());
                    setViewMonth(d.getMonth() + 1);
                    setSelectedDate(p.birthday_this_year);
                  }}
                >
                  <PersonCard person={p} showCountdown />
                </button>
              ))}
              {!nextUp.length && !todayPeople.length && (
                <p className="text-sm text-muted-foreground">No upcoming birthdays in the next 60 days.</p>
              )}
              {!nextUp.length && todayPeople.length > 0 && (
                <p className="text-sm text-muted-foreground">Everyone else is more than 60 days out — enjoy today!</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function PersonCard({
  person,
  highlight,
  showCountdown,
}: {
  person: Birthday;
  highlight?: boolean;
  showCountdown?: boolean;
}) {
  const days = daysUntil(person.birthday_this_year);
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border border-[var(--border-subtle)] bg-white p-3 transition-all duration-200 hover:border-brand/30 hover:shadow-soft",
        highlight && "border-brand/30 bg-surface-muted/50"
      )}
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-semibold text-white shadow-soft">
        {initials(person.name)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-foreground">{person.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {person.designation || "Team member"}
          {person.department ? ` · ${person.department}` : ""}
        </p>
        <p className="mt-0.5 text-xs font-medium text-brand">
          {parseISO(person.birthday_this_year).toLocaleDateString(undefined, {
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
    </div>
  );
}

function CelebratoryIllustration() {
  return (
    <div className="birthday-scene relative h-40 w-44 md:h-44 md:w-52">
      <div className="absolute inset-0 rounded-full bg-white/10 blur-2xl" />
      {/* Cake */}
      <svg viewBox="0 0 200 180" className="relative z-10 h-full w-full drop-shadow-lg" aria-hidden>
        <ellipse cx="100" cy="150" rx="70" ry="12" fill="rgba(255,255,255,0.25)" />
        <rect x="45" y="95" width="110" height="50" rx="10" fill="#FFFFFF" />
        <path d="M45 105c10-12 20-12 30 0s20 12 30 0 20-12 30 0 20 12 20 0v40H45V105z" fill="#EEF3FA" />
        <rect x="55" y="70" width="90" height="30" rx="8" fill="#FFFFFF" />
        <path d="M55 80c8-10 16-10 24 0s16 10 24 0 16-10 24 0 16 10 18 0v20H55V80z" fill="#BFD8F6" />
        {/* Candles */}
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
        {/* Balloons */}
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
