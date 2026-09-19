import { addDays, prettyDate } from "../../domain/dates";
import { cellState, type Derived } from "../../domain/select";
import type { SyncStatus } from "../../sync/store";

/* The plan at a glance: which day you're on, how long is left, and a cell per
   day of the plan. */

const STATUS_TEXT: Record<SyncStatus, string> = {
  loading: "Loading",
  synced: "Synced",
  saving: "Saving",
  offline: "Offline",
  error: "Not saved",
};

export function Header({
  d, status, onCursor,
}: {
  d: Derived;
  status: SyncStatus;
  onCursor: (date: string) => void;
}) {
  const cells = [];
  for (let i = 0; i < d.planLength; i++) {
    const n = i + 1;
    const date = addDays(d.plan.startDate, i);
    const state = cellState(d.byDate.get(date), n, d.todayIndex);
    const classes = [
      "cell",
      n === d.dayIndex ? "cur" : "",
      n === d.todayIndex ? "today" : "",
      state === "future" ? "" : state,
    ].filter(Boolean).join(" ");
    cells.push(
      <button
        key={date}
        className={classes}
        aria-label={`Day ${n}`}
        aria-current={n === d.dayIndex ? "date" : undefined}
        title={`Day ${n}`}
        onClick={() => onCursor(date)}
      />,
    );
  }

  return (
    <header className="hero">
      <div className="heroTop">
        <div>
          <div className="dayNum">
            {`Day ${d.inRange ? d.dayIndex : "—"}`}
            <span className="ofTotal">{`of ${d.planLength}`}</span>
          </div>
          <div className="heroDate">{prettyDate(d.cursor)}</div>
        </div>
        <div className="countdown">
          <div className={d.toExam <= 0 ? "cdNum word" : "cdNum"}>
            {d.toExam < 0 ? "Past" : d.toExam === 0 ? "Today" : String(d.toExam)}
          </div>
          <div className="cdLabel">
            {d.toExam < 0
              ? "the exam has been and gone"
              : d.toExam === 0
                ? "is the exam"
                : d.toExam === 1
                  ? "day to the exam"
                  : "days to the exam"}
          </div>
        </div>
      </div>

      <div
        className="strip"
        style={{
          "--cols": Math.min(d.planLength, 25),
          "--colsM": Math.min(d.planLength, 15),
        } as React.CSSProperties}
      >
        {cells}
      </div>

      <div className="stripKey">
        <span className={`sync ${status}`}>{STATUS_TEXT[status]}</span>
      </div>
    </header>
  );
}
