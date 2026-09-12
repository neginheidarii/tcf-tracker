const STORE_KEY = "tcf:v2:state";
const DEFAULT_DAYS = 75;   /* only the starting suggestion — the real length comes from your dates */

/* ---------- the banks ---------- */

const BANKS = {
  CO: {
    label: "Compréhension orale", abbr: "CO", unit: "questions", kind: "level",
    color: "var(--co)",
    parts: [["A1", 133], ["A2", 175], ["B1", 261], ["B2", 295], ["C1", 201], ["C2", 124]],
  },
  CE: {
    label: "Compréhension écrite", abbr: "CE", unit: "questions", kind: "level",
    color: "var(--ce)",
    parts: [["A1", 145], ["A2", 156], ["B1", 287], ["B2", 298], ["C1", 156], ["C2", 112]],
  },
  EO: {
    label: "Expression orale", abbr: "EO", unit: "sujets", kind: "tache",
    color: "var(--eo)",
    parts: [["1", 1], ["2", 344], ["3", 309]],
  },
  EE: {
    label: "Expression écrite", abbr: "EE", unit: "sujets", kind: "tache",
    color: "var(--ee)",
    parts: [["1", 76], ["2", 78], ["3", 88]],
  },
};

const bankTotal = (s) => BANKS[s].parts.reduce((n, [, v]) => n + v, 0);

/* EO cannot be fully covered in 75 days — 654 subjects needs roughly
   36 weeks even at full productive pace. It ships as a sample. */
const DEFAULT_TARGETS = { CO: 1189, CE: 1154, EO: 120, EE: 242 };
const DEFAULT_BASELINE = {
  CO: { A1: 133, A2: 175, B1: 0, B2: 0, C1: 0, C2: 0 },
  CE: { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0 },
  EO: { 1: 0, 2: 0, 3: 0 },
  EE: { 1: 0, 2: 0, 3: 0 },
};

/* ---------- non-bank task types ---------- */

const KINDS = {
  ...Object.fromEntries(Object.entries(BANKS).map(([k, v]) => [k, { label: v.label, abbr: v.abbr, color: v.color }])),
  REVIEW: { label: "Écoute et révision", abbr: "Révision", color: "var(--co)" },
  PAUSE: { label: "Pause", abbr: "Pause", color: "var(--text-2)" },
  BILAN: { label: "Bilan de la journée", abbr: "Bilan", color: "var(--primary)" },
  MOCK: { label: "Examen blanc", abbr: "Blanc", color: "var(--primary)" },
  ERREUR: { label: "Révision des erreurs", abbr: "Erreurs", color: "var(--text-2)" },
};

const BLOCKS = {
  commute: "Before work / commute",
  study1: "Study block — CO + CE",
  pause: "Break",
  evening: "Evening — EE + EO",
  close: "Close the day",
  custom: "Anytime",
};

const DURATIONS = [5, 10, 15, 20, 25, 30, 40, 45, 50, 60, 75, 90, 105, 120];

/* ---------- templates ---------- */
/* "auto" as a bank key resolves to whichever level you haven't cleared yet */

