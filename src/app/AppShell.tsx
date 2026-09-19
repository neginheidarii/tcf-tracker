import { useEffect, useMemo, useRef, useState } from "react";
import { prettyDate } from "../domain/dates";
import { derive } from "../domain/select";
import { BanksView } from "../features/banks/BanksView";
import { DayView } from "../features/day/DayView";
import { Header } from "../features/header/Header";
import { SettingsView } from "../features/settings/SettingsView";
import { setDates } from "../state/actions";
import { useStore } from "../sync/StoreProvider";
import { useResolvedTheme } from "./useTheme";
import { useToday } from "./useToday";

/* Everything a signed-in account sees. Which tab and which day you're looking
   at are view state and stay local; everything else comes from the store. */

type Tab = "today" | "banks" | "settings";

const TABS: [Tab, string][] = [
  ["today", "Today"],
  ["banks", "Banks"],
  ["settings", "Settings"],
];

export function AppShell({ email }: { email: string | undefined }) {
  const { snapshot, status, pending, lastError, dispatch, refresh } = useStore();
  const today = useToday();
  const [tab, setTab] = useState<Tab>("today");
  const [cursor, setCursor] = useState(today);
  const previousToday = useRef(today);

  /* When midnight passes, follow it only if you were looking at today. */
  useEffect(() => {
    if (previousToday.current === today) return;
    setCursor((c) => (c === previousToday.current ? today : c));
    previousToday.current = today;
  }, [today]);

  useResolvedTheme(snapshot?.plan.theme ?? "light");
  const d = useMemo(
    () => (snapshot ? derive(snapshot, today, cursor) : null),
    [snapshot, today, cursor],
  );

  if (!snapshot || !d) {
    return (
      <div className="bootWrap">
        <p>
          {status === "error"
            ? `Could not reach your plan. ${lastError ?? ""}`
            : status === "offline"
              ? "You're offline and this device has no copy yet. Connect once to get started."
              : "Loading your plan…"}
        </p>
      </div>
    );
  }

  return (
    <div className="app">
      <Header d={d} status={status} onCursor={setCursor} />

      {lastError && (
        <div className="syncBar bad" role="alert">
          <span>{lastError}</span>
          <button onClick={() => void refresh()}>Try again</button>
        </div>
      )}
      {!lastError && status === "offline" && pending > 0 && (
        <div className="syncBar" role="status">
          <span>
            {pending === 1
              ? "Offline. One change is waiting, and will sync on its own."
              : `Offline. ${pending} changes are waiting, and will sync on their own.`}
          </span>
        </div>
      )}

      {tab === "today" && !d.inRange ? (
        <main>
          <div className="empty">
            <p>
              {`Your plan runs ${prettyDate(d.plan.startDate)} to ${prettyDate(d.plan.examDate)}, ${d.planLength} days. This date falls ${d.dayIndex < 1 ? "before it starts" : "after the exam"}.`}
            </p>
            <div className="emptyActions">
              <button
                className="btn"
                onClick={() =>
                  dispatch(setDates(d.dayIndex < 1 ? { startDate: cursor } : { examDate: cursor }))
                }
              >
                {d.dayIndex < 1 ? "Start the plan on this date" : "Move the exam to this date"}
              </button>
              <button className="btn subtle" onClick={() => setCursor(today)}>Back to today</button>
            </div>
          </div>
        </main>
      ) : tab === "today" ? (
        <DayView d={d} onCursor={setCursor} onShowBanks={() => setTab("banks")} />
      ) : tab === "banks" ? (
        <BanksView d={d} />
      ) : (
        <SettingsView d={d} email={email} />
      )}

      <nav className="nav">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            className={tab === key ? "navBtn on" : "navBtn"}
            aria-current={tab === key ? "page" : undefined}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}
