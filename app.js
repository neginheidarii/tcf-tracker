/* ============================================================
   TCF Canada Study Tracker — UI layer
   No framework. Full re-render on change; sheets manage their
   own DOM so typing never loses focus.
   ============================================================ */

let S = migrate(loadLocal());
const ui = {
  tab: "today",
  today: iso(new Date()),
  cursor: iso(new Date()),
  openBanks: new Set(),
  replaceWith: null,
  confirmClear: false,
  confirmWipe: false,
  saving: false,
};

const root = document.getElementById("root");
let saveTimer = null;

function commit(fn) {
  if (fn) fn();
  ui.saving = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { writeLocal(S); ui.saving = false; render(); }, 400);
  render();
}
function flushSave() { clearTimeout(saveTimer); writeLocal(S); ui.saving = false; }

document.addEventListener("visibilitychange", () => document.hidden && flushSave());
window.addEventListener("pagehide", flushSave);
window.addEventListener("blur", flushSave);

/* the date must keep moving on its own — this sits open overnight */
setInterval(tickDate, 30000);
document.addEventListener("visibilitychange", tickDate);
window.addEventListener("focus", tickDate);
function tickDate() {
  const now = iso(new Date());
  if (now === ui.today) return;
  if (ui.cursor === ui.today) ui.cursor = now;
  ui.today = now;
  render();
}

/* moving off a day drops any half-answered question about that day */
function goTo(date) {
  ui.cursor = date;
  ui.replaceWith = null;
  ui.confirmClear = false;
  render();
}

/* ---------- tiny DOM helper ---------- */

function el(tag, props, ...kids) {
  const n = document.createElement(tag);
  if (props) for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k === "style" && typeof v === "object") {
      for (const [p, val] of Object.entries(v)) {
        if (p.startsWith("--")) n.style.setProperty(p, val); else n.style[p] = val;
      }
    }
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "html") n.innerHTML = v;
    else if (k in n) n[k] = v;
    else n.setAttribute(k, v);
  }
  kids.flat(Infinity).forEach((c) => {
    if (c == null || c === false || c === "") return;
    n.append(c.nodeType ? c : document.createTextNode(String(c)));
  });
  return n;
}

function flash(msg) {
  document.querySelectorAll(".toast").forEach((t) => t.remove());
  const t = el("div", { class: "toast" }, msg);
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2400);
}

/* ---------- derived ---------- */

function derive() {
  const cfg = S.config;
  const dayIndex = daysBetween(cfg.startDate, ui.cursor) + 1;
  const todayIndex = daysBetween(cfg.startDate, ui.today) + 1;
  const toExam = daysBetween(ui.today, cfg.examDate);
  const planLength = Math.max(1, daysBetween(cfg.startDate, cfg.examDate) + 1);
  const day = S.days[ui.cursor];
  const tasks = day ? day.tasks : [];

  const banked = {};
  Object.keys(BANKS).forEach((sk) => (banked[sk] = { ...S.baseline[sk] }));
  Object.values(S.days).forEach((d) => d.tasks.forEach((t) => {
    if (t.bank && banked[t.bank.skill] && t.actual > 0)
      banked[t.bank.skill][t.bank.key] = (banked[t.bank.skill][t.bank.key] || 0) + t.actual;
  }));

  const from = addDays(ui.today, -13);
  const pace = {};
  Object.keys(BANKS).forEach((sk) => (pace[sk] = 0));
  Object.entries(S.days).forEach(([d, dd]) => {
    if (d < from || d > ui.today) return;
    dd.tasks.forEach((t) => { if (t.bank && t.actual > 0) pace[t.bank.skill] += t.actual; });
  });
  const elapsed = Math.max(1, Math.min(14, todayIndex));
  Object.keys(pace).forEach((k) => (pace[k] = pace[k] / elapsed));

  const counts = (dd) => dd && dd.tasks.some((t) => t.status !== "pending");
  let streak = 0, d = ui.today;
  if (!counts(S.days[d])) d = addDays(d, -1);
  while (counts(S.days[d])) { streak++; d = addDays(d, -1); }

  const daysLeft = Math.max(0, toExam);

  return {
    cfg, dayIndex, todayIndex, toExam, planLength, day, tasks, banked, pace, streak, daysLeft,
    inRange: dayIndex >= 1 && dayIndex <= planLength,
    badRange: daysBetween(cfg.startDate, cfg.examDate) < 0,
    outlook: projection(S, { todayIndex, planLength, daysLeft, banked, pace }),
  };
}

/* ---------- day mutations ---------- */

const ensureDay = (date) => S.days[date] || { template: null, tasks: [] };
function mutateDay(fn) {
  const d = ensureDay(ui.cursor);
  S.days[ui.cursor] = fn({ ...d, tasks: [...d.tasks] });
}

function applyTemplate(kind) {
  const fresh = buildTemplate(kind, S.config, levelsFrom(S));
  commit(() => {
    const d = ensureDay(ui.cursor);
    S.days[ui.cursor] = { template: kind, tasks: [...fresh, ...d.tasks.filter(isKeeper)] };
    ui.replaceWith = null;
  });
  flash(DEFAULT_TEMPLATES[kind].label + " day inserted.");
}

function saveTemplate(kind, list, quiet) {
  const tpl = {
    chill: tplTasks("chill", S.config), productive: tplTasks("productive", S.config),
    ...(S.config.templates || {}),
    [kind]: list.map((t) => ({ ...t, tid: t.tid || uid() })),
  };
  commit(() => { S = rebuildDays({ ...S, config: { ...S.config, templates: tpl } }, kind); });
  if (!quiet) flash(DEFAULT_TEMPLATES[kind].label + " template saved. Days using it are updated.");
}