const DEFAULT_TEMPLATES = {
  chill: {
    label: "Chill",
    tasks: [
      { tid: "c1", block: "commute", at: "07:00", kind: "REVIEW", title: "Listen back to yesterday's EO recording. Note two improvements.", target: 2, unit: "notes", mins: 30, bank: null },
      { tid: "c2", block: "study1", at: "18:30", kind: "CO", title: "Compréhension orale — {level}", target: 9, unit: "questions", mins: 25, bank: { skill: "CO", key: "auto" } },
      { tid: "c3", block: "study1", at: "18:55", kind: "CE", title: "Compréhension écrite — {level}", target: 12, unit: "questions", mins: 25, bank: { skill: "CE", key: "auto" } },
      { tid: "c4", block: "evening", at: "19:30", kind: "EE", title: "Tâche 1 — outline", target: 1, unit: "sujets", mins: 8, bank: { skill: "EE", key: "1" } },
      { tid: "c5", block: "evening", at: "19:38", kind: "EE", title: "Tâche 2 — outline", target: 1, unit: "sujets", mins: 8, bank: { skill: "EE", key: "2" } },
      { tid: "c6", block: "evening", at: "19:46", kind: "EE", title: "Tâche 3 — outline", target: 1, unit: "sujets", mins: 10, bank: { skill: "EE", key: "3" } },
      { tid: "c7", block: "evening", at: "19:56", kind: "EO", title: "Tâche 2 — enregistrer", target: 1, unit: "sujets", mins: 14, bank: { skill: "EO", key: "2" } },
      { tid: "c8", block: "close", at: "20:10", kind: "BILAN", title: "Flag what's unfinished. Record a voice note if you want.", target: 1, unit: "done", mins: 5, bank: null },
    ],
  },
  productive: {
    label: "Productive",
    tasks: [
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
  },
};

const tplTasks = (kind, cfg) => cfg?.templates?.[kind] || DEFAULT_TEMPLATES[kind].tasks;
const tplMins = (list) => list.reduce((n, t) => n + (t.mins || 0), 0);
const tplBlurb = (list) => {
  const per = {};
  list.forEach((t) => { if (t.bank) per[t.bank.skill] = (per[t.bank.skill] || 0) + t.target; });
  return ["CO", "CE", "EE", "EO"].filter((k) => per[k]).map((k) => `${per[k]} ${k}`).join(" · ") || "No bank work";
};

function levelsFrom(st) {
  const b = {};
  Object.keys(BANKS).forEach((sk) => (b[sk] = { ...st.baseline[sk] }));
  Object.values(st.days).forEach((d) => d.tasks.forEach((t) => {
    if (t.bank && b[t.bank.skill] && t.actual > 0)
      b[t.bank.skill][t.bank.key] = (b[t.bank.skill][t.bank.key] || 0) + t.actual;
  }));
  const out = {};
  ["CO", "CE"].forEach((sk) => {
    const hit = BANKS[sk].parts.find(([k, v]) => (b[sk][k] || 0) < v);
    out[sk] = hit ? hit[0] : "C2";
  });
  return out;
}

/* re-apply a template to today and every future day already using it,
   carrying over anything already logged */
function rebuildDays(st, kind) {
  const today = iso(new Date());
  const levels = levelsFrom(st);
  const days = { ...st.days };
  Object.entries(days).forEach(([date, d]) => {
    if (date < today || d.template !== kind) return;
    const manual = d.tasks.filter((t) => !t.fromTemplate);
    const fresh = buildTemplate(kind, st.config, levels).map((nt) => {
      const prior = d.tasks.find((p) => p.tid && p.tid === nt.tid);
      if (!prior) return nt;
      const actual = Math.min(prior.actual || 0, nt.target);
      return {
        ...nt, actual, spent: prior.spent || 0,
        status: prior.status === "skipped" ? "skipped"
          : actual >= nt.target ? "done" : actual > 0 ? "partial" : "pending",
      };
    });
    days[date] = { ...d, tasks: [...fresh, ...manual] };
  });
  return { ...st, days };
}

function buildTemplate(kind, cfg, levels) {
  return tplTasks(kind, cfg).map((t) => {
    const bank = t.bank
      ? { ...t.bank, key: t.bank.key === "auto" ? levels[t.bank.skill] : t.bank.key }
      : null;
    return {
      ...t, id: uid(), bank, tid: t.tid,
      title: t.title.replace("{level}", bank ? bank.key : ""),
      actual: 0, spent: 0, status: "pending", fromTemplate: kind,
    };
  });
}

/* ---------- helpers ---------- */

const uid = () => Math.random().toString(36).slice(2, 10);
const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parseISO = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseISO(s); d.setDate(d.getDate() + n); return iso(d); };
const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);
const prettyDate = (s) =>
  parseISO(s).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
const fmtTime = (s) => (s || "").replace(/^0/, "");
const fmtDur = (m) => {
  if (!m) return "0m";
  const h = Math.floor(m / 60), r = m % 60;
  return h ? (r ? `${h}h ${r}m` : `${h}h`) : `${r}m`;
};
const n0 = (x) => Math.round(x).toLocaleString();

function estimateMins(unit, target) {
  const per = { questions: 1.4, sujets: 8, notes: 15, items: 3, done: 5, sections: 45 };
  return Math.max(5, Math.round((per[unit] ?? 5) * target));
}

/* ---------- state ---------- */

function freshState() {
  const today = iso(new Date());
  return {
    config: {
      startDate: today, examDate: addDays(today, DEFAULT_DAYS - 1),
      theme: "light", targets: { ...DEFAULT_TARGETS }, templates: null,
    },
    baseline: JSON.parse(JSON.stringify(DEFAULT_BASELINE)),
    days: {},
  };
}

function migrate(s) {
  if (!s) return freshState();
  const base = freshState();
  const out = {
    config: { ...base.config, ...(s.config || {}), targets: { ...DEFAULT_TARGETS, ...(s.config?.targets || {}) }, templates: s.config?.templates || null },
    baseline: Object.fromEntries(
      Object.keys(DEFAULT_BASELINE).map((k) => [k, { ...DEFAULT_BASELINE[k], ...(s.baseline?.[k] || {}) }])
    ),
    days: {},
  };
  Object.entries(s.days || {}).forEach(([k, d]) => {
    out.days[k] = {
      template: d.template || null,
      tasks: (d.tasks || []).map((t) => ({
        ...t,
        kind: t.kind || t.skill || "CO",
        block: t.block || "custom",
        at: t.at || "19:30",
        mins: t.mins || 20,
        spent: t.spent || 0,
        bank: t.bank ?? null,
      })),
    };
  });
  return out;
}
/* ---------- storage: the browser's own, no account, no server ---------- */

const LS_KEY = "tcf:v2:state";

function loadLocal() {
  try { const r = localStorage.getItem(LS_KEY); return r ? JSON.parse(r) : null; }
  catch { return null; }
}
function writeLocal(st) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(st)); return true; }
  catch (e) { console.warn("save failed", e); return false; }
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {}
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;top:0;left:0;opacity:0";
    document.body.appendChild(ta);
    ta.select(); ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}

function downloadFile(text, name) {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url; a.download = name; a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 2000);
    return true;
  } catch { return false; }
}
