import type { ToastStore } from "@halonicjs/studio-kit";

/** What {@link showEngineLockLost} needs from the window. */
export interface EngineLockLostOptions {
  /** The window's toasts, `shell.toasts`. */
  readonly toasts: ToastStore;
  /** The workspace's name, as the window shows it, such as "Acme". */
  readonly name: string;
  /** Opens the Runs list, for **Open Runs**. */
  readonly openRuns: () => void;
}

/**
 * Shows an info toast when another Halonic process took the workspace's engine lock over, so this
 * window stopped running its runs (HAL-13758, in the pattern of microcopy 22 F15b). The run pages
 * stay as they are: they read the records, which the other process keeps writing.
 *
 * @example
 * showEngineLockLost({ toasts: shell.toasts, name: "Acme", openRuns });
 */
export function showEngineLockLost({ toasts, name, openRuns }: EngineLockLostOptions): void {
  toasts.show({
    tone: "info",
    title: `Another Halonic on this computer took over ${name}'s runs.`,
    text: "This window stopped running them.",
    action: { label: "Open Runs", onClick: openRuns },
  });
}
