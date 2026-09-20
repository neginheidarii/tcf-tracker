import { useEffect, useState } from "react";
import { today as isoToday } from "../domain/dates";

/* The app sits open overnight, so today has to move on its own rather than
   being read once at load. */

export function useToday(): string {
  const [today, setToday] = useState(isoToday);

  useEffect(() => {
    const check = () => {
      const now = isoToday();
      setToday((current) => (current === now ? current : now));
    };
    const timer = setInterval(check, 30_000);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, []);

  return today;
}
