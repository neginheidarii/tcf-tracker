import { n0 } from "../../domain/dates";
import { makeUpPhrase, perDay, type Projection } from "../../domain/projection";
import type { Derived } from "../../domain/select";

/* Drift, in words and then in numbers: what the days you skipped cost, and what
   another few would cost on top. */

const VERDICTS: Record<Projection["verdict"], [string, string]> = {
  clear: ["Cleared", "ok"],
  ok: ["On pace", "ok"],
  slipping: ["Slipping", "warn"],
  off: ["Off track", "warn"],
};

const MISS_STEPS = [1, 3, 7];

function lede(p: Projection, d: Derived): string {
  if (d.daysLeft === 0) {
    return d.toExam < 0
      ? "The exam has passed, so this is the closing record."
      : "Exam day. There are no days left to spread anything over.";
  }
  if (p.elapsed === 0) return "The plan starts today, so there is nothing to catch up on yet.";
  if (!p.behind.length) {
    return `Level with the plan after ${p.elapsed} ${p.elapsed === 1 ? "day" : "days"}. Nothing has been pushed onto the days ahead.`;
  }
  const cause = p.missed === 0
    ? "Logging less than the plan asked for has left"
    : `${p.missed} ${p.missed === 1 ? "day" : "days"} with nothing logged has left`;
  return `${cause} ${makeUpPhrase(p)} to make up, spread over the ${d.daysLeft} ${d.daysLeft === 1 ? "day" : "days"} before the exam.`;
}

export function OutlookCard({ d }: { d: Derived }) {
  const p = d.outlook;
  const [word, tone] = VERDICTS[p.verdict];

  return (
    <div className="drift">
      <div className="driftHead">
        <span className={`driftTag ${tone}`}>{word}</span>
        <span className="driftDays">
          {p.elapsed === 0
            ? "Day one"
            : `${p.studied} of ${p.elapsed} ${p.elapsed === 1 ? "day" : "days"} studied`}
        </span>
      </div>

      <p className="driftLede">{lede(p, d)}</p>

      {p.live.map((s) => (
        <div className="driftRow" key={s.skill}>
          <span className="dot sm" style={{ background: s.color }} />
          <span className="driftName">{s.abbr}</span>
          <span className="driftLeft">{`${n0(s.remaining)} ${s.unit} left`}</span>
          {d.daysLeft === 0 ? (
            <span className="driftPace">unseen</span>
          ) : (
            <span className="driftPace">
              {`${perDay(s.needed)}/day`}
              {s.needed > s.asked * 1.05 && <i>{` up from ${perDay(s.asked)}`}</i>}
            </span>
          )}
        </div>
      ))}

      {!p.live.length ? (
        <p className="driftOk">Every bank is at its target. Nothing left to schedule.</p>
      ) : p.atRisk.length ? (
        <p className="driftRisk">
          {`At your pace over the last fortnight you would reach exam day with ${p.atRisk
            .map((s) => `${n0(s.shortfall)} ${s.unit} of ${s.abbr}`)
            .join(", ")} still unseen.`}
        </p>
      ) : (
        <p className="driftOk">Your pace over the last fortnight clears every bank before exam day.</p>
      )}

      {p.live.length > 0 && d.daysLeft > 1 && (
        <>
          <p className="whatIfNote">What each skill costs a day if you sit out more days:</p>
          <table className="tbl whatIf">
            <thead>
              <tr>
                <th />
                <th>now</th>
                {MISS_STEPS.map((n) => <th key={n}>{`+${n}`}</th>)}
              </tr>
            </thead>
            <tbody>
              {p.live.map((s) => (
                <tr key={s.skill}>
                  <td>{s.abbr}</td>
                  <td>{perDay(s.needed)}</td>
                  {MISS_STEPS.map((n) => {
                    const v = s.ifMissed(n);
                    return <td key={n}>{v == null ? "—" : perDay(v)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
