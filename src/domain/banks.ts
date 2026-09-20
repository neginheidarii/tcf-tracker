import type { BlockKey, Skill, TaskKind } from "./types";

/* The four question banks, with how much material each level or tâche holds.
   These totals are what everything is measured against. */

export interface BankDef {
  label: string;
  abbr: string;
  unit: string;
  /** CO and CE are split by CEFR level, EO and EE by tâche. */
  kind: "level" | "tache";
  color: string;
  parts: readonly (readonly [string, number])[];
}

export const BANKS: Record<Skill, BankDef> = {
  CO: {
    label: "Compréhension orale", abbr: "CO", unit: "questions", kind: "level", color: "var(--co)",
    parts: [["A1", 133], ["A2", 175], ["B1", 261], ["B2", 295], ["C1", 201], ["C2", 124]],
  },
  CE: {
    label: "Compréhension écrite", abbr: "CE", unit: "questions", kind: "level", color: "var(--ce)",
    parts: [["A1", 145], ["A2", 156], ["B1", 287], ["B2", 298], ["C1", 156], ["C2", 112]],
  },
  EO: {
    label: "Expression orale", abbr: "EO", unit: "sujets", kind: "tache", color: "var(--eo)",
    parts: [["1", 1], ["2", 344], ["3", 309]],
  },
  EE: {
    label: "Expression écrite", abbr: "EE", unit: "sujets", kind: "tache", color: "var(--ee)",
    parts: [["1", 76], ["2", 78], ["3", 88]],
  },
};

export const SKILLS = Object.keys(BANKS) as Skill[];

export const bankTotal = (s: Skill): number =>
  BANKS[s].parts.reduce((n, [, v]) => n + v, 0);

export const isSkill = (k: TaskKind): k is Skill => k in BANKS;

/* EO cannot be covered in full inside a 75-day plan — 654 sujets needs roughly
   36 weeks even at a productive pace — so it ships as a sample. */
export const DEFAULT_TARGETS: Record<Skill, number> = { CO: 1189, CE: 1154, EO: 120, EE: 242 };

export const DEFAULT_BASELINES: Record<Skill, Record<string, number>> = {
  CO: { A1: 133, A2: 175, B1: 0, B2: 0, C1: 0, C2: 0 },
  CE: { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0 },
  EO: { 1: 0, 2: 0, 3: 0 },
  EE: { 1: 0, 2: 0, 3: 0 },
};

/** Work that isn't drawn from a bank still belongs on the day. */
export const KINDS: Record<TaskKind, { label: string; abbr: string; color: string }> = {
  CO: { label: BANKS.CO.label, abbr: "CO", color: BANKS.CO.color },
  CE: { label: BANKS.CE.label, abbr: "CE", color: BANKS.CE.color },
  EO: { label: BANKS.EO.label, abbr: "EO", color: BANKS.EO.color },
  EE: { label: BANKS.EE.label, abbr: "EE", color: BANKS.EE.color },
  REVIEW: { label: "Écoute et révision", abbr: "Révision", color: "var(--co)" },
  PAUSE: { label: "Pause", abbr: "Pause", color: "var(--text-2)" },
  BILAN: { label: "Bilan de la journée", abbr: "Bilan", color: "var(--primary)" },
  MOCK: { label: "Examen blanc", abbr: "Blanc", color: "var(--primary)" },
  ERREUR: { label: "Révision des erreurs", abbr: "Erreurs", color: "var(--text-2)" },
};

export const BLOCKS: Record<BlockKey, string> = {
  commute: "Before work / commute",
  study1: "Study block — CO + CE",
  pause: "Break",
  evening: "Evening — EE + EO",
  close: "Close the day",
  custom: "Anytime",
};

export const DURATIONS = [5, 10, 15, 20, 25, 30, 40, 45, 50, 60, 75, 90, 105, 120];

/** NCLC bands, shown for reference. IRCC converts each skill on its own. */
export const THRESHOLDS: readonly (readonly [string, string, string, string])[] = [
  ["Compréhension orale", "0–699", "458", "503"],
  ["Compréhension écrite", "0–699", "453", "499"],
  ["Expression écrite", "0–20", "10", "12"],
  ["Expression orale", "0–20", "10", "12"],
];
