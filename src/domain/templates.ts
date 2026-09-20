import { BANKS, isSkill } from "./banks";
import type { Plan, Skill, Task, TemplateKind, TemplateSet, TemplateTask } from "./types";

/* A template is a day you can stamp onto the calendar. "auto" as a bank key
   resolves to whichever level you haven't cleared yet at the moment you use it. */

export const TEMPLATE_LABELS: Record<TemplateKind, string> = {
  chill: "Chill",
  productive: "Productive",
};

export const TEMPLATE_KINDS = Object.keys(TEMPLATE_LABELS) as TemplateKind[];

export const DEFAULT_TEMPLATES: TemplateSet = {
  chill: [
    { tid: "c1", block: "commute", at: "07:00", kind: "REVIEW", title: "Listen back to yesterday's EO recording. Note two improvements.", target: 2, unit: "notes", mins: 30, bank: null },
    { tid: "c2", block: "study1", at: "18:30", kind: "CO", title: "Compréhension orale — {level}", target: 9, unit: "questions", mins: 25, bank: { skill: "CO", key: "auto" } },
    { tid: "c3", block: "study1", at: "18:55", kind: "CE", title: "Compréhension écrite — {level}", target: 12, unit: "questions", mins: 25, bank: { skill: "CE", key: "auto" } },
    { tid: "c4", block: "evening", at: "19:30", kind: "EE", title: "Tâche 1 — outline", target: 1, unit: "sujets", mins: 8, bank: { skill: "EE", key: "1" } },
    { tid: "c5", block: "evening", at: "19:38", kind: "EE", title: "Tâche 2 — outline", target: 1, unit: "sujets", mins: 8, bank: { skill: "EE", key: "2" } },
    { tid: "c6", block: "evening", at: "19:46", kind: "EE", title: "Tâche 3 — outline", target: 1, unit: "sujets", mins: 10, bank: { skill: "EE", key: "3" } },
    { tid: "c7", block: "evening", at: "19:56", kind: "EO", title: "Tâche 2 — enregistrer", target: 1, unit: "sujets", mins: 14, bank: { skill: "EO", key: "2" } },
    { tid: "c8", block: "close", at: "20:10", kind: "BILAN", title: "Flag what's unfinished. Record a voice note if you want.", target: 1, unit: "done", mins: 5, bank: null },
  ],
  productive: [
    { tid: "p1", block: "commute", at: "07:00", kind: "REVIEW", title: "Listen back to yesterday's EO recording. Note two improvements.", target: 2, unit: "notes", mins: 30, bank: null },
    { tid: "p2", block: "study1", at: "18:30", kind: "CO", title: "Compréhension orale — {level}", target: 30, unit: "questions", mins: 50, bank: { skill: "CO", key: "auto" } },
    { tid: "p3", block: "study1", at: "19:20", kind: "CE", title: "Compréhension écrite — {level}", target: 39, unit: "questions", mins: 55, bank: { skill: "CE", key: "auto" } },
    { tid: "p4", block: "evening", at: "20:30", kind: "EE", title: "Tâche 1 — outline", target: 2, unit: "sujets", mins: 15, bank: { skill: "EE", key: "1" } },
    { tid: "p5", block: "evening", at: "20:45", kind: "EE", title: "Tâche 2 — one written in full, rest outlined", target: 3, unit: "sujets", mins: 30, bank: { skill: "EE", key: "2" } },
    { tid: "p6", block: "evening", at: "21:15", kind: "EE", title: "Tâche 3 — outline", target: 2, unit: "sujets", mins: 20, bank: { skill: "EE", key: "3" } },
    { tid: "p7", block: "evening", at: "21:35", kind: "EO", title: "Tâche 2 — enregistrer", target: 1, unit: "sujets", mins: 10, bank: { skill: "EO", key: "2" } },
    { tid: "p8", block: "evening", at: "21:45", kind: "EO", title: "Tâche 3 — enregistrer", target: 2, unit: "sujets", mins: 15, bank: { skill: "EO", key: "3" } },
    { tid: "p9", block: "close", at: "22:00", kind: "BILAN", title: "Flag what's unfinished. Record a voice note if you want.", target: 1, unit: "done", mins: 5, bank: null },
  ],
};

export const templateTasks = (kind: TemplateKind, plan: Plan): TemplateTask[] =>
  plan.templates?.[kind] ?? DEFAULT_TEMPLATES[kind];

export const templateMins = (list: TemplateTask[]): number =>
  list.reduce((n, t) => n + (t.mins || 0), 0);

/** "9 CO · 12 CE · 3 EE · 1 EO", or a note that it draws on nothing. */
export function templateBlurb(list: TemplateTask[]): string {
  const per: Partial<Record<Skill, number>> = {};
  list.forEach((t) => {
    if (t.bank) per[t.bank.skill] = (per[t.bank.skill] ?? 0) + t.target;
  });
  const parts = (["CO", "CE", "EE", "EO"] as Skill[])
    .filter((k) => per[k])
    .map((k) => `${per[k]} ${k}`);
  return parts.join(" · ") || "No bank work";
}

/** The next level in a bank you haven't finished, which is what "auto" means. */
export function levelsFrom(banked: Record<Skill, Record<string, number>>): Record<"CO" | "CE", string> {
  const out = {} as Record<"CO" | "CE", string>;
  (["CO", "CE"] as const).forEach((sk) => {
    const hit = BANKS[sk].parts.find(([k, cap]) => (banked[sk][k] || 0) < cap);
    out[sk] = hit ? hit[0] : "C2";
  });
  return out;
}

/** Turn a template into real tasks for one date. */
export function buildTemplate(
  kind: TemplateKind,
  plan: Plan,
  levels: Record<"CO" | "CE", string>,
  date: string,
  newId: () => string,
): Task[] {
  return templateTasks(kind, plan).map((t, i) => {
    const bank = t.bank
      ? {
          ...t.bank,
          key: t.bank.key === "auto" && (t.bank.skill === "CO" || t.bank.skill === "CE")
            ? levels[t.bank.skill]
            : t.bank.key,
        }
      : null;
    return {
      id: newId(),
      date,
      tid: t.tid,
      block: t.block,
      at: t.at,
      kind: t.kind,
      title: t.title.replace("{level}", bank ? bank.key : ""),
      target: t.target,
      actual: 0,
      spent: 0,
      unit: t.unit,
      mins: t.mins,
      bank,
      status: "pending",
      fromTemplate: kind,
      rolledFrom: 0,
      sortOrder: i,
      updatedAt: new Date().toISOString(),
    };
  });
}

/** Tasks a template must never overwrite: made by hand, or moved here from an
 *  earlier day. Stamping a template adds to these rather than replacing them. */
export const isKeeper = (t: Task): boolean => !t.fromTemplate || t.rolledFrom > 0;

export function emptyTemplateTask(newId: () => string): TemplateTask {
  return {
    tid: newId(), block: "evening", at: "20:00", kind: "EE",
    title: "New task", target: 1, unit: "sujets", mins: 10,
    bank: { skill: "EE", key: "1" },
  };
}

/** Keeps a template row's bank pointer valid when its type changes. */
export function retargetTemplateTask(t: TemplateTask, kind: TemplateTask["kind"]): TemplateTask {
  if (!isSkill(kind)) return { ...t, kind, bank: null };
  return { ...t, kind, bank: { skill: kind, key: BANKS[kind].parts[0][0] }, unit: BANKS[kind].unit };
}