function restoreFrom(text) {
  try {
    const p = JSON.parse(text);
    if (!p || !p.config || !p.config.startDate || !p.days) throw new Error();
    S = migrate(p);
    flushSave(); render();
    flash("Backup restored.");
    closeSheet();
    return true;
  } catch { flash("That isn't a tracker backup."); return false; }
}

/* ============================================================
   RENDER
   ============================================================ */

function render() {
  const d = derive();
  root.className = "app theme-" + resolvedTheme();
  root.replaceChildren(
    header(d),
    d.inRange || ui.tab !== "today" ? tabContent(d) : outOfRange(d),
    nav()
  );
}

function header(d) {
  const cells = [];
  for (let i = 0; i < d.planLength; i++) {
    const n = i + 1, date = addDays(d.cfg.startDate, i), dd = S.days[date];
    const has = dd && dd.tasks.length;
    const all = has && dd.tasks.every((t) => t.status !== "pending");
    const some = has && dd.tasks.some((t) => t.status === "done");
    const cls = ["cell", n === d.dayIndex ? "cur" : "", n === d.todayIndex ? "today" : "",
      all ? "full" : some ? "part" : n < d.todayIndex ? "miss" : ""].filter(Boolean).join(" ");
    cells.push(el("button", {
      class: cls, "aria-label": "Day " + n, title: "Day " + n,
      onclick: () => goTo(date),
    }));
  }

  return el("header", { class: "hero" },
    el("div", { class: "heroTop" },
      el("div", null,
        el("div", { class: "dayNum" }, "Day " + (d.inRange ? d.dayIndex : "—"),
          el("span", { class: "ofTotal" }, "of " + d.planLength)),
        el("div", { class: "heroDate" }, prettyDate(ui.cursor))),
      el("div", { class: "countdown" },
        el("div", { class: d.toExam <= 0 ? "cdNum word" : "cdNum" },
          d.toExam < 0 ? "Past" : d.toExam === 0 ? "Today" : String(d.toExam)),
        el("div", { class: "cdLabel" },
          d.toExam < 0 ? "the exam has been and gone"
            : d.toExam === 0 ? "is the exam"
            : d.toExam === 1 ? "day to the exam" : "days to the exam"))),
    el("div", { class: "strip", style: { "--cols": Math.min(d.planLength, 25), "--colsM": Math.min(d.planLength, 15) } }, cells),
    el("div", { class: "stripKey" },
      el("span", { class: ui.saving ? "sync on" : "sync" }, ui.saving ? "Saving" : "Saved"))
  );
}

function outOfRange(d) {
  return el("main", null, el("div", { class: "empty" },
    el("p", null, `Your plan runs ${prettyDate(d.cfg.startDate)} to ${prettyDate(d.cfg.examDate)}, ${d.planLength} days. `
      + `This date falls ${d.dayIndex < 1 ? "before it starts" : "after the exam"}.`),
    el("div", { class: "emptyActions" },
      el("button", {
        class: "btn",
        onclick: () => commit(() => {
          if (d.dayIndex < 1) S.config.startDate = ui.cursor; else S.config.examDate = ui.cursor;
        }),
      }, d.dayIndex < 1 ? "Start the plan on this date" : "Move the exam to this date"),
      el("button", { class: "btn subtle", onclick: () => goTo(ui.today) }, "Back to today"))));
}

function tabContent(d) {
  if (ui.tab === "today") return todayTab(d);
  if (ui.tab === "banks") return banksTab(d);
  return settingsTab(d);
}

/* ---------- today ---------- */

