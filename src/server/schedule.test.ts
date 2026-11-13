import { describe, expect, it } from "vitest";
import {
  addMonthsClamped, isScheduledDose, medicationDoses, monthRange, nextOccurrence, nowLocal, occurrences, shiftMonth,
  type MedicationSchedule,
} from "./schedule";

const plan = (o: Partial<MedicationSchedule>): MedicationSchedule => ({
  scheduleType: "daily", times: ["08:00"], weekdays: [], intervalDays: null, startDate: "2026-03-01", endDate: null, ...o,
});

describe("nowLocal", () => {
  it("uses Israel time incl. DST", () => {
    expect(nowLocal(new Date("2026-01-15T10:00:00Z"))).toBe("2026-01-15T12:00"); // UTC+2
    expect(nowLocal(new Date("2026-07-15T10:00:00Z"))).toBe("2026-07-15T13:00"); // UTC+3
    expect(nowLocal(new Date("2026-07-15T22:30:00Z"))).toBe("2026-07-16T01:30"); // date rolls over
  });
});

describe("medicationDoses", () => {
  it("daily, several times a day, sorted and de-duplicated", () => {
    expect(medicationDoses(plan({ times: ["20:00", "08:00", "08:00"] }), "2026-03-01", "2026-03-02"))
      .toEqual(["2026-03-01T08:00", "2026-03-01T20:00", "2026-03-02T08:00", "2026-03-02T20:00"]);
  });
  it("respects start and end dates", () => {
    const p = plan({ startDate: "2026-03-05", endDate: "2026-03-06" });
    expect(medicationDoses(p, "2026-03-01", "2026-03-31")).toEqual(["2026-03-05T08:00", "2026-03-06T08:00"]);
  });
  it("selected weekdays (0 = Sunday)", () => {
    // 2026-03-01 is a Sunday
    expect(medicationDoses(plan({ scheduleType: "weekdays", weekdays: [0, 3] }), "2026-03-01", "2026-03-08"))
      .toEqual(["2026-03-01T08:00", "2026-03-04T08:00", "2026-03-08T08:00"]);
  });
  it("every N days counted from the start date, even when the range starts later", () => {
    expect(medicationDoses(plan({ scheduleType: "interval", intervalDays: 3 }), "2026-03-02", "2026-03-10"))
      .toEqual(["2026-03-04T08:00", "2026-03-07T08:00", "2026-03-10T08:00"]);
  });
  it("wall-clock times are unchanged across the DST switch", () => {
    // Israel DST 2026 starts Friday 2026-03-27
    expect(medicationDoses(plan({}), "2026-03-26", "2026-03-28")).toEqual(["2026-03-26T08:00", "2026-03-27T08:00", "2026-03-28T08:00"]);
  });
  it("validates a requested dose", () => {
    const p = plan({ times: ["08:00", "20:00"] });
    expect(isScheduledDose(p, "2026-03-03T20:00")).toBe(true);
    expect(isScheduledDose(p, "2026-03-03T09:00")).toBe(false);
    expect(isScheduledDose(p, "2026-02-28T08:00")).toBe(false); // before start
  });
});

describe("occurrences", () => {
  it("one-time event only inside the range", () => {
    expect(occurrences("2026-03-10T09:30", "none", null, "2026-03-01", "2026-03-31")).toEqual(["2026-03-10T09:30"]);
    expect(occurrences("2026-04-10T09:30", "none", null, "2026-03-01", "2026-03-31")).toEqual([]);
  });
  it("weekly from a past start, until a date", () => {
    expect(occurrences("2026-01-01T10:00", "weekly", "2026-03-20", "2026-03-01", "2026-03-31"))
      .toEqual(["2026-03-05T10:00", "2026-03-12T10:00", "2026-03-19T10:00"]);
  });
  it("monthly on the 31st clamps to short months and returns to 31", () => {
    expect(occurrences("2026-01-31T09:00", "monthly", null, "2026-01-01", "2026-04-30"))
      .toEqual(["2026-01-31T09:00", "2026-02-28T09:00", "2026-03-31T09:00", "2026-04-30T09:00"]);
  });
  it("yearly birthday on Feb 29", () => {
    expect(occurrences("2024-02-29T00:00", "yearly", null, "2027-01-01", "2028-12-31")).toEqual(["2027-02-28T00:00", "2028-02-29T00:00"]);
  });
});

describe("helpers", () => {
  it("next occurrence and month maths", () => {
    expect(nextOccurrence("2026-01-31T18:00", "monthly")).toBe("2026-02-28T18:00");
    expect(nextOccurrence("2026-03-27T07:00", "daily")).toBe("2026-03-28T07:00");
    expect(nextOccurrence("2026-03-30T07:00", "daily", 3)).toBe("2026-04-02T07:00");
    expect(nextOccurrence("2026-03-01T07:00", "weekly", 2)).toBe("2026-03-15T07:00");
    expect(nextOccurrence("2026-01-31T07:00", "monthly", 3)).toBe("2026-04-30T07:00");
    expect(addMonthsClamped("2026-12-15", 1)).toBe("2027-01-15");
    expect(monthRange("2028-02")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });
});
