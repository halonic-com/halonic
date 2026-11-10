import { createContext, type ReactNode, useContext } from "react";
import type { ToastStore } from "./toast-store.ts";

const ToastStoreContext = createContext<ToastStore | null>(null);

/** The props of `ToastStoreProvider`. */
export interface ToastStoreProviderProps {
  /** The window's store, the one its `ToastRegion` shows. */
  readonly store: ToastStore;
  readonly children: ReactNode;
}

/**
 * Lets a kit part confirm with a toast: the CommandBox's "Copied". The shell puts one at its
 * root, round the same store as its `ToastRegion`.
 *
 * @example
 * <ToastStoreProvider store={toasts}>
 *   <App />
 *   <ToastRegion store={toasts} />
 * </ToastStoreProvider>
 */
export function ToastStoreProvider({ store, children }: ToastStoreProviderProps) {
  return <ToastStoreContext value={store}>{children}</ToastStoreContext>;
}

/** The window's toast store, or `null` where the shell provides none (a test, the states page). */
export function useToastStore(): ToastStore | null {
  return useContext(ToastStoreContext);
}
