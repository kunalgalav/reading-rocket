import { describe, expect, it } from "vitest";
import { creditMultiplier, milestoneProgress, parseDay, sentencePoints, startOfWeek, summarize, toDay, weekRange } from "./progress";

describe("startOfWeek", () => {
  it("returns Monday for any day of the week", () => {
    expect(toDay(startOfWeek(parseDay("2026-11-14")))).toBe("2026-11-09"); // Saturday
    expect(toDay(startOfWeek(parseDay("2026-11-09")))).toBe("2026-11-09"); // Monday
    expect(toDay(startOfWeek(parseDay("2026-11-15")))).toBe("2026-11-09"); // Sunday
  });
});

describe("summarize", () => {
  const today = parseDay("2026-11-14");
  it("buckets credited words into week, month and year", () => {
    const totals = summarize(
      [
        { finished_on: "2026-11-10", credited_words: 1000 }, // this week
        { finished_on: "2026-11-02", credited_words: 500 }, // this month
        { finished_on: "2026-03-01", credited_words: 200 }, // this year
        { finished_on: "2025-12-31", credited_words: 9999 }, // last year
        { finished_on: "2026-11-13", credited_words: null }, // quiz pending
      ],
      today,
    );
    expect(totals).toEqual({ week: 1000, month: 1500, year: 1700, booksThisYear: 4, awaitingQuiz: 1 });
  });
});

describe("milestoneProgress", () => {
  it("tracks progress between milestones", () => {
    expect(milestoneProgress(0)).toMatchObject({ next: 1000, previous: 0, fraction: 0 });
    expect(milestoneProgress(5500)).toMatchObject({ reached: [1000], next: 10000, fraction: 0.5 });
    expect(milestoneProgress(2_000_000)).toMatchObject({ next: null, fraction: 1 });
  });
});

describe("sentencePoints", () => {
  it("rewards higher curriculum levels, and only when the word is used correctly", () => {
    expect(sentencePoints("year2", true)).toBe(1);
    expect(sentencePoints("year4_plus", true)).toBe(2);
    expect(sentencePoints("year4_plus", false)).toBe(0);
    expect(sentencePoints("not_yet", true)).toBe(0);
  });
});

describe("weekRange", () => {
  it("covers Monday to Sunday", () => {
    expect(weekRange(parseDay("2026-11-15"))).toEqual({ start: "2026-11-09", end: "2026-11-15" });
    expect(weekRange(parseDay("2026-11-16"))).toEqual({ start: "2026-11-16", end: "2026-11-22" });
  });
});

describe("creditMultiplier", () => {
  it("applies the quiz thresholds", () => {
    expect(creditMultiplier(3)).toBe(0);
    expect(creditMultiplier(4)).toBe(0);
    expect(creditMultiplier(5)).toBe(0.5);
    expect(creditMultiplier(7)).toBe(0.5);
    expect(creditMultiplier(8)).toBe(1);
    expect(creditMultiplier(10)).toBe(1);
  });
});
