import { AppShell } from "./app/AppShell";
import { ToastProvider } from "./components/Toast";
import { AuthScreen } from "./features/auth/AuthScreen";
import { useSession } from "./features/auth/useSession";
import { isConfigured } from "./lib/supabase";
import { StoreProvider } from "./sync/StoreProvider";

export default function App() {
  const { session, loading } = useSession();

  if (!isConfigured) {
    return (
      <div className="bootWrap">
        <p>
          This build hasn't been pointed at a Supabase project yet. Copy{" "}
          <code>.env.example</code> to <code>.env.local</code>, fill in the project URL and
          publishable key, then restart the dev server.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bootWrap">
        <p>Checking your session…</p>
      </div>
    );
  }

  if (!session) return <AuthScreen />;

  return (
    <StoreProvider userId={session.user.id}>
      <ToastProvider>
        <AppShell email={session.user.email} />
      </ToastProvider>
    </StoreProvider>
  );
}
