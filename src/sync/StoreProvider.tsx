import {
  createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode,
} from "react";
import { requireDb } from "../lib/supabase";
import type { Op } from "../state/ops";
import { SyncStore, type StoreState } from "./store";

/* Binds the sync store to React. One store per signed-in account. */

const StoreContext = createContext<SyncStore | null>(null);

export function StoreProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const store = useMemo(() => new SyncStore(requireDb(), userId), [userId]);

  useEffect(() => {
    void store.start();
    return () => store.stop();
  }, [store]);

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export interface StoreApi extends StoreState {
  dispatch: (ops: Op[]) => void;
  refresh: () => Promise<void>;
}

export function useStore(): StoreApi {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore was called outside a StoreProvider");
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return { ...state, dispatch: store.dispatch, refresh: store.refresh };
}

/** For screens that only run once a snapshot exists. */
export function useSnapshot() {
  const api = useStore();
  if (!api.snapshot) throw new Error("useSnapshot was called before the snapshot loaded");
  return { ...api, snapshot: api.snapshot };
}
