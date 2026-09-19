import { useState } from "react";
import { Sheet } from "../../components/Sheet";
import { BANKS, BLOCKS, DURATIONS, KINDS, isSkill } from "../../domain/banks";
import { estimateMins, fmtDur, n0, prettyDate } from "../../domain/dates";
import { TEMPLATE_LABELS } from "../../domain/templates";
import type { BlockKey, Task, TaskKind } from "../../domain/types";
import { deleteTask, retargetTask, saveTask, saveTaskToTemplate, toggleSkipped } from "../../state/actions";
import { useSnapshot } from "../../sync/StoreProvider";

/* Editing one task. Changes stay on the day unless you deliberately push them
   back into the template the task came from. */

export function TaskSheet({
  task: original, isNew, today, onClose, onFlash,
}: {
  task: Task;
  isNew: boolean;
  today: string;
  onClose: () => void;
  onFlash: (message: string) => void;
}) {
  const { snapshot, dispatch } = useSnapshot();
  const [draft, setDraft] = useState<Task>(original);
  const [minsLocked, setMinsLocked] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const patch = (next: Partial<Task>) => setDraft((d) => ({ ...d, ...next }));
  /* Only the four skills draw on a bank; review, pauses and the bilan don't. */
  const skill = isSkill(draft.kind) ? draft.kind : null;
  const bank = skill && draft.bank ? BANKS[skill] : null;

  function save() {
    if (!draft.title.trim()) return;
    dispatch(saveTask(draft));
    onClose();
  }

  return (
    <Sheet onClose={onClose}>
      <h3 className="sheetTitle">{isNew ? "Add a task" : "Edit task"}</h3>
      {!isNew && (
        <p className="scopeNote">
          {original.fromTemplate
            ? `Changes stay on ${prettyDate(draft.date)}. The ${TEMPLATE_LABELS[original.fromTemplate]} template is untouched unless you say so below.`
            : `Changes stay on ${prettyDate(draft.date)}.`}
        </p>
      )}

      <label className="field">
        <span>What are you doing</span>
        <input
          value={draft.title}
          placeholder="Compréhension orale — B1"
          onChange={(e) => patch({ title: e.target.value })}
        />
      </label>

      <div className="fieldRow">
        <label className="field">
          <span>Type</span>
          <select
            value={draft.kind}
            onChange={(e) => setDraft((d) => retargetTask(d, e.target.value as TaskKind))}
          >
            {Object.entries(KINDS).map(([key, v]) => (
              <option key={key} value={key}>{v.label}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Block</span>
          <select value={draft.block} onChange={(e) => patch({ block: e.target.value as BlockKey })}>
            {Object.entries(BLOCKS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </label>
      </div>

      {bank && skill && (
        <label className="field">
          <span>{`Counts toward ${bank.label}`}</span>
          <select
            value={draft.bank?.key ?? bank.parts[0][0]}
            onChange={(e) => patch({ bank: { skill, key: e.target.value } })}
          >
            {bank.parts.map(([key, cap]) => (
              <option key={key} value={key}>
                {`${bank.kind === "level" ? key : `Tâche ${key}`} — ${n0(cap)} ${bank.unit}`}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="fieldRow">
        <label className="field">
          <span>Start time</span>
          <input type="time" value={draft.at} onChange={(e) => patch({ at: e.target.value })} />
        </label>
        <label className="field">
          <span>Estimated time</span>
          <select
            value={draft.mins}
            onChange={(e) => {
              setMinsLocked(true);
              patch({ mins: Number(e.target.value) });
            }}
          >
            {DURATIONS.map((m) => (
              <option key={m} value={m}>{fmtDur(m)}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="fieldRow">
        <label className="field">
          <span>Target</span>
          <input
            type="number"
            min={1}
            value={draft.target}
            onChange={(e) => {
              const target = Math.max(1, Number(e.target.value) || 1);
              patch(minsLocked ? { target } : { target, mins: estimateMins(draft.unit, target) });
            }}
          />
        </label>
        <label className="field">
          <span>Counted in</span>
          <input value={draft.unit} onChange={(e) => patch({ unit: e.target.value })} />
        </label>
      </div>

      <div className="field">
        <span>Time actually spent</span>
        <div className="spentRow">
          <div className="spentVal">{draft.spent ? fmtDur(draft.spent) : "Not logged"}</div>
          {[5, 10, 15, 30].map((m) => (
            <button key={m} className="chip" onClick={() => patch({ spent: draft.spent + m })}>
              {`+${m}`}
            </button>
          ))}
          <button className="chip clear" onClick={() => patch({ spent: 0 })}>Clear</button>
        </div>
      </div>

      {confirmingDelete ? (
        <div className="confirm">
          <p>
            Delete this task? Its contribution to the bank comes off too. Everything else on the
            day stays.
          </p>
          <div className="confirmRow">
            <button
              className="btn danger solid"
              onClick={() => {
                dispatch(deleteTask(draft.id));
                onClose();
                onFlash("Task deleted.");
              }}
            >
              Yes, delete it
            </button>
            <button className="btn subtle" onClick={() => setConfirmingDelete(false)}>Keep it</button>
          </div>
        </div>
      ) : (
        <div className="sheetActions">
          <button className="btn" onClick={save}>{isNew ? "Add task" : "Save changes"}</button>

          {!isNew && original.fromTemplate && original.tid && (
            <button
              className="btn subtle"
              onClick={() => {
                dispatch([...saveTask(draft), ...saveTaskToTemplate(snapshot, draft, today)]);
                onClose();
                onFlash("Saved to the task and the template.");
              }}
            >
              {`Save, and change every ${TEMPLATE_LABELS[original.fromTemplate]} day`}
            </button>
          )}

          {!isNew && (
            <button
              className="btn subtle"
              onClick={() => {
                dispatch(toggleSkipped(draft));
                onClose();
              }}
            >
              {draft.status === "skipped" ? "Put it back" : "Skip today"}
            </button>
          )}

          {!isNew && (
            <button className="btn danger" onClick={() => setConfirmingDelete(true)}>Delete</button>
          )}

          <button className="btn ghostBtn" onClick={onClose}>Cancel</button>
        </div>
      )}
    </Sheet>
  );
}
