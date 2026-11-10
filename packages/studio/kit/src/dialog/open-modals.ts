import { useSyncExternalStore } from "react";

/**
 * How many of the kit's modal dialogs are open. While one is, everything outside it is inert, so
 * the ToastRegion holds its cards back until the last one closes (component specs 9).
 */
let openModals = 0;
const listeners = new Set<() => void>();

/** Counts one more open modal. Call the returned function once, when it closes. */
export function modalOpened(): () => void {
  openModals += 1;
  notify();
  let closed = false;
  return () => {
    if (!closed) {
      closed = true;
      openModals -= 1;
      notify();
    }
  };
}

/** Whether one of the kit's modal dialogs is open now. */
export function useModalOpen(): boolean {
  return useSyncExternalStore(subscribe, isModalOpen, isModalOpen);
}

function isModalOpen(): boolean {
  return openModals > 0;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}
