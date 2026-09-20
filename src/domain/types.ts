/* The shapes everything else agrees on. Kept free of React and Supabase so the
   rules of the plan can be tested on their own. */

export type Skill = "CO" | "CE" | "EO" | "EE";
export type TaskKind = Skill | "REVIEW" | "PAUSE" | "BILAN" | "MOCK" | "ERREUR";
export type BlockKey = "commute" | "study1" | "pause" | "evening" | "close" | "custom";
export type TaskStatus = "pending" | "partial" | "done" | "skipped";
export type TemplateKind = "chill" | "productive";
export type ThemeChoice = "light" | "dark" | "auto";

/** Which slice of a question bank a task feeds. `key` is a CEFR level for
 *  CO/CE and a tâche number for EO/EE. */
export interface BankRef {
  skill: Skill;
  key: string;
}

export interface Task {
  id: string;
  /** ISO date of the day this task belongs to, so a task row stands alone. */
  date: string;
  /** Id of the template row it was built from, null once it stops tracking one. */
  tid: string | null;
  block: BlockKey;
  at: string;
  kind: TaskKind;
  title: string;
  target: number;
  actual: number;
  spent: number;
  unit: string;
  mins: number;
  bank: BankRef | null;
  status: TaskStatus;
  fromTemplate: TemplateKind | null;
  rolledFrom: number;
  sortOrder: number;
  updatedAt: string;
}

export interface Day {
  date: string;
  templateKind: TemplateKind | null;
  updatedAt: string;
}

/** A row in a template: no progress, and `bank.key` may be "auto" to mean
 *  whichever level you haven't cleared yet. */
export interface TemplateTask {
  tid: string;
  block: BlockKey;
  at: string;
  kind: TaskKind;
  title: string;
  target: number;
  unit: string;
  mins: number;
  bank: BankRef | null;
}

export type TemplateSet = Record<TemplateKind, TemplateTask[]>;

export interface Plan {
  id: string;
  startDate: string;
  examDate: string;
  theme: ThemeChoice;
  targets: Record<Skill, number>;
  /** Questions and sujets you'd already covered before the plan began. */
  baselines: Record<Skill, Record<string, number>>;
  /** null means "use the shipped defaults". */
  templates: TemplateSet | null;
  updatedAt: string;
}

/** Everything one account owns, flat so a single task can sync on its own. */
export interface Snapshot {
  plan: Plan;
  days: Record<string, Day>;
  tasks: Record<string, Task>;
}
