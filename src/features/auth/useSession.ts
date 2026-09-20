import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

/* The session is whatever Supabase has in storage, kept in step with sign in,
   sign out and token refresh across tabs. */

export interface SessionState {
  session: Session | null;
  loading: boolean;
}

export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({ session: null, loading: true });

  useEffect(() => {
    if (!supabase) {
      setState({ session: null, loading: false });
      return;
    }

    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setState({ session: data.session, loading: false });
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({ session, loading: false });
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}