function todayTab(d) {
  const kids = [];

  kids.push(el("div", { class: "dayNav" },
    el("button", { class: "ghost", onclick: () => goTo(addDays(ui.cursor, -1)) }, "Previous"),
    el("button", { class: "ghost", onclick: () => goTo(ui.today) }, "Today"),
    el("button", { class: "ghost", onclick: () => goTo(addDays(ui.cursor, 1)) }, "Next")));

  const p = d.outlook;
  if (ui.cursor === ui.today && p.missed > 0 && p.behind.length) {
    kids.push(el("button", { class: "driftBanner", onclick: () => { ui.tab = "banks"; render(); } },
      el("span", { class: "driftBannerNum" }, String(p.missed)),
      el("span", { class: "driftBannerText" },
        el("b", null, `${p.missed === 1 ? "day" : "days"} missed so far`),
        `${makeUpPhrase(p)} to make up across the ${d.daysLeft} ${d.daysLeft === 1 ? "day" : "days"} left`),
      el("span", { class: "driftBannerGo" }, "→")));
  }

  if (ui.replaceWith) {
    kids.push(el("div", { class: "confirm" },
      el("p", null, `Replace today's plan with the ${DEFAULT_TEMPLATES[ui.replaceWith].label} template? Anything you added by hand, or moved here from an earlier day, stays.`),
      el("div", { class: "confirmRow" },
        el("button", { class: "btn", onclick: () => applyTemplate(ui.replaceWith) }, "Yes, replace it"),
        el("button", { class: "btn subtle", onclick: () => { ui.replaceWith = null; render(); } }, "Cancel"))));
  }

  kids.push(el("div", { class: "tpl" }, Object.keys(DEFAULT_TEMPLATES).map((k) => {
    const list = tplTasks(k, S.config);
    return el("button", {
      class: "tplBtn" + (d.day && d.day.template === k ? " on" : ""),
      onclick: () => {
        if (d.tasks.some((t) => !isKeeper(t))) { ui.replaceWith = k; render(); }
        else applyTemplate(k);
      },
    },
      el("span", { class: "tplTop" },
        el("span", { class: "tplName" }, DEFAULT_TEMPLATES[k].label),
        el("span", { class: "tplMins" }, fmtDur(tplMins(list)))),
      el("span", { class: "tplBlurb" }, tplBlurb(list)));
  })));

  kids.push(el("button", { class: "tplEdit", onclick: () => openTemplateEditor("chill") },
    "Edit what the templates contain"));

  if (!d.tasks.length) {
    kids.push(el("div", { class: "blank" },
      el("p", null, "Nothing planned yet. Insert a template above, or build the day by hand."),
      el("button", { class: "btn subtle", onclick: () => openTaskEditor(newTask(), d) }, "Add a task")));
    return el("main", null, kids);
  }

  const live = d.tasks.filter((t) => t.status !== "skipped");
  const planned = live.reduce((n, t) => n + (t.mins || 0), 0);
  const spent = live.reduce((n, t) => n + (t.spent || 0), 0);
  const done = d.tasks.filter((t) => t.status === "done").length;
  const pct = Math.round((done / d.tasks.length) * 100);

  kids.push(el("div", { class: "progressRow" },
    el("div", { class: "pbar" }, el("div", { class: "pfill", style: { width: pct + "%" } })),
    el("span", { class: "pnum" }, `${done}/${d.tasks.length}`)));
  kids.push(el("div", { class: "budget" },
    el("span", null, el("strong", null, fmtDur(planned)), " planned today"),
    el("span", { class: spent ? "logged" : "" }, fmtDur(spent) + " logged")));

  /* group by block, ordered by clock time */
  const sorted = [...d.tasks].sort((a, b) => (a.at || "12:00").localeCompare(b.at || "12:00"));
  const groups = [];
  sorted.forEach((t) => {
    const last = groups[groups.length - 1];
    if (last && last.block === t.block) last.items.push(t);
    else groups.push({ block: t.block, at: t.at, items: [t] });
  });

  groups.forEach((g) => {
    kids.push(el("section", { class: "window" },
      el("div", { class: "wHead" },
        el("span", { class: "wTime" }, fmtTime(g.at)),
        el("span", { class: "wLabel" }, BLOCKS[g.block] || "Anytime"),
        el("span", { class: "wMins" }, fmtDur(g.items.reduce((n, t) => n + (t.mins || 0), 0)))),
      g.items.map((t) => taskRow(t, d))));
  });

  const actions = [
    el("button", { class: "btn", onclick: () => openTaskEditor(newTask(), d) }, "Add a task"),
    el("button", { class: "btn subtle", onclick: () => rollForward(d) }, "Move what's left to tomorrow"),
  ];

  if (ui.confirmClear) {
    const logged = d.tasks.filter((t) => t.status === "done" || t.actual > 0).length;
    actions.push(el("div", { class: "confirm" },
      el("p", null, `Clear all ${d.tasks.length} tasks on ${prettyDate(ui.cursor)}? `
        + (logged
          ? `${logged} of them ${logged === 1 ? "has" : "have"} work logged against a bank, and that comes off too.`
          : "Nothing has been logged against a bank yet, so no progress is lost.")),
      el("div", { class: "confirmRow" },
        el("button", {
          class: "btn danger solid",
          onclick: () => {
            commit(() => { S.days[ui.cursor] = { template: null, tasks: [] }; ui.confirmClear = false; });
            flash("Day cleared.");
          },
        }, "Yes, clear the day"),
        el("button", { class: "btn subtle", onclick: () => { ui.confirmClear = false; render(); } }, "Keep it"))));
  } else {
    actions.push(el("button", {
      class: "btn ghostBtn",
      onclick: () => { ui.confirmClear = true; render(); },
    }, "Clear the day"));
  }
  kids.push(el("div", { class: "dayActions" }, actions));

  return el("main", null, kids);
}

function taskRow(t, d) {
  const k = KINDS[t.kind] || KINDS.CO;
  const done = t.status === "done";
  const step = t.unit === "questions" ? 5 : 1;
  const bump = (delta) => commit(() => mutateDay((dd) => {
    dd.tasks = dd.tasks.map((x) => {
      if (x.id !== t.id) return x;
      const actual = Math.max(0, Math.min(x.target, x.actual + delta));
      return { ...x, actual, status: actual >= x.target ? "done" : actual > 0 ? "partial" : "pending" };
    });
    return dd;
  }));

  const meta = [
    el("span", { class: "dot sm", style: { background: k.color } }),
    k.abbr, el("span", { class: "metaSep" }), fmtDur(t.mins || 0),
  ];
  if (t.spent) meta.push(el("span", { class: "metaSep" }), el("b", { class: "spentTag" }, fmtDur(t.spent) + " spent"));
  if (t.bank) meta.push(el("span", { class: "metaSep" }), t.bank.key.length === 2 ? t.bank.key : "T" + t.bank.key);
  if (t.rolledFrom) meta.push(el("span", { class: "metaSep" }), `moved ${t.rolledFrom}×`);

  return el("div", { class: "task" + (done ? " done" : "") + (t.status === "skipped" ? " skipped" : "") },
    el("button", {
      class: "check", "aria-label": done ? "Mark not done" : "Mark done",
      onclick: () => commit(() => mutateDay((dd) => {
        dd.tasks = dd.tasks.map((x) => x.id !== t.id ? x
          : x.status === "done" ? { ...x, status: "pending", actual: 0 }
          : { ...x, status: "done", actual: x.target });
        return dd;
      })),
    }, done ? "✓" : ""),
    el("button", { class: "taskBody", onclick: () => openTaskEditor(t, d) },
      el("span", { class: "taskTitle" }, t.title),
      el("span", { class: "taskMeta" }, meta)),
    el("div", { class: "counter" },
      el("button", { "aria-label": "Less", onclick: () => bump(-step) }, "−"),
      el("span", { class: "cnum" }, String(t.actual), el("i", null, "/" + t.target)),
      el("button", { "aria-label": "More", onclick: () => bump(step) }, "+")));
}

