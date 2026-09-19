import { DEFAULT_BASELINES, DEFAULT_TARGETS } from "../domain/banks";
import type {
  BlockKey, Day, Plan, Skill, Snapshot, Task, TaskKind, TaskStatus, TemplateKind, TemplateSet,
} from "../domain/types";
import type { Database, Json } from "./database.types";

/* Postgres speaks snake_case and stores times as "18:30:00"; the app speaks
   camelCase and "18:30". All of that translation lives here. */

export type PlanRow = Database["public"]["Tables"]["plans"]["Row"];
export type DayRow = Database["public"]["Tables"]["days"]["Row"];
export type TaskRow = Database["public"]["Tables"]["tasks"]["Row"];
type PlanUpdate = Database["public"]["Tables"]["plans"]["Update"];
type TaskUpdate = Database["public"]["Tables"]["tasks"]["Update"];

const hhmm = (t: string): string => t.slice(0, 5);

/** jsonb columns are typed as Json, which requires an index signature the
 *  domain interfaces don't carry. These values are plain data either way. */
const asJson = <T>(value: T): Json => value as unknown as Json;

export function toPlan(row: PlanRow): Plan {
  return {
    id: row.id,
    startDate: row.start_date,
    examDate: row.exam_date,
    theme: (row.theme as Plan["theme"]) ?? "light",
    targets: { ...DEFAULT_TARGETS, ...(row.targets as Record<Skill, number>) },
    baselines: mergeBaselines(row.baselines as Record<Skill, Record<string, number>>),
    templates: (row.templates as TemplateSet | null) ?? null,
    updatedAt: row.updated_at,
  };
}

function mergeBaselines(stored: Record<Skill, Record<string, number>> | null) {
  const out = {} as Record<Skill, Record<string, number>>;
  for (const skill of Object.keys(DEFAULT_BASELINES) as Skill[]) {
    out[skill] = { ...DEFAULT_BASELINES[skill], ...stored?.[skill] };
  }
  return out;
}

export const toDay = (row: DayRow): Day => ({
  date: row.on_date,
  templateKind: (row.template_kind as TemplateKind | null) ?? null,
  updatedAt: row.updated_at,
});

export function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    date: row.on_date,
    tid: row.tid,
    block: row.block as BlockKey,
    at: hhmm(row.at_time),
    kind: row.kind as TaskKind,
    title: row.title,
    target: row.target,
    actual: row.actual,
    spent: row.spent,
    unit: row.unit,
    mins: row.mins,
    bank: row.bank_skill && row.bank_key
      ? { skill: row.bank_skill as Skill, key: row.bank_key }
      : null,
    status: row.status as TaskStatus,
    fromTemplate: (row.from_template as TemplateKind | null) ?? null,
    rolledFrom: row.rolled_from,
    sortOrder: row.sort_order,
    updatedAt: row.updated_at,
  };
}

export function fromTask(task: Task, userId: string, planId: string) {
  return {
    id: task.id,
    user_id: userId,
    plan_id: planId,
    on_date: task.date,
    tid: task.tid,
    block: task.block,
    at_time: task.at,
    kind: task.kind,
    title: task.title,
    target: task.target,
    actual: task.actual,
    spent: task.spent,
    unit: task.unit,
    mins: task.mins,
    bank_skill: task.bank?.skill ?? null,
    bank_key: task.bank?.key ?? null,
    status: task.status,
    from_template: task.fromTemplate,
    rolled_from: task.rolledFrom,
    sort_order: task.sortOrder,
  };
}

/** Only the columns a patch actually touches, so two devices editing different
 *  fields of the same task don't overwrite each other needlessly. */
export function fromTaskPatch(patch: Partial<Task>): TaskUpdate {
  const out: TaskUpdate = {};
  if (patch.tid !== undefined) out.tid = patch.tid;
  if (patch.block !== undefined) out.block = patch.block;
  if (patch.at !== undefined) out.at_time = patch.at;
  if (patch.kind !== undefined) out.kind = patch.kind;
  if (patch.title !== undefined) out.title = patch.title;
  if (patch.target !== undefined) out.target = patch.target;
  if (patch.actual !== undefined) out.actual = patch.actual;
  if (patch.spent !== undefined) out.spent = patch.spent;
  if (patch.unit !== undefined) out.unit = patch.unit;
  if (patch.mins !== undefined) out.mins = patch.mins;
  if (patch.status !== undefined) out.status = patch.status;
  if (patch.fromTemplate !== undefined) out.from_template = patch.fromTemplate;
  if (patch.rolledFrom !== undefined) out.rolled_from = patch.rolledFrom;
  if (patch.sortOrder !== undefined) out.sort_order = patch.sortOrder;
  if (patch.bank !== undefined) {
    out.bank_skill = patch.bank?.skill ?? null;
    out.bank_key = patch.bank?.key ?? null;
  }
  return out;
}

export function fromPlanPatch(patch: Partial<Plan>): PlanUpdate {
  const out: PlanUpdate = {};
  if (patch.startDate !== undefined) out.start_date = patch.startDate;
  if (patch.examDate !== undefined) out.exam_date = patch.examDate;
  if (patch.theme !== undefined) out.theme = patch.theme;
  if (patch.targets !== undefined) out.targets = asJson(patch.targets);
  if (patch.baselines !== undefined) out.baselines = asJson(patch.baselines);
  if (patch.templates !== undefined) out.templates = asJson(patch.templates);
  return out;
}

export function snapshotFrom(plan: PlanRow, days: DayRow[], tasks: TaskRow[]): Snapshot {
  return {
    plan: toPlan(plan),
    days: Object.fromEntries(days.map((d) => [d.on_date, toDay(d)])),
    tasks: Object.fromEntries(tasks.map((t) => [t.id, toTask(t)])),
  };
}
