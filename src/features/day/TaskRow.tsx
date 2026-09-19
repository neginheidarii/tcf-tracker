import { KINDS } from "../../domain/banks";
import { fmtDur } from "../../domain/dates";
import type { Task } from "../../domain/types";
import { bumpActual, stepFor, toggleDone } from "../../state/actions";
import { useStore } from "../../sync/StoreProvider";

/* One line of the day: tick it, or nudge the count as you go. */

export function TaskRow({ task, onOpen }: { task: Task; onOpen: (task: Task) => void }) {
  const { dispatch } = useStore();
  const kind = KINDS[task.kind] ?? KINDS.CO;
  const done = task.status === "done";
  const step = stepFor(task);

  const classes = ["task", done ? "done" : "", task.status === "skipped" ? "skipped" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes}>
      <button
        className="check"
        aria-label={done ? `Mark ${task.title} not done` : `Mark ${task.title} done`}
        onClick={() => dispatch(toggleDone(task))}
      >
        {done ? "✓" : ""}
      </button>

      <button className="taskBody" onClick={() => onOpen(task)}>
        <span className="taskTitle">{task.title}</span>
        <span className="taskMeta">
          <span className="dot sm" style={{ background: kind.color }} />
          {kind.abbr}
          <span className="metaSep" />
          {fmtDur(task.mins)}
          {task.spent > 0 && (
            <>
              <span className="metaSep" />
              <b className="spentTag">{fmtDur(task.spent)} spent</b>
            </>
          )}
          {task.bank && (
            <>
              <span className="metaSep" />
              {task.bank.key.length === 2 ? task.bank.key : `T${task.bank.key}`}
            </>
          )}
          {task.rolledFrom > 0 && (
            <>
              <span className="metaSep" />
              {`moved ${task.rolledFrom}×`}
            </>
          )}
        </span>
      </button>

      <div className="counter">
        <button aria-label={`Less ${task.title}`} onClick={() => dispatch(bumpActual(task, -step))}>−</button>
        <span className="cnum">
          {task.actual}
          <i>{`/${task.target}`}</i>
        </span>
        <button aria-label={`More ${task.title}`} onClick={() => dispatch(bumpActual(task, step))}>+</button>
      </div>
    </div>
  );
}
