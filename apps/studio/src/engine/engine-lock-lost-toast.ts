import type { EngineLockLostKind } from "@halonicjs/adapter-fs-tauri";
import type { ToastStore } from "@halonicjs/studio-kit";

/** What {@link showEngineLockLost} needs from the window. */
export interface EngineLockLostOptions {
  /** The window's toasts, `shell.toasts`. */
  readonly toasts: ToastStore;
  /** The workspace's name, as the window shows it, such as "Acme". */
  readonly name: string;
  /** Which kind of loss the shell reported: another process took the lock over, or `io`. */
  readonly kind: EngineLockLostKind;
  /** Opens the Runs list, for **Open Runs**. */
  readonly openRuns: () => void;
}

/**
 * Shows an info toast when the window lost the workspace's engine lock, so it stopped running its
 * runs (HAL-13758, in the pattern of microcopy 22 F15b). Another Halonic process took it over, or
 * the shell couldn't take its own lock back and nobody took it (`io`, C754 row 11), so opening the
 * workspace again runs them here. The run pages stay as they are: they read the records.
 *
 * @example
 * showEngineLockLost({ toasts: shell.toasts, name: "Acme", kind: "taken-over", openRuns });
 */
export function showEngineLockLost({ toasts, name, kind, openRuns }: EngineLockLostOptions): void {
  const words =
    kind === "io"
      ? {
          title: `Halonic lost its hold on ${name}'s runs.`,
          text: `This window stopped running them. Open ${name} again to run them here.`,
        }
      : {
          title: `Another Halonic on this computer took over ${name}'s runs.`,
          text: "This window stopped running them.",
        };
  toasts.show({ tone: "info", ...words, action: { label: "Open Runs", onClick: openRuns } });
}