function rollForward(d) {
  const left = d.tasks.filter((t) => (t.status === "pending" || t.status === "partial") && t.bank);
  if (!left.length) return flash("Nothing outstanding to move.");
  const next = addDays(ui.cursor, 1);
  commit(() => {
    const nd = ensureDay(next);
    S.days[next] = { ...nd, tasks: [...nd.tasks, ...left.map((t) => ({
      ...t, id: uid(), actual: 0, spent: 0, status: "pending", rolledFrom: (t.rolledFrom || 0) + 1,
      fromTemplate: null, tid: null,
    }))] };
    S.days[ui.cursor] = { ...ensureDay(ui.cursor), tasks: d.tasks.filter((t) => !left.includes(t)) };
  });
  flash(`Moved ${left.length} to tomorrow.`);
}

const newTask = () => ({
  id: uid(), block: "evening", at: "19:30", kind: "CO", title: "",
  target: 1, actual: 0, spent: 0, unit: "questions", mins: 20, bank: null,
  status: "pending", fromTemplate: null,
});

/* ---------- drift ---------- */

/* pace figures read better loose than exact: 13 a day, or 1.6 */
const per = (v) => (v >= 10 ? String(Math.round(v)) : v.toFixed(1));

function makeUpPhrase(p) {
  const byUnit = {};
  p.behind.forEach((s) => (byUnit[s.unit] = (byUnit[s.unit] || 0) + s.behindBy));
  return Object.entries(byUnit).map(([unit, v]) => `${n0(v)} ${unit}`).join(" and ");
}

const VERDICTS = {
  clear: ["Cleared", "ok"],
  ok: ["On pace", "ok"],
  slipping: ["Slipping", "warn"],
  off: ["Off track", "warn"],
};

function driftLede(p, d) {
  if (d.daysLeft === 0) {
    return d.toExam < 0 ? "The exam has passed, so this is the closing record."
      : "Exam day. There are no days left to spread anything over.";
  }
  if (p.elapsed === 0) return "The plan starts today, so there is nothing to catch up on yet.";
  if (!p.behind.length) {
    return `Level with the plan after ${p.elapsed} ${p.elapsed === 1 ? "day" : "days"}. `
      + "Nothing has been pushed onto the days ahead.";
  }
  const cause = p.missed === 0
    ? "Logging less than the plan asked for has left"
    : `${p.missed} ${p.missed === 1 ? "day" : "days"} with nothing logged has left`;
  return `${cause} ${makeUpPhrase(p)} to make up, spread over the ${d.daysLeft} `
    + `${d.daysLeft === 1 ? "day" : "days"} before the exam.`;
}

function outlookCard(d) {
  const p = d.outlook;
  const [word, tone] = VERDICTS[p.verdict];
  const kids = [
    el("div", { class: "driftHead" },
      el("span", { class: "driftTag " + tone }, word),
      el("span", { class: "driftDays" }, p.elapsed === 0 ? "Day one"
        : `${p.studied} of ${p.elapsed} ${p.elapsed === 1 ? "day" : "days"} studied`)),
    el("p", { class: "driftLede" }, driftLede(p, d)),
  ];

  p.live.forEach((s) => kids.push(el("div", { class: "driftRow" },
    el("span", { class: "dot sm", style: { background: s.color } }),
    el("span", { class: "driftName" }, s.abbr),
    el("span", { class: "driftLeft" }, `${n0(s.remaining)} ${s.unit} left`),
    d.daysLeft === 0 ? el("span", { class: "driftPace" }, "unseen")
      : el("span", { class: "driftPace" }, per(s.needed) + "/day",
        s.needed > s.asked * 1.05 ? el("i", null, ` up from ${per(s.asked)}`) : null))));

  if (!p.live.length) {
    kids.push(el("p", { class: "driftOk" }, "Every bank is at its target. Nothing left to schedule."));
  } else if (p.atRisk.length) {
    kids.push(el("p", { class: "driftRisk" }, "At your pace over the last fortnight you would reach exam day with "
      + p.atRisk.map((s) => `${n0(s.shortfall)} ${s.unit} of ${s.abbr}`).join(", ") + " still unseen."));
  } else {
    kids.push(el("p", { class: "driftOk" }, "Your pace over the last fortnight clears every bank before exam day."));
  }

  const steps = [1, 3, 7];
  if (p.live.length && d.daysLeft > 1) {
    kids.push(el("p", { class: "whatIfNote" }, "What each skill costs a day if you sit out more days:"));
    kids.push(el("table", { class: "tbl whatIf" },
      el("thead", null, el("tr", null,
        ["", "now", ...steps.map((n) => "+" + n)].map((h) => el("th", null, h)))),
      el("tbody", null, p.live.map((s) => el("tr", null,
        el("td", null, s.abbr),
        el("td", null, per(s.needed)),
        steps.map((n) => { const v = s.ifMissed(n); return el("td", null, v == null ? "—" : per(v)); }))))));
  }

  return el("div", { class: "drift" }, kids);
}

/* ---------- banks ---------- */

