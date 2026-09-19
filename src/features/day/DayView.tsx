import { useState } from "react";
import { BLOCKS } from "../../domain/banks";
import { addDays, fmtDur, fmtTime, prettyDate } from "../../domain/dates";
import { makeUpPhrase } from "../../domain/projection";
import { groupByBlock } from "../../domain/select";
import type { Derived } from "../../domain/select";
import { TEMPLATE_KINDS, TEMPLATE_LABELS, templateMins, templateBlurb, templateTasks } from "../../domain/templates";
import type { Task, TemplateKind } from "../../domain/types";
import {
  applyTemplate, clearDay, emptyTask, hasTemplateTasks, rollForward,
} from "../../state/actions";
import { useSnapshot } from "../../sync/StoreProvider";
import { useToast } from "../../components/Toast";
import { TaskRow } from "./TaskRow";
import { TaskSheet } from "./TaskSheet";

/* The day you're looking at: what's planned, what's done, and what to do about
   the rest of it. */

interface Props {
  d: Derived;
  onCursor: (date: string) => void;
  onShowBanks: () => void;
}

export function DayView({ d, onCursor, onShowBanks }: Props) {
  const { snapshot, dispatch } = useSnapshot();
  const flash = useToast();
  const [editing, setEditing] = useState<{ task: Task; isNew: boolean } | null>(null);
  const [replaceWith, setReplaceWith] = useState<TemplateKind | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  /* Any half-answered question belongs to the day it was asked about. */
  function goTo(date: string) {
    setReplaceWith(null);
    setConfirmClear(false);
    onCursor(date);
  }

  function stamp(kind: TemplateKind) {
    dispatch(applyTemplate(snapshot, kind, d.cursor));
    setReplaceWith(null);
    flash(`${TEMPLATE_LABELS[kind]} day inserted.`);
  }

  function moveLeftovers() {
    const { ops, moved } = rollForward(snapshot, d.cursor);
    if (!moved) {
      flash("Nothing outstanding to move.");
      return;
    }
    dispatch(ops);
    flash(`Moved ${moved} to tomorrow.`);
  }

  const p = d.outlook;
  const live = d.tasks.filter((t) => t.status !== "skipped");
  const planned = live.reduce((n, t) => n + t.mins, 0);
  const spent = live.reduce((n, t) => n + t.spent, 0);
  const done = d.tasks.filter((t) => t.status === "done").length;
  const pct = d.tasks.length ? Math.round((done / d.tasks.length) * 100) : 0;
  const logged = d.tasks.filter((t) => t.status === "done" || t.actual > 0).length;

  return (
    <main>
      <div className="dayNav">
        <button className="ghost" onClick={() => goTo(addDays(d.cursor, -1))}>Previous</button>
        <button className="ghost" onClick={() => goTo(d.today)}>Today</button>
        <button className="ghost" onClick={() => goTo(addDays(d.cursor, 1))}>Next</button>
      </div>

      {d.cursor === d.today && p.missed > 0 && p.behind.length > 0 && (
        <button className="driftBanner" onClick={onShowBanks}>
          <span className="driftBannerNum">{p.missed}</span>
          <span className="driftBannerText">
            <b>{`${p.missed === 1 ? "day" : "days"} missed so far`}</b>
            {`${makeUpPhrase(p)} to make up across the ${d.daysLeft} ${d.daysLeft === 1 ? "day" : "days"} left`}
          </span>
          <span className="driftBannerGo">→</span>
        </button>
      )}

      {replaceWith && (
        <div className="confirm">
          <p>
            {`Replace this day's plan with the ${TEMPLATE_LABELS[replaceWith]} template? Anything you added by hand, or moved here from an earlier day, stays.`}
          </p>
          <div className="confirmRow">
            <button className="btn" onClick={() => stamp(replaceWith)}>Yes, replace it</button>
            <button className="btn subtle" onClick={() => setReplaceWith(null)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="tpl">
        {TEMPLATE_KINDS.map((kind) => {
          const list = templateTasks(kind, snapshot.plan);
          return (
            <button
              key={kind}
              className={`tplBtn${d.day?.templateKind === kind ? " on" : ""}`}
              onClick={() => (hasTemplateTasks(d.tasks) ? setReplaceWith(kind) : stamp(kind))}
            >
              <span className="tplTop">
                <span className="tplName">{TEMPLATE_LABELS[kind]}</span>
                <span className="tplMins">{fmtDur(templateMins(list))}</span>
              </span>
              <span className="tplBlurb">{templateBlurb(list)}</span>
            </button>
          );
        })}
      </div>

      {d.tasks.length === 0 ? (
        <div className="blank">
          <p>Nothing planned yet. Insert a template above, or build the day by hand.</p>
          <button
            className="btn subtle"
            onClick={() => setEditing({ task: emptyTask(d.cursor, 0), isNew: true })}
          >
            Add a task
          </button>
        </div>
      ) : (
        <>
          <div className="progressRow">
            <div className="pbar">
              <div className="pfill" style={{ width: `${pct}%` }} />
            </div>
            <span className="pnum">{`${done}/${d.tasks.length}`}</span>
          </div>

          <div className="budget">
            <span>
              <strong>{fmtDur(planned)}</strong> planned
            </span>
            <span className={spent ? "logged" : ""}>{`${fmtDur(spent)} logged`}</span>
          </div>

          {groupByBlock(d.tasks).map((group, i) => (
            <section className="window" key={`${group.block}-${i}`}>
              <div className="wHead">
                <span className="wTime">{fmtTime(group.at)}</span>
                <span className="wLabel">{BLOCKS[group.block] ?? "Anytime"}</span>
                <span className="wMins">{fmtDur(group.items.reduce((n, t) => n + t.mins, 0))}</span>
              </div>
              {group.items.map((task) => (
                <TaskRow key={task.id} task={task} onOpen={(t) => setEditing({ task: t, isNew: false })} />
              ))}
            </section>
          ))}

          <div className="dayActions">
            <button
              className="btn"
              onClick={() => setEditing({ task: emptyTask(d.cursor, d.tasks.length), isNew: true })}
            >
              Add a task
            </button>
            <button className="btn subtle" onClick={moveLeftovers}>Move what's left to tomorrow</button>

            {confirmClear ? (
              <div className="confirm">
                <p>
                  {`Clear all ${d.tasks.length} tasks on ${prettyDate(d.cursor)}? `}
                  {logged
                    ? `${logged} of them ${logged === 1 ? "has" : "have"} work logged against a bank, and that comes off too.`
                    : "Nothing has been logged against a bank yet, so no progress is lost."}
                </p>
                <div className="confirmRow">
                  <button
                    className="btn danger solid"
                    onClick={() => {
                      dispatch(clearDay(snapshot, d.cursor));
                      setConfirmClear(false);
                      flash("Day cleared.");
                    }}
                  >
                    Yes, clear the day
                  </button>
                  <button className="btn subtle" onClick={() => setConfirmClear(false)}>Keep it</button>
                </div>
              </div>
            ) : (
              <button className="btn ghostBtn" onClick={() => setConfirmClear(true)}>Clear the day</button>
            )}
          </div>
        </>
      )}

      {editing && (
        <TaskSheet
          task={editing.task}
          isNew={editing.isNew}
          today={d.today}
          onClose={() => setEditing(null)}
          onFlash={flash}
        />
      )}
    </main>
  );
}
