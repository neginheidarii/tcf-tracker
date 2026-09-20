import { useState } from "react";
import { useToast } from "../../components/Toast";
import { daysBetween, fmtDur } from "../../domain/dates";
import type { Derived } from "../../domain/select";
import { TEMPLATE_KINDS, TEMPLATE_LABELS, templateMins, templateTasks, templateBlurb } from "../../domain/templates";
import type { TemplateKind, ThemeChoice } from "../../domain/types";
import { setDates, setTheme } from "../../state/actions";
import { supabase } from "../../lib/supabase";
import { useSnapshot } from "../../sync/StoreProvider";
import { TemplateSheet } from "./TemplateSheet";

/* Dates, templates, appearance, the account, and a copy of your data to keep. */

const THEMES: [ThemeChoice, string][] = [
  ["light", "Light"],
  ["dark", "Dark"],
  ["auto", "Match device"],
];

export function SettingsView({ d, email }: { d: Derived; email: string | undefined }) {
  const { snapshot, dispatch, status, pending } = useSnapshot();
  const flash = useToast();
  const [editing, setEditing] = useState<TemplateKind | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const taskCount = Object.keys(snapshot.tasks).length;
  const dayCount = Object.keys(snapshot.days).length;
  const doneCount = Object.values(snapshot.tasks).filter((t) => t.status === "done").length;

  function download() {
    const text = JSON.stringify(snapshot, null, 2);
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `tcf-tracker-${d.today}.json`;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 2000);
    flash("Saved to your downloads.");
  }

  return (
    <main>
      <h2 className="h2">Dates</h2>
      <label className="field">
        <span>First day of the plan</span>
        <input
          type="date"
          value={d.plan.startDate}
          onChange={(e) => e.target.value && dispatch(setDates({ startDate: e.target.value }))}
        />
      </label>
      <label className="field">
        <span>Exam date</span>
        <input
          type="date"
          value={d.plan.examDate}
          onChange={(e) => e.target.value && dispatch(setDates({ examDate: e.target.value }))}
        />
      </label>
      <div className={d.badRange ? "lengthNote bad" : "lengthNote"}>
        {d.badRange
          ? "The exam date falls before the start date. Move one of them so the plan runs forward."
          : `${d.planLength} days in the plan, ${d.daysLeft} still ahead of you.`}
      </div>

      <h2 className="h2">Templates</h2>
      <p className="lede">
        Change what Chill and Productive insert — times, durations, quotas, or which tasks appear at
        all.
      </p>
      <div className="tpl">
        {TEMPLATE_KINDS.map((kind) => {
          const list = templateTasks(kind, snapshot.plan);
          return (
            <button key={kind} className="tplBtn" onClick={() => setEditing(kind)}>
              <span className="tplTop">
                <span className="tplName">{TEMPLATE_LABELS[kind]}</span>
                <span className="tplMins">{fmtDur(templateMins(list))}</span>
              </span>
              <span className="tplBlurb">{`${list.length} tasks · ${templateBlurb(list)}`}</span>
            </button>
          );
        })}
      </div>

      <h2 className="h2">Appearance</h2>
      <div className="seg">
        {THEMES.map(([value, label]) => (
          <button
            key={value}
            className={`segBtn${d.plan.theme === value ? " on" : ""}`}
            onClick={() => dispatch(setTheme(value))}
          >
            {label}
          </button>
        ))}
      </div>

      <h2 className="h2">Your account</h2>
      <p className="lede">
        Everything is stored against this account, so any device you sign in on shows the same
        record. This device also keeps its own copy, which is what you see when you're offline.
      </p>
      <div className="accountRow">
        <div className="accountEmail">
          {email ?? "Signed in"}
          <span>
            {status === "offline"
              ? pending
                ? `Offline — ${pending} ${pending === 1 ? "change" : "changes"} waiting to sync`
                : "Offline — showing this device's copy"
              : pending
                ? `Saving ${pending} ${pending === 1 ? "change" : "changes"}`
                : "Everything is saved"}
          </span>
        </div>
      </div>
      {signingOut ? (
        <div className="confirm">
          <p>
            {pending
              ? `${pending} ${pending === 1 ? "change has" : "changes have"} not reached the server yet. Signing out now would lose ${pending === 1 ? "it" : "them"}.`
              : "Sign out on this device? Your record stays on the server."}
          </p>
          <div className="confirmRow">
            <button
              className="btn danger solid"
              onClick={() => {
                void supabase?.auth.signOut();
              }}
            >
              Yes, sign out
            </button>
            <button className="btn subtle" onClick={() => setSigningOut(false)}>Stay signed in</button>
          </div>
        </div>
      ) : (
        <button className="btn subtle" onClick={() => setSigningOut(true)}>Sign out</button>
      )}

      <h2 className="h2">Your data</h2>
      <p className="lede">
        {`${dayCount} days recorded, ${taskCount} tasks, ${doneCount} completed. Keep a copy if you like — it is plain JSON.`}
      </p>
      <button className="btn subtle" onClick={download}>Download a copy</button>

      <p className="fine" style={{ marginTop: "22px" }}>
        {`Installed from the home screen this works offline, and syncs the moment you have a connection. Plan length ${Math.max(0, daysBetween(d.plan.startDate, d.plan.examDate) + 1)} days.`}
      </p>

      {editing && (
        <TemplateSheet
          initialKind={editing}
          today={d.today}
          onClose={() => setEditing(null)}
          onFlash={flash}
        />
      )}
    </main>
  );
}