function banksTab(d) {
  const kids = [];
  kids.push(el("div", { class: "statGrid" },
    stat("Current streak", d.streak, d.streak === 1 ? "day" : "days"),
    stat("Days elapsed", Math.max(0, Math.min(d.todayIndex, d.planLength)), "of " + d.planLength)));

  kids.push(el("h2", { class: "h2" }, "Where you stand"));
  kids.push(el("p", { class: "lede" },
    "Days you skip don't disappear — the work moves onto the days that are left. This is that arithmetic."));
  kids.push(outlookCard(d));

  kids.push(el("h2", { class: "h2" }, "Bank coverage"));
  kids.push(el("p", { class: "lede" },
    "Every question and sujet you log counts here. The pace line compares your last two weeks against what's left."));

  Object.keys(BANKS).forEach((sk) => kids.push(bankCard(sk, d)));

  kids.push(el("h2", { class: "h2" }, "Your thresholds"));
  kids.push(el("p", { class: "lede" },
    "IRCC converts each skill on its own and never averages them. Your weakest skill is your result."));
  const rows = [
    ["Compréhension orale", "0–699", "458", "503"],
    ["Compréhension écrite", "0–699", "453", "499"],
    ["Expression écrite", "0–20", "10", "12"],
    ["Expression orale", "0–20", "10", "12"],
  ];
  kids.push(el("table", { class: "tbl" },
    el("thead", null, el("tr", null, ["Skill", "Scale", "NCLC 7", "NCLC 8"].map((h) => el("th", null, h)))),
    el("tbody", null, rows.map((r) => el("tr", null, r.map((c) => el("td", null, c)))))));
  kids.push(el("p", { class: "fine" }, "Confirm the current bands on canada.ca before you file."));

  return el("main", null, kids);
}

function stat(label, value, unit) {
  return el("div", { class: "stat" },
    el("div", { class: "statVal" }, String(value), el("span", null, unit)),
    el("div", { class: "statLabel" }, label));
}

function bankCard(sk, d) {
  const B = BANKS[sk];
  const banked = d.banked[sk] || {};
  const done = B.parts.reduce((n, [k]) => n + (banked[k] || 0), 0);
  const target = d.cfg.targets[sk];
  const full = bankTotal(sk);
  const remaining = Math.max(0, target - done);
  const needed = d.daysLeft > 0 ? remaining / d.daysLeft : remaining;
  const perDay = d.pace[sk] || 0;
  const daysNeeded = perDay > 0 ? remaining / perDay : Infinity;
  const onTrack = daysNeeded <= d.daysLeft;
  const pct = Math.min(100, Math.round((done / target) * 100));
  const open = ui.openBanks.has(sk);

  const kids = [
    el("div", { class: "bankHead" },
      el("span", { class: "dot", style: { background: B.color } }),
      el("span", { class: "bankName" }, B.label),
      el("span", { class: "bankCount" }, n0(done), el("i", null, " / " + n0(target)))),
    el("div", { class: "pbar" }, el("div", { class: "pfill", style: { width: pct + "%", background: B.color } })),
    el("div", { class: "paceLine " + (onTrack ? "ok" : "behind") },
      remaining === 0 ? "Bank cleared."
        : perDay <= 0 ? `${n0(needed)} ${B.unit} a day to finish by exam day.`
        : onTrack ? `On pace. ${perDay.toFixed(1)}/day now, ${n0(needed)}/day needed.`
        : `Behind. ${perDay.toFixed(1)}/day now, ${n0(needed)}/day needed — ${n0(daysNeeded - d.daysLeft)} days late at this rate.`),
  ];

  if (target < full) kids.push(el("div", { class: "sampleNote" },
    `Aiming at ${n0(target)} of the ${n0(full)} available, ${Math.round((target / full) * 100)}% of the bank.`));

  kids.push(el("button", {
    class: "bankToggle",
    onclick: () => { open ? ui.openBanks.delete(sk) : ui.openBanks.add(sk); render(); },
  }, open ? "Hide breakdown" : `Breakdown by ${B.kind === "level" ? "level" : "tâche"}`));

  if (open) {
    const parts = B.parts.map(([key, cap]) => {
      const v = banked[key] || 0;
      return el("div", { class: "part" },
        el("span", { class: "partKey" }, B.kind === "level" ? key : "Tâche " + key),
        el("div", { class: "partBar" }, el("div", { style: { width: Math.min(100, (v / cap) * 100) + "%", background: B.color } })),
        el("input", {
          class: "partNum", type: "number", min: 0, max: cap, value: v,
          onchange: (e) => {
            let fromTasks = 0;
            Object.values(S.days).forEach((dd) => dd.tasks.forEach((t) => {
              if (t.bank && t.bank.skill === sk && t.bank.key === key) fromTasks += t.actual || 0;
            }));
            const clamped = Math.max(0, Math.min(cap, +e.target.value || 0));
            commit(() => { S.baseline[sk][key] = Math.max(0, clamped - fromTasks); });
          },
        }),
        el("span", { class: "partCap" }, "/ " + n0(cap)));
    });
    parts.push(el("label", { class: "targetRow" },
      el("span", null, "How many are you aiming to cover"),
      el("input", {
        type: "number", min: 1, max: full, value: target,
        onchange: (e) => commit(() => {
          S.config.targets[sk] = Math.max(1, Math.min(full, +e.target.value || 1));
        }),
      })));
    kids.push(el("div", { class: "bankParts" }, parts));
  }

  return el("div", { class: "bank" }, kids);
}

/* ---------- settings ---------- */

