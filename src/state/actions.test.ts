import { describe, expect, it } from "vitest";
import { addDays } from "../domain/dates";
import { indexTasks } from "../domain/select";
import type { Task } from "../domain/types";
import { makeDay, makeSnapshot, makeTask } from "../test/factory";
import {
  alignFreshPlan, applyTemplate, bumpActual, clearDay, hasTemplateTasks, rollForward,
  saveTemplate, setBankedTotal, toggleDone,
} from "./actions";
import { applyOps } from "./ops";

const NOW = "2026-02-01T09:00:00.000Z";
const apply = (snapshot: Parameters<typeof applyOps>[0], ops: Parameters<typeof applyOps>[1]) =>
  applyOps(snapshot, ops, NOW);

const tasksOn = (snapshot: ReturnType<typeof makeSnapshot>, date: string): Task[] =>
  indexTasks(snapshot).get(date) ?? [];

describe("applying a template", () => {
  it("replaces the previous template's tasks", () => {
    const before = makeSnapshot({
      days: [makeDay({ templateKind: "chill" })],
      tasks: [makeTask({ fromTemplate: "chill", tid: "c2", title: "old" })],
    });

    const after = apply(before, applyTemplate(before, "productive", "2026-01-01"));
    const titles = tasksOn(after, "2026-01-01").map((t) => t.title);

    expect(titles).not.toContain("old");
    expect(after.days["2026-01-01"].templateKind).toBe("productive");
    expect(titles.length).toBeGreaterThan(5);
  });

  it("keeps tasks made by hand", () => {
    const before = makeSnapshot({ tasks: [makeTask({ title: "my own thing", fromTemplate: null })] });
    const after = apply(before, applyTemplate(before, "chill", "2026-01-01"));

    expect(tasksOn(after, "2026-01-01").map((t) => t.title)).toContain("my own thing");
  });

  it("keeps leftovers that were moved in from an earlier day", () => {
    const before = makeSnapshot({
      tasks: [makeTask({ title: "yesterday's CO", fromTemplate: "chill", rolledFrom: 1 })],
    });
    const after = apply(before, applyTemplate(before, "productive", "2026-01-01"));
    const titles = tasksOn(after, "2026-01-01").map((t) => t.title);

    expect(titles).toContain("yesterday's CO");
    /* and the template is added around it, not instead of it */
    expect(titles.length).toBe(10);
  });

  it("only warns about replacing when template tasks would be lost", () => {
    expect(hasTemplateTasks([makeTask({ fromTemplate: "chill" })])).toBe(true);
    expect(hasTemplateTasks([makeTask({ fromTemplate: null })])).toBe(false);
    expect(hasTemplateTasks([makeTask({ fromTemplate: "chill", rolledFrom: 2 })])).toBe(false);
  });
});

describe("moving what's left to tomorrow", () => {
  it("moves only unfinished bank work, and resets its progress", () => {
    const before = makeSnapshot({
      tasks: [
        makeTask({ id: "a", status: "done", actual: 9 }),
        makeTask({ id: "b", status: "partial", actual: 4, spent: 20 }),
        makeTask({ id: "c", status: "pending" }),
        makeTask({ id: "d", status: "pending", bank: null, kind: "BILAN" }),
      ],
    });

    const { ops, moved } = rollForward(before, "2026-01-01");
    const after = apply(before, ops);
    const tomorrow = tasksOn(after, "2026-01-02");

    expect(moved).toBe(2);
    expect(tomorrow).toHaveLength(2);
    expect(tomorrow.every((t) => t.actual === 0 && t.spent === 0 && t.status === "pending")).toBe(true);
    expect(tomorrow.every((t) => t.rolledFrom === 1)).toBe(true);
    /* the done task and the non-bank task stay put */
    expect(tasksOn(after, "2026-01-01").map((t) => t.id).sort()).toEqual(["a", "d"]);
  });

  it("marks leftovers as standalone so a template can be added on top", () => {
    const before = makeSnapshot({
      tasks: [makeTask({ fromTemplate: "chill", tid: "c2", status: "pending" })],
    });
    const rolled = apply(before, rollForward(before, "2026-01-01").ops);
    const moved = tasksOn(rolled, "2026-01-02")[0];

    expect(moved.fromTemplate).toBeNull();
    expect(moved.tid).toBeNull();

    const stamped = apply(rolled, applyTemplate(rolled, "chill", "2026-01-02"));
    expect(tasksOn(stamped, "2026-01-02")).toHaveLength(9);
  });

  it("says nothing moved when everything is finished", () => {
    const before = makeSnapshot({ tasks: [makeTask({ status: "done", actual: 9 })] });
    expect(rollForward(before, "2026-01-01").moved).toBe(0);
  });
});

