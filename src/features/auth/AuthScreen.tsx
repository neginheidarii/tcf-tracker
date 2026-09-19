import { useState, type FormEvent } from "react";
import { supabase } from "../../lib/supabase";

/* Sign in, create an account, or ask for a reset link. Kept to one screen: the
   whole point is to get to the day's work. */

type Mode = "signin" | "signup" | "reset";

const COPY: Record<Mode, { title: string; blurb: string; action: string }> = {
  signin: {
    title: "Sign in",
    blurb: "Your plan, banks and history follow you to any device you sign in on.",
    action: "Sign in",
  },
  signup: {
    title: "Create an account",
    blurb: "One account keeps your phone and your laptop looking at the same record.",
    action: "Create account",
  },
  reset: {
    title: "Reset your password",
    blurb: "We'll email you a link to set a new one.",
    action: "Send the link",
  },
};

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const copy = COPY[mode];

  function go(next: Mode) {
    setMode(next);
    setError(null);
    setNotice(null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supabase || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      if (mode === "signup") {
        const { data, error: err } = await supabase.auth.signUp({ email, password });
        if (err) throw err;
        /* With email confirmation switched on there is no session yet. */
        if (!data.session) setNotice("Check your email for a link to confirm the account, then sign in.");
      } else if (mode === "signin") {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
      } else {
        const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        });
        if (err) throw err;
        setNotice("If that address has an account, a reset link is on its way.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="authWrap">
      <div className="authCard">
        <h1 className="authTitle">TCF Canada Tracker</h1>
        <h2 className="authHead">{copy.title}</h2>
        <p className="authBlurb">{copy.blurb}</p>

        <form onSubmit={submit} noValidate>
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              value={email}
              autoComplete="email"
              autoCapitalize="none"
              required
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          {mode !== "reset" && (
            <label className="field">
              <span>Password</span>
              <input
                type="password"
                value={password}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                minLength={8}
                required
                onChange={(e) => setPassword(e.target.value)}
              />
              {mode === "signup" && <small className="authHint">At least eight characters.</small>}
            </label>
          )}

          {error && <p className="authError" role="alert">{error}</p>}
          {notice && <p className="authNotice" role="status">{notice}</p>}

          <button className="btn" type="submit" disabled={busy}>
            {busy ? "One moment…" : copy.action}
          </button>
        </form>

        <div className="authSwitch">
          {mode === "signin" && (
            <>
              <button type="button" onClick={() => go("signup")}>Create an account instead</button>
              <button type="button" onClick={() => go("reset")}>I've forgotten my password</button>
            </>
          )}
          {mode === "signup" && (
            <button type="button" onClick={() => go("signin")}>I already have an account</button>
          )}
          {mode === "reset" && (
            <button type="button" onClick={() => go("signin")}>Back to signing in</button>
          )}
        </div>
      </div>
    </main>
  );
}