function settingsTab(d) {
  const kids = [];
  kids.push(el("h2", { class: "h2" }, "Dates"));
  kids.push(el("label", { class: "field" }, el("span", null, "First day of the plan"),
    el("input", { type: "date", value: d.cfg.startDate, onchange: (e) => commit(() => { S.config.startDate = e.target.value; }) })));
  kids.push(el("label", { class: "field" }, el("span", null, "Exam date"),
    el("input", { type: "date", value: d.cfg.examDate, onchange: (e) => commit(() => { S.config.examDate = e.target.value; }) })));
  kids.push(el("div", { class: d.badRange ? "lengthNote bad" : "lengthNote" },
    d.badRange ? "The exam date falls before the start date. Move one of them so the plan runs forward."
      : `${d.planLength} days in the plan, ${d.daysLeft} still ahead of you.`));

  kids.push(el("h2", { class: "h2" }, "Templates"));
  kids.push(el("p", { class: "lede" },
    "Change what Chill and Productive insert — times, durations, quotas, or which tasks appear at all."));
  kids.push(el("div", { class: "tpl" }, Object.keys(DEFAULT_TEMPLATES).map((k) => {
    const list = tplTasks(k, S.config);
    return el("button", { class: "tplBtn", onclick: () => openTemplateEditor(k) },
      el("span", { class: "tplTop" },
        el("span", { class: "tplName" }, DEFAULT_TEMPLATES[k].label),
        el("span", { class: "tplMins" }, fmtDur(tplMins(list)))),
      el("span", { class: "tplBlurb" }, `${list.length} tasks · ${tplBlurb(list)}`));
  })));

  kids.push(el("h2", { class: "h2" }, "Appearance"));
  kids.push(el("div", { class: "seg" }, [["light", "Light"], ["dark", "Dim"], ["auto", "Match device"]].map(([k, l]) =>
    el("button", {
      class: "segBtn" + ((S.config.theme || "light") === k ? " on" : ""),
      onclick: () => commit(() => { S.config.theme = k; setThemeColor(); }),
    }, l))));

  kids.push(el("h2", { class: "h2" }, "Your data"));
  kids.push(el("p", { class: "lede" },
    "Stored on this device, in this browser. Nothing is sent anywhere. Copy a backup weekly."));
  const doneTotal = Object.values(S.days).reduce((n, x) => n + x.tasks.filter((t) => t.status === "done").length, 0);
  kids.push(el("div", { class: "recordCard" },
    el("div", { class: "recordNum" }, String(Object.keys(S.days).length)),
    el("div", { class: "recordText" }, `days recorded, ${doneTotal} tasks completed`)));
  kids.push(el("button", { class: "btn", onclick: openBackup }, "Back up or restore"));

  if (ui.confirmWipe) {
    kids.push(el("div", { class: "confirm" },
      el("p", null, `Delete all ${Object.keys(S.days).length} days of records and reset every bank? A backup is the only way back.`),
      el("div", { class: "confirmRow" },
        el("button", { class: "btn danger solid", onclick: () => { S = freshState(); ui.confirmWipe = false; flushSave(); render(); flash("Everything cleared."); } }, "Yes, clear everything"),
        el("button", { class: "btn subtle", onclick: () => { ui.confirmWipe = false; render(); } }, "Cancel"))));
  } else {
    kids.push(el("button", { class: "btn danger", onclick: () => { ui.confirmWipe = true; render(); } }, "Clear everything"));
  }

  kids.push(el("p", { class: "fine", style: { marginTop: "22px" } },
    "Installed from the home screen, this works with no connection at all."));

  return el("main", null, kids);
}

/* "Match device" is settled here rather than in CSS, so the dark palette
   only has to be written once */
const darkQuery = matchMedia("(prefers-color-scheme: dark)");
const resolvedTheme = () => {
  const t = S.config.theme || "light";
  return t === "auto" ? (darkQuery.matches ? "dark" : "light") : t;
};
darkQuery.addEventListener("change", () => {
  if ((S.config.theme || "light") !== "auto") return;
  setThemeColor(); render();
});

function setThemeColor() {
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.content = resolvedTheme() === "dark" ? "#0D1117" : "#FDF9FB";
}

/* ---------- nav ---------- */

function nav() {
  return el("nav", { class: "nav" }, [["today", "Today"], ["banks", "Banks"], ["settings", "Settings"]].map(([k, l]) =>
    el("button", { class: ui.tab === k ? "navBtn on" : "navBtn", onclick: () => { ui.tab = k; render(); } }, l)));
}

/* ---------- sheets ---------- */

function openSheet(inner, wide) {
  closeSheet();
  const wrap = el("div", { class: "sheetWrap", onclick: (e) => { if (e.target === wrap) closeSheet(); } },
    el("div", { class: "sheet" + (wide ? " wide" : "") }, inner));
  wrap.id = "sheet";
  document.body.appendChild(wrap);
}
function closeSheet() { const s = document.getElementById("sheet"); if (s) s.remove(); }

