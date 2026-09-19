import { describe, expect, it } from "vitest";
import { makeSnapshot, makeTask } from "../test/factory";
import { derive } from "./select";
import { makeUpPhrase, perDay } from "./projection";

/* The drift numbers are the whole point of the Banks tab, so they are pinned
   down here rather than eyeballed. */

const START = "2026-01-01";

/** Eight days in, with `studiedDays` of them worked and the rest skipped. */
function eightDaysIn(studiedDays: number[]) {
  const tasks = studiedDays.flatMap((offset) => [
    makeTask({ date: `2026-01-0${offset + 1}`, actual: 9, status: "done", bank: { skill: "CO", key: "B1" } }),
    makeTask({ date: `2026-01-0${offset + 1}`, actual: 12, status: "done", target: 12, bank: { skill: "CE", key: "A2" } }),
  ]);
  return makeSnapshot({ plan: { startDate: START, examDate: "2026-03-16" }, tasks });
}

describe("counting the days", () => {
  it("separates days studied from days missed, and ignores today", () => {
    const snapshot = eightDaysIn([0, 1, 5]);
    const p = derive(snapshot, "2026-01-09", "2026-01-09").outlook;

    expect(p.elapsed).toBe(8);
    expect(p.studied).toBe(3);
    expect(p.missed).toBe(5);
  });

  it("has nothing to report on day one", () => {
    const p = derive(eightDaysIn([]), START, START).outlook;
    expect(p.elapsed).toBe(0);
    expect(p.missed).toBe(0);
  });
});

describe("what the missed days cost", () => {
  it("raises the daily quota above what the plan first asked for", () => {
    const d = derive(eightDaysIn([0, 1]), "2026-01-09", "2026-01-09");
    const co = d.outlook.live.find((s) => s.skill === "CO")!;

    expect(co.needed).toBeGreaterThan(co.asked);
    expect(co.behindBy).toBeGreaterThan(0);
  });

  it("charges more per day the more days you sit out", () => {
    const d = derive(eightDaysIn([0]), "2026-01-09", "2026-01-09");
    const co = d.outlook.live.find((s) => s.skill === "CO")!;

    expect(co.ifMissed(1)!).toBeGreaterThan(co.needed);
    expect(co.ifMissed(7)!).toBeGreaterThan(co.ifMissed(3)!);
  });

  it("reports the make-up work in each bank's own unit", () => {
    const p = derive(eightDaysIn([]), "2026-01-09", "2026-01-09").outlook;
    const phrase = makeUpPhrase(p);

    expect(phrase).toMatch(/questions/);
    expect(phrase).toMatch(/sujets/);
  });

  it("reports nothing behind, and nothing left, once every target is met", () => {
    const snapshot = makeSnapshot({
      /* CO's target is already covered by the baseline credit */
      plan: { startDate: START, examDate: "2026-03-16", targets: { CO: 308, CE: 1, EO: 1, EE: 1 } },
      tasks: [
        makeTask({ date: START, target: 1, actual: 1, status: "done", bank: { skill: "CE", key: "A1" } }),
        makeTask({ date: START, target: 1, actual: 1, status: "done", bank: { skill: "EO", key: "2" } }),
        makeTask({ date: START, target: 1, actual: 1, status: "done", bank: { skill: "EE", key: "1" } }),
      ],
    });
    const p = derive(snapshot, "2026-01-03", "2026-01-03").outlook;

    expect(p.behind).toHaveLength(0);
    expect(p.live).toHaveLength(0);
    expect(p.verdict).toBe("clear");
  });

  it("calls a plan on pace when the recent rate clears what is left", () => {
    const snapshot = makeSnapshot({
      plan: { startDate: START, examDate: "2026-03-16", targets: { CO: 400, CE: 1, EO: 1, EE: 1 } },
      tasks: [
        makeTask({ date: START, target: 50, actual: 50, status: "done", bank: { skill: "CO", key: "B1" } }),
        makeTask({ date: START, target: 1, actual: 1, status: "done", bank: { skill: "CE", key: "A1" } }),
        makeTask({ date: START, target: 1, actual: 1, status: "done", bank: { skill: "EO", key: "2" } }),
        makeTask({ date: START, target: 1, actual: 1, status: "done", bank: { skill: "EE", key: "1" } }),
      ],
    });
    const p = derive(snapshot, "2026-01-03", "2026-01-03").outlook;

    expect(p.live.map((s) => s.skill)).toEqual(["CO"]);
    expect(p.atRisk).toHaveLength(0);
    expect(p.verdict).toBe("ok");
  });
});

describe("the exam-day outlook", () => {
  it("calls a plan off track when no bank can be finished at this pace", () => {
    const p = derive(eightDaysIn([0]), "2026-01-09", "2026-01-09").outlook;
    expect(p.verdict).toBe("off");
    expect(p.atRisk.length).toBe(p.live.length);
  });

  it("stops offering what-if figures once there are no days left", () => {
    const snapshot = makeSnapshot({ plan: { startDate: START, examDate: "2026-01-09" } });
    const d = derive(snapshot, "2026-01-09", "2026-01-09");

    expect(d.daysLeft).toBe(0);
    expect(d.outlook.live[0].ifMissed(1)).toBeNull();
  });
});

describe("reading pace figures", () => {
  it("rounds big numbers and keeps a decimal on small ones", () => {
    expect(perDay(12.68)).toBe("13");
    expect(perDay(1.82)).toBe("1.8");
    expect(perDay(10)).toBe("10");
  });
});