describe("counters", () => {
  it("steps up to the target and marks the task done", () => {
    const task = makeTask({ target: 9, actual: 5 });
    const snapshot = makeSnapshot({ tasks: [task] });

    const partial = apply(snapshot, bumpActual(task, 3)).tasks[task.id];
    expect(partial).toMatchObject({ actual: 8, status: "partial" });

    const finished = apply(snapshot, bumpActual({ ...task, actual: 8 }, 5)).tasks[task.id];
    expect(finished).toMatchObject({ actual: 9, status: "done" });
  });

  it("never goes below zero, and produces no write when nothing changes", () => {
    const task = makeTask({ actual: 0 });
    expect(bumpActual(task, -5)).toEqual([]);
  });

  it("ticking a done task off clears its progress", () => {
    const task = makeTask({ status: "done", actual: 9 });
    const snapshot = makeSnapshot({ tasks: [task] });
    expect(apply(snapshot, toggleDone(task)).tasks[task.id]).toMatchObject({
      status: "pending", actual: 0,
    });
  });
});

describe("clearing a day", () => {
  it("removes the tasks and forgets the template", () => {
    const before = makeSnapshot({
      days: [makeDay({ templateKind: "chill" })],
      tasks: [makeTask(), makeTask({ date: "2026-01-02" })],
    });
    const after = apply(before, clearDay(before, "2026-01-01"));

    expect(tasksOn(after, "2026-01-01")).toHaveLength(0);
    expect(after.days["2026-01-01"].templateKind).toBeNull();
    /* other days are untouched */
    expect(tasksOn(after, "2026-01-02")).toHaveLength(1);
  });
});

describe("editing a template", () => {
  it("re-stamps future days using it while keeping logged progress", () => {
    const today = "2026-01-10";
    const before = makeSnapshot({
      days: [makeDay({ date: today, templateKind: "chill" })],
      tasks: [
        makeTask({ date: today, tid: "c2", fromTemplate: "chill", actual: 4, status: "partial", spent: 15 }),
        makeTask({ date: today, tid: null, fromTemplate: null, title: "by hand" }),
      ],
    });

    const list = [
      { tid: "c2", block: "study1" as const, at: "18:30", kind: "CO" as const, title: "CO — harder", target: 20, unit: "questions", mins: 40, bank: { skill: "CO" as const, key: "B1" } },
    ];
    const after = apply(before, saveTemplate(before, "chill", list, today));
    const rows = tasksOn(after, today);

    expect(after.plan.templates?.chill).toHaveLength(1);
    expect(rows.map((t) => t.title).sort()).toEqual(["CO — harder", "by hand"]);
    const carried = rows.find((t) => t.tid === "c2");
    expect(carried).toMatchObject({ actual: 4, spent: 15, target: 20, status: "partial" });
  });

  it("leaves days before today alone", () => {
    const before = makeSnapshot({
      days: [makeDay({ date: "2026-01-05", templateKind: "chill" })],
      tasks: [makeTask({ date: "2026-01-05", tid: "c2", fromTemplate: "chill", title: "history" })],
    });
    const after = apply(before, saveTemplate(before, "chill", [], "2026-01-10"));

    expect(tasksOn(after, "2026-01-05").map((t) => t.title)).toEqual(["history"]);
  });
});

describe("bank breakdown", () => {
  it("stores the figure you type minus what tasks already account for", () => {
    const before = makeSnapshot({
      tasks: [makeTask({ bank: { skill: "CO", key: "B1" }, actual: 30 })],
    });
    const after = apply(before, setBankedTotal(before, "CO", "B1", 100));

    /* 70 credited before the plan, plus 30 logged, reads back as 100 */
    expect(after.plan.baselines.CO.B1).toBe(70);
  });

  it("clamps to what the bank actually holds", () => {
    const before = makeSnapshot();
    const after = apply(before, setBankedTotal(before, "CO", "A1", 9999));
    expect(after.plan.baselines.CO.A1).toBe(133);
  });
});

describe("a brand new plan", () => {
  it("moves onto the device's date while nothing has been recorded", () => {
    const before = makeSnapshot({ plan: { startDate: "2026-01-01", examDate: "2026-03-16" } });
    const after = apply(before, alignFreshPlan(before, "2026-01-02"));

    expect(after.plan.startDate).toBe("2026-01-02");
    /* the plan keeps its length */
    expect(after.plan.examDate).toBe(addDays("2026-01-02", 74));
  });

  it("leaves a plan alone once it has any history", () => {
    const before = makeSnapshot({ tasks: [makeTask()] });
    expect(alignFreshPlan(before, "2026-06-01")).toEqual([]);
  });
});