function openTaskEditor(task, d) {
  const t = { ...task };
  const isNew = !task.title;
  const kids = [];

  kids.push(el("h3", { class: "sheetTitle" }, isNew ? "Add a task" : "Edit task"));
  if (!isNew) kids.push(el("p", { class: "scopeNote" },
    task.fromTemplate
      ? `Changes stay on ${prettyDate(ui.cursor)}. The ${DEFAULT_TEMPLATES[task.fromTemplate].label} template is untouched unless you say so below.`
      : `Changes stay on ${prettyDate(ui.cursor)}.`));

  kids.push(el("label", { class: "field" }, el("span", null, "What are you doing"),
    el("input", { value: t.title, placeholder: "Compréhension orale — B1", oninput: (e) => (t.title = e.target.value) })));

  const bankField = el("div");
  const drawBankField = () => {
    bankField.replaceChildren();
    if (!BANKS[t.kind]) return;
    const B = BANKS[t.kind];
    bankField.append(el("label", { class: "field" },
      el("span", null, "Counts toward " + B.label),
      el("select", { onchange: (e) => (t.bank = { skill: t.kind, key: e.target.value }) },
        B.parts.map(([k, cap]) => el("option", {
          value: k, selected: (t.bank && t.bank.key) === k,
        }, `${B.kind === "level" ? k : "Tâche " + k} — ${n0(cap)} ${B.unit}`)))));
  };
  drawBankField();

  kids.push(el("div", { class: "fieldRow" },
    el("label", { class: "field" }, el("span", null, "Type"),
      el("select", {
        onchange: (e) => {
          t.kind = e.target.value;
          t.bank = BANKS[t.kind] ? { skill: t.kind, key: BANKS[t.kind].parts[0][0] } : null;
          if (BANKS[t.kind]) t.unit = BANKS[t.kind].unit;
          drawBankField();
        },
      }, Object.entries(KINDS).map(([k, v]) => el("option", { value: k, selected: t.kind === k }, v.label)))),
    el("label", { class: "field" }, el("span", null, "Block"),
      el("select", { onchange: (e) => (t.block = e.target.value) },
        Object.entries(BLOCKS).map(([k, v]) => el("option", { value: k, selected: t.block === k }, v))))));

  kids.push(bankField);

  kids.push(el("div", { class: "fieldRow" },
    el("label", { class: "field" }, el("span", null, "Start time"),
      el("input", { type: "time", value: t.at || "19:30", oninput: (e) => (t.at = e.target.value) })),
    el("label", { class: "field" }, el("span", null, "Estimated time"),
      el("select", { onchange: (e) => { t.mins = +e.target.value; t.minsLocked = true; } },
        DURATIONS.map((m) => el("option", { value: m, selected: (t.mins || 20) === m }, fmtDur(m)))))));

  kids.push(el("div", { class: "fieldRow" },
    el("label", { class: "field" }, el("span", null, "Target"),
      el("input", {
        type: "number", min: 1, value: t.target,
        oninput: (e) => { t.target = Math.max(1, +e.target.value || 1); if (!t.minsLocked) t.mins = estimateMins(t.unit, t.target); },
      })),
    el("label", { class: "field" }, el("span", null, "Counted in"),
      el("input", { value: t.unit, oninput: (e) => (t.unit = e.target.value) }))));

  const spentVal = el("div", { class: "spentVal" }, t.spent ? fmtDur(t.spent) : "Not logged");
  const setSpent = (v) => { t.spent = Math.max(0, v); spentVal.textContent = t.spent ? fmtDur(t.spent) : "Not logged"; };
  kids.push(el("div", { class: "field" }, el("span", null, "Time actually spent"),
    el("div", { class: "spentRow" }, spentVal,
      [5, 10, 15, 30].map((m) => el("button", { class: "chip", onclick: () => setSpent((t.spent || 0) + m) }, "+" + m)),
      el("button", { class: "chip clear", onclick: () => setSpent(0) }, "Clear"))));

  const actions = el("div", { class: "sheetActions" });
  const save = () => {
    if (!t.title.trim()) return;
    commit(() => mutateDay((dd) => {
      dd.tasks = dd.tasks.some((x) => x.id === t.id)
        ? dd.tasks.map((x) => (x.id === t.id ? t : x)) : [...dd.tasks, t];
      return dd;
    }));
    closeSheet();
  };
  actions.append(el("button", { class: "btn", onclick: save }, isNew ? "Add task" : "Save changes"));

  if (!isNew && task.fromTemplate && task.tid) {
    actions.append(el("button", {
      class: "btn subtle",
      onclick: () => {
        const kind = task.fromTemplate;
        const list = tplTasks(kind, S.config).map((x) => {
          if (x.tid !== task.tid) return x;
          const keepAuto = x.bank && x.bank.key === "auto" && t.bank && t.bank.skill === x.bank.skill;
          return { ...x, title: t.title, at: t.at, mins: t.mins, target: t.target, unit: t.unit, kind: t.kind, bank: keepAuto ? x.bank : t.bank };
        });
        saveTemplate(kind, list, true);
        closeSheet();
        flash("Saved to the task and the template.");
      },
    }, `Save, and change every ${DEFAULT_TEMPLATES[task.fromTemplate].label} day`));
  }

  if (!isNew) {
    actions.append(el("button", {
      class: "btn subtle",
      onclick: () => {
        commit(() => mutateDay((dd) => {
          dd.tasks = dd.tasks.map((x) => x.id === t.id ? { ...x, status: x.status === "skipped" ? "pending" : "skipped" } : x);
          return dd;
        }));
        closeSheet();
      },
    }, t.status === "skipped" ? "Put it back" : "Skip today"));

    actions.append(el("button", {
      class: "btn danger",
      onclick: () => {
        actions.replaceChildren();
        actions.append(el("div", { class: "confirm" },
          el("p", null, "Delete this task? Its contribution to the bank comes off too. Everything else on the day stays."),
          el("div", { class: "confirmRow" },
            el("button", {
              class: "btn danger solid",
              onclick: () => {
                commit(() => mutateDay((dd) => { dd.tasks = dd.tasks.filter((x) => x.id !== t.id); return dd; }));
                closeSheet(); flash("Task deleted.");
              },
            }, "Yes, delete it"),
            el("button", { class: "btn subtle", onclick: () => { closeSheet(); openTaskEditor(task, d); } }, "Keep it"))));
      },
    }, "Delete"));
  }
  actions.append(el("button", { class: "btn ghostBtn", onclick: closeSheet }, "Cancel"));
  kids.push(actions);

  openSheet(kids);
}

