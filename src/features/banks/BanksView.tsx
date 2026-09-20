import { useState } from "react";
import { BANKS, SKILLS, THRESHOLDS, bankTotal } from "../../domain/banks";
import { n0 } from "../../domain/dates";
import { bankProgress, type Derived } from "../../domain/select";
import type { Skill } from "../../domain/types";
import { setBankedTotal, setTarget } from "../../state/actions";
import { useSnapshot } from "../../sync/StoreProvider";
import { OutlookCard } from "./OutlookCard";

/* Coverage: how much of each bank you've seen, and whether the pace adds up. */

export function BanksView({ d }: { d: Derived }) {
  const { snapshot, dispatch } = useSnapshot();
  const [open, setOpen] = useState<Set<Skill>>(new Set());

  const toggle = (skill: Skill) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(skill)) next.delete(skill);
      else next.add(skill);
      return next;
    });

  return (
    <main>
      <div className="statGrid">
        <div className="stat">
          <div className="statVal">
            {d.streak}
            <span>{d.streak === 1 ? "day" : "days"}</span>
          </div>
          <div className="statLabel">Current streak</div>
        </div>
        <div className="stat">
          <div className="statVal">
            {Math.max(0, Math.min(d.todayIndex, d.planLength))}
            <span>{`of ${d.planLength}`}</span>
          </div>
          <div className="statLabel">Days elapsed</div>
        </div>
      </div>

      <h2 className="h2">Where you stand</h2>
      <p className="lede">
        Days you skip don't disappear — the work moves onto the days that are left. This is that
        arithmetic.
      </p>
      <OutlookCard d={d} />

      <h2 className="h2">Bank coverage</h2>
      <p className="lede">
        Every question and sujet you log counts here. The pace line compares your last two weeks
        against what's left.
      </p>

      {SKILLS.map((skill) => {
        const bank = BANKS[skill];
        const target = d.plan.targets[skill];
        const full = bankTotal(skill);
        const { done, remaining, pct } = bankProgress(skill, d.banked, target);
        const needed = d.daysLeft > 0 ? remaining / d.daysLeft : remaining;
        const pace = d.pace[skill];
        const daysNeeded = pace > 0 ? remaining / pace : Infinity;
        const onTrack = daysNeeded <= d.daysLeft;
        const isOpen = open.has(skill);

        return (
          <div className="bank" key={skill}>
            <div className="bankHead">
              <span className="dot" style={{ background: bank.color }} />
              <span className="bankName">{bank.label}</span>
              <span className="bankCount">
                {n0(done)}
                <i>{` / ${n0(target)}`}</i>
              </span>
            </div>

            <div className="pbar">
              <div className="pfill" style={{ width: `${pct}%`, background: bank.color }} />
            </div>

            <div className={`paceLine ${onTrack ? "ok" : "behind"}`}>
              {remaining === 0
                ? "Bank cleared."
                : pace <= 0
                  ? `${n0(needed)} ${bank.unit} a day to finish by exam day.`
                  : onTrack
                    ? `On pace. ${pace.toFixed(1)}/day now, ${n0(needed)}/day needed.`
                    : `Behind. ${pace.toFixed(1)}/day now, ${n0(needed)}/day needed — ${n0(daysNeeded - d.daysLeft)} days late at this rate.`}
            </div>

            {target < full && (
              <div className="sampleNote">
                {`Aiming at ${n0(target)} of the ${n0(full)} available, ${Math.round((target / full) * 100)}% of the bank.`}
              </div>
            )}

            <button className="bankToggle" onClick={() => toggle(skill)}>
              {isOpen ? "Hide breakdown" : `Breakdown by ${bank.kind === "level" ? "level" : "tâche"}`}
            </button>

            {isOpen && (
              <div className="bankParts">
                {bank.parts.map(([key, cap]) => {
                  const value = d.banked[skill][key] ?? 0;
                  return (
                    <div className="part" key={key}>
                      <span className="partKey">{bank.kind === "level" ? key : `Tâche ${key}`}</span>
                      <div className="partBar">
                        <div style={{ width: `${Math.min(100, (value / cap) * 100)}%`, background: bank.color }} />
                      </div>
                      <input
                        className="partNum"
                        type="number"
                        min={0}
                        max={cap}
                        value={value}
                        aria-label={`${bank.label} ${key} covered`}
                        onChange={(e) =>
                          dispatch(setBankedTotal(snapshot, skill, key, Number(e.target.value)))
                        }
                      />
                      <span className="partCap">{`/ ${n0(cap)}`}</span>
                    </div>
                  );
                })}

                <label className="targetRow">
                  <span>How many are you aiming to cover</span>
                  <input
                    type="number"
                    min={1}
                    max={full}
                    value={target}
                    onChange={(e) => dispatch(setTarget(d.plan, skill, Number(e.target.value)))}
                  />
                </label>
              </div>
            )}
          </div>
        );
      })}

      <h2 className="h2">Your thresholds</h2>
      <p className="lede">
        IRCC converts each skill on its own and never averages them. Your weakest skill is your
        result.
      </p>
      <table className="tbl">
        <thead>
          <tr>
            {["Skill", "Scale", "NCLC 7", "NCLC 8"].map((h) => <th key={h}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {THRESHOLDS.map((row) => (
            <tr key={row[0]}>
              {row.map((cell, i) => <td key={i}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="fine">Confirm the current bands on canada.ca before you file.</p>
    </main>
  );
}
