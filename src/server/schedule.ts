// Pure schedule maths. All wall-clock values are local Israel time strings:
// dates "YYYY-MM-DD", date-times "YYYY-MM-DDTHH:mm". Comparing them as strings orders them
// correctly, and storing wall-clock time (not instants) keeps "08:00" at 08:00 across DST.

export const TZ = "Asia/Jerusalem";
export type LocalDate = string;
export type LocalDateTime = string;

const pad = (n: number) => String(n).padStart(2, "0");

/** Current wall-clock time in Israel. */
export function nowLocal(at: Date = new Date()): LocalDateTime {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(at).map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
export const todayLocal = (at?: Date): LocalDate => nowLocal(at).slice(0, 10);

// Date arithmetic on calendar dates via UTC (no DST involved).
const toUTC = (d: LocalDate) => new Date(`${d}T00:00:00Z`);
const fromUTC = (x: Date): LocalDate => x.toISOString().slice(0, 10);
export const addDays = (d: LocalDate, n: number) => fromUTC(new Date(toUTC(d).getTime() + n * 86_400_000));
export const daysBetween = (a: LocalDate, b: LocalDate) => Math.round((toUTC(b).getTime() - toUTC(a).getTime()) / 86_400_000);
export const weekday = (d: LocalDate) => toUTC(d).getUTCDay(); // 0 = Sunday
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); // m: 0-11

/** Same day-of-month `n` months later, clamped to the month's length (Jan 31 + 1 → Feb 28/29). */
export function addMonthsClamped(d: LocalDate, n: number, dayOfMonth = Number(d.slice(8, 10))): LocalDate {
  const y0 = Number(d.slice(0, 4)), m0 = Number(d.slice(5, 7)) - 1 + n;
  const y = y0 + Math.floor(m0 / 12), m = ((m0 % 12) + 12) % 12;
  return `${y}-${pad(m + 1)}-${pad(Math.min(dayOfMonth, daysInMonth(y, m)))}`;
}

export const isValidTime = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

export type MedicationSchedule = {
  scheduleType: "daily" | "weekdays" | "interval";
  times: string[]; // "HH:mm", one or more per dosing day
  weekdays: number[]; // for "weekdays"
  intervalDays: number | null; // for "interval": every N days from startDate
  startDate: LocalDate;
  endDate: LocalDate | null;
};

/** Scheduled doses in [from, to] (inclusive dates). Computed, never stored. */
export function medicationDoses(s: MedicationSchedule, from: LocalDate, to: LocalDate): LocalDateTime[] {
  const first = from > s.startDate ? from : s.startDate;
  const last = s.endDate && s.endDate < to ? s.endDate : to;
  const times = [...new Set(s.times.filter(isValidTime))].sort();
  const out: LocalDateTime[] = [];
  for (let d = first, i = 0; d <= last && i < 3660; d = addDays(d, 1), i++) {
    const due =
      s.scheduleType === "daily" ||
      (s.scheduleType === "weekdays" && s.weekdays.includes(weekday(d))) ||
      (s.scheduleType === "interval" && !!s.intervalDays && daysBetween(s.startDate, d) % s.intervalDays === 0);
    if (due) for (const t of times) out.push(`${d}T${t}`);
  }
  return out;
}

/** Does `at` match a dose of this schedule? Used to validate "mark as given" requests. */
export const isScheduledDose = (s: MedicationSchedule, at: LocalDateTime) =>
  medicationDoses(s, at.slice(0, 10), at.slice(0, 10)).includes(at);

export type Recurrence = "none" | "daily" | "weekly" | "monthly" | "yearly";

/** Occurrences of a (possibly recurring) start time that fall within [from, to] (inclusive dates). */
export function occurrences(start: LocalDateTime, rule: Recurrence, until: LocalDate | null, from: LocalDate, to: LocalDate, max = 500): LocalDateTime[] {
  const startDate = start.slice(0, 10), time = start.slice(11);
  const last = until && until < to ? until : to;
  if (rule === "none") return startDate >= from && startDate <= last ? [start] : [];
  const out: LocalDateTime[] = [];
  const day = Number(startDate.slice(8, 10));
  let step = 0;
  if (rule === "daily" || rule === "weekly") {
    const n = rule === "daily" ? 1 : 7;
    step = Math.max(0, Math.ceil(daysBetween(startDate, from) / n)); // jump close to `from`
    for (let d = addDays(startDate, step * n); d <= last && out.length < max; d = addDays(d, n)) if (d >= from) out.push(`${d}T${time}`);
    return out;
  }
  const months = rule === "monthly" ? 1 : 12;
  for (let i = 0; out.length < max && i < 2400; i++) {
    const d = addMonthsClamped(startDate, i * months, day);
    if (d > last) break;
    if (d >= from) out.push(`${d}T${time}`);
  }
  return out;
}

/** Next occurrence, `interval` units after `start` (recurring tasks: every N days/weeks/months). */
export function nextOccurrence(start: LocalDateTime, rule: Exclude<Recurrence, "none" | "yearly">, interval = 1): LocalDateTime {
  const d = start.slice(0, 10), t = start.slice(11), n = Math.max(1, Math.trunc(interval));
  const next = rule === "daily" ? addDays(d, n) : rule === "weekly" ? addDays(d, 7 * n) : addMonthsClamped(d, n);
  return `${next}T${t}`;
}

/** Month bounds for calendar views. */
export function monthRange(ym: string): { from: LocalDate; to: LocalDate } {
  const y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7)) - 1;
  return { from: `${ym}-01`, to: `${ym}-${pad(daysInMonth(y, m))}` };
}
export const shiftMonth = (ym: string, n: number) => addMonthsClamped(`${ym}-01`, n).slice(0, 7);