function openTemplateEditor(kindKey) {
  let kind = kindKey;
  let list = JSON.parse(JSON.stringify(tplTasks(kind, S.config)));
  const drafts = {};

  const body = el("div");
  const draw = () => {
    const kids = [];
    kids.push(el("h3", { class: "sheetTitle" }, "Edit templates"));
    kids.push(el("div", { class: "seg two" }, Object.keys(DEFAULT_TEMPLATES).map((k) =>
      el("button", {
        class: "segBtn" + (kind === k ? " on" : ""),
        onclick: () => {
          drafts[kind] = list; saveTemplate(kind, list, true);
          kind = k; list = JSON.parse(JSON.stringify(drafts[k] || tplTasks(k, S.config)));
          draw();
        },
      }, DEFAULT_TEMPLATES[k].label))));
    kids.push(el("p", { class: "lede tight" },
      `${fmtDur(tplMins(list))} total. Changes apply the next time you insert this template, and to days already using it.`));

    const order = list.map((t, i) => ({ t, i })).sort((a, b) => a.t.at.localeCompare(b.t.at));
    order.forEach(({ t, i }) => {
      const row = el("div", { class: "tplRow" });
      row.append(el("input", {
        class: "tplTitle", value: t.title, placeholder: "What are you doing",
        oninput: (e) => (list[i].title = e.target.value),
      }));
      row.append(el("div", { class: "tplControls" },
        el("input", { type: "time", value: t.at, onchange: (e) => { list[i].at = e.target.value; draw(); } }),
        el("select", { onchange: (e) => { list[i].mins = +e.target.value; draw(); } },
          DURATIONS.map((m) => el("option", { value: m, selected: t.mins === m }, fmtDur(m)))),
        el("input", { type: "number", min: 1, value: t.target, title: "Target", onchange: (e) => (list[i].target = Math.max(1, +e.target.value || 1)) }),
        el("button", {
          class: "rowDel", "aria-label": "Delete",
          onclick: () => {
            const c = el("div", { class: "rowConfirm" },
              el("span", null, `Remove this from the ${DEFAULT_TEMPLATES[kind].label} template?`),
              el("button", { class: "chip danger", onclick: () => { list.splice(i, 1); draw(); } }, "Remove"),
              el("button", { class: "chip", onclick: () => c.remove() }, "Keep"));
            row.append(c);
          },
        }, "✕")));
      row.append(el("div", { class: "tplControls" },
        el("select", {
          onchange: (e) => {
            const kk = e.target.value;
            list[i].kind = kk;
            list[i].bank = BANKS[kk] ? { skill: kk, key: BANKS[kk].parts[0][0] } : null;
            if (BANKS[kk]) list[i].unit = BANKS[kk].unit;
            draw();
          },
        }, Object.entries(KINDS).map(([k, v]) => el("option", { value: k, selected: t.kind === k }, v.label))),
        BANKS[t.kind] ? el("select", { onchange: (e) => (list[i].bank = { skill: t.kind, key: e.target.value }) },
          [BANKS[t.kind].kind === "level" ? el("option", { value: "auto", selected: t.bank && t.bank.key === "auto" }, "Next level due") : null,
            ...BANKS[t.kind].parts.map(([k]) => el("option", { value: k, selected: t.bank && t.bank.key === k },
              BANKS[t.kind].kind === "level" ? k : "Tâche " + k))].filter(Boolean)) : null));
      kids.push(row);
    });

    kids.push(el("div", { class: "sheetActions" },
      el("button", {
        class: "btn subtle",
        onclick: () => {
          list.push({ tid: uid(), block: "evening", at: "20:00", kind: "EE", title: "New task", target: 1, unit: "sujets", mins: 10, bank: { skill: "EE", key: "1" } });
          draw();
        },
      }, "Add a task to this template"),
      el("button", { class: "btn", onclick: () => { saveTemplate(kind, list); closeSheet(); } }, "Save template"),
      el("button", { class: "btn ghostBtn", onclick: () => { list = JSON.parse(JSON.stringify(DEFAULT_TEMPLATES[kind].tasks)); draw(); } }, "Reset to default"),
      el("button", { class: "btn ghostBtn", onclick: closeSheet }, "Cancel")));

    body.replaceChildren(...kids);
  };
  draw();
  openSheet(body, true);
}

function openBackup() {
  const text = JSON.stringify(S);
  const kb = Math.max(1, Math.round(text.length / 1024));
  const box = el("textarea", { class: "backupBox", readOnly: true, value: text, onfocus: (e) => e.target.select() });
  const paste = el("textarea", { class: "backupBox", placeholder: "Paste your backup text" });

  openSheet([
    el("h3", { class: "sheetTitle" }, "Back up or restore"),
    el("p", { class: "scopeNote" },
      `Your whole record is the ${kb} KB of text below. Copy it into a note or an email to yourself — that is the backup.`),
    box,
    el("div", { class: "sheetActions" },
      el("button", {
        class: "btn",
        onclick: async () => {
          box.select(); box.setSelectionRange(0, text.length);
          const ok = await copyText(text);
          flash(ok ? "Backup copied. Paste it somewhere safe." : "Copy blocked — select the text and copy it by hand.");
        },
      }, "Copy backup text"),
      el("button", {
        class: "btn subtle",
        onclick: () => { downloadFile(text, `tcf-tracker-${iso(new Date())}.json`); flash("Saved to your downloads, if your browser allows it."); },
      }, "Save as a file")),
    el("h3", { class: "sheetTitle restoreHead" }, "Restore"),
    el("p", { class: "scopeNote" }, "Paste a backup here to replace everything currently recorded."),
    paste,
    el("div", { class: "sheetActions" },
      el("button", { class: "btn", onclick: () => restoreFrom(paste.value.trim()) }, "Restore from pasted text"),
      el("label", { class: "btn subtle fileBtn" }, "Restore from a file instead",
        el("input", {
          type: "file", accept: "application/json,.json,text/plain",
          onchange: (e) => {
            const f = e.target.files && e.target.files[0];
            if (!f) return;
            const r = new FileReader();
            r.onload = () => restoreFrom(r.result);
            r.readAsText(f);
            e.target.value = "";
          },
        })),
      el("button", { class: "btn ghostBtn", onclick: closeSheet }, "Close")),
  ], true);
}

/* ---------- boot ---------- */

setThemeColor();
render();
if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}
