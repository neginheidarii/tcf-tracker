import { useState } from "react";
import { Sheet } from "../../components/Sheet";
import { BANKS, DURATIONS, KINDS, isSkill } from "../../domain/banks";
import { fmtDur } from "../../domain/dates";
import {
  TEMPLATE_KINDS, TEMPLATE_LABELS, emptyTemplateTask, retargetTemplateTask,
  templateMins, templateTasks,
} from "../../domain/templates";
import type { TaskKind, TemplateKind, TemplateTask } from "../../domain/types";
import { newId, resetTemplate, saveTemplate } from "../../state/actions";
import { useSnapshot } from "../../sync/StoreProvider";

/* Editing what Chill and Productive insert. Saving re-stamps today and every
   future day already using the template, keeping logged progress. */

export function TemplateSheet({
  initialKind, today, onClose, onFlash,
}: {
  initialKind: TemplateKind;
  today: string;
  onClose: () => void;
  onFlash: (message: string) => void;
}) {
  const { snapshot, dispatch } = useSnapshot();
  const [kind, setKind] = useState(initialKind);
  const [drafts, setDrafts] = useState<Partial<Record<TemplateKind, TemplateTask[]>>>({
    [initialKind]: structuredClone(templateTasks(initialKind, snapshot.plan)) as TemplateTask[],
  });
  const [removing, setRemoving] = useState<string | null>(null);

  const list = drafts[kind] ?? (structuredClone(templateTasks(kind, snapshot.plan)) as TemplateTask[]);
  const setList = (next: TemplateTask[]) => setDrafts((d) => ({ ...d, [kind]: next }));
  const patchRow = (tid: string, patch: Partial<TemplateTask>) =>
    setList(list.map((row) => (row.tid === tid ? { ...row, ...patch } : row)));

  /* Rows are edited in place but shown in clock order. */
  const ordered = [...list].sort((a, b) => a.at.localeCompare(b.at));

  function save(which: TemplateKind, rows: TemplateTask[], quiet = false) {
    dispatch(saveTemplate(snapshot, which, rows, today));
    if (!quiet) onFlash(`${TEMPLATE_LABELS[which]} template saved. Days using it are updated.`);
  }

  return (
    <Sheet wide onClose={onClose}>
      <h3 className="sheetTitle">Edit templates</h3>

      <div className="seg two">
        {TEMPLATE_KINDS.map((k) => (
          <button
            key={k}
            className={`segBtn${kind === k ? " on" : ""}`}
            onClick={() => {
              /* keep the current edits so switching back and forth is safe */
              save(kind, list, true);
              setKind(k);
              setDrafts((d) => ({
                ...d,
                [k]: d[k] ?? (structuredClone(templateTasks(k, snapshot.plan)) as TemplateTask[]),
              }));
            }}
          >
            {TEMPLATE_LABELS[k]}
          </button>
        ))}
      </div>

      <p className="lede tight">
        {`${fmtDur(templateMins(list))} total. Changes apply the next time you insert this template, and to days already using it.`}
      </p>

      {ordered.map((row) => {
        const skill = isSkill(row.kind) ? row.kind : null;
        const bank = skill ? BANKS[skill] : null;
        return (
          <div className="tplRow" key={row.tid}>
            <input
              className="tplTitle"
              value={row.title}
              placeholder="What are you doing"
              onChange={(e) => patchRow(row.tid, { title: e.target.value })}
            />

            <div className="tplControls">
              <input
                type="time"
                value={row.at}
                aria-label="Start time"
                onChange={(e) => patchRow(row.tid, { at: e.target.value })}
              />
              <select
                value={row.mins}
                aria-label="Estimated time"
                onChange={(e) => patchRow(row.tid, { mins: Number(e.target.value) })}
              >
                {DURATIONS.map((m) => <option key={m} value={m}>{fmtDur(m)}</option>)}
              </select>
              <input
                type="number"
                min={1}
                value={row.target}
                title="Target"
                aria-label="Target"
                onChange={(e) => patchRow(row.tid, { target: Math.max(1, Number(e.target.value) || 1) })}
              />
              <button
                className="rowDel"
                aria-label={`Remove ${row.title}`}
                onClick={() => setRemoving(row.tid)}
              >
                ✕
              </button>
            </div>

            <div className="tplControls">
              <select
                value={row.kind}
                aria-label="Type"
                onChange={(e) =>
                  patchRow(row.tid, retargetTemplateTask(row, e.target.value as TaskKind))
                }
              >
                {Object.entries(KINDS).map(([key, v]) => (
                  <option key={key} value={key}>{v.label}</option>
                ))}
              </select>

              {bank && skill && (
                <select
                  value={row.bank?.key ?? bank.parts[0][0]}
                  aria-label="Bank slice"
                  onChange={(e) => patchRow(row.tid, { bank: { skill, key: e.target.value } })}
                >
                  {bank.kind === "level" && <option value="auto">Next level due</option>}
                  {bank.parts.map(([key]) => (
                    <option key={key} value={key}>
                      {bank.kind === "level" ? key : `Tâche ${key}`}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {removing === row.tid && (
              <div className="rowConfirm">
                <span>{`Remove this from the ${TEMPLATE_LABELS[kind]} template?`}</span>
                <button
                  className="chip danger"
                  onClick={() => {
                    setList(list.filter((r) => r.tid !== row.tid));
                    setRemoving(null);
                  }}
                >
                  Remove
                </button>
                <button className="chip" onClick={() => setRemoving(null)}>Keep</button>
              </div>
            )}
          </div>
        );
      })}

      <div className="sheetActions">
        <button className="btn subtle" onClick={() => setList([...list, emptyTemplateTask(newId)])}>
          Add a task to this template
        </button>
        <button
          className="btn"
          onClick={() => {
            save(kind, list);
            onClose();
          }}
        >
          Save template
        </button>
        <button className="btn ghostBtn" onClick={() => setList(resetTemplate(kind))}>
          Reset to default
        </button>
        <button className="btn ghostBtn" onClick={onClose}>Cancel</button>
      </div>
    </Sheet>
  );
}
