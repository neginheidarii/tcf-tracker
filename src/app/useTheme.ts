import { useEffect, useState } from "react";
import type { ThemeChoice } from "../domain/types";

/* "Match device" is settled here rather than in CSS, so the dark palette only
   has to be written once. */

const query = () => window.matchMedia("(prefers-color-scheme: dark)");

const BAR_COLOUR: Record<"light" | "dark", string> = { light: "#FDF9FB", dark: "#0D1117" };

export function useResolvedTheme(choice: ThemeChoice): "light" | "dark" {
  const [deviceDark, setDeviceDark] = useState(() => query().matches);

  useEffect(() => {
    const mq = query();
    const onChange = (e: MediaQueryListEvent) => setDeviceDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const resolved = choice === "auto" ? (deviceDark ? "dark" : "light") : choice;

  /* The palette is applied to the document rather than to a wrapper, so
     anything rendered outside the app's own tree — a toast, a dialog — is
     themed too. */
  useEffect(() => {
    applyTheme(resolved);
  }, [resolved]);

  return resolved;
}

export function applyTheme(resolved: "light" | "dark"): void {
  const root = document.documentElement;
  root.classList.toggle("theme-dark", resolved === "dark");
  root.classList.toggle("theme-light", resolved === "light");
  root.style.colorScheme = resolved;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", BAR_COLOUR[resolved]);
}

/** Runs before the first paint, so the sign-in screen matches the device and
 *  nothing flashes white on a dark phone. */
export const applyDevicePreference = (): void =>
  applyTheme(query().matches ? "dark" : "light");
