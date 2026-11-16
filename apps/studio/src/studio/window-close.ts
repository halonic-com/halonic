import type { WorkspaceSwitcher } from "@halonicjs/studio-feature-workspace";

/** What {@link windowCloseHandler} needs from the window's workspaces. */
export type ClosingWorkspaces = Pick<
  WorkspaceSwitcher,
  "saveAllForWindowClose" | "askStillSaving" | "withdrawStillSaving"
>;

/** What {@link windowCloseHandler} is given. */
export interface WindowCloseOptions {
  readonly workspaces: ClosingWorkspaces;
  /** Stops the Studio's services and takes the window's content off the page. */
  readonly stop: () => Promise<void>;
  /** How long to wait for the saves before asking "Close Acme?" (`still saving`). */
  readonly limitMs: number;
  /** Settles with the task's result or, after `ms`, with `fallback`. */
  readonly within: <T>(task: Promise<T>, ms: number, fallback: T) => Promise<T>;
}

/**
 * What happens when the person closes the desktop window (`workspace.saves-itself`): every open
 * workspace saves first. When a save fails or throws, the window stays open on "Close Acme?" with
 * the reason. When a save is still running after `limitMs`, the window stays open on the same
 * question with "still saving"; the save goes on, and if it ends before the person answers, the
 * window closes by itself. **Close anyway** and **Wait** are the person's answer, after which the
 * window goes only when they close it again.
 *
 * @returns what `onWindowCloseRequested` takes: resolves `true` to close the window, `false` to keep it
 */
export function windowCloseHandler(
  options: WindowCloseOptions,
): (destroy: () => Promise<void>) => Promise<boolean> {
  const { workspaces, stop, limitMs, within } = options;
  const closeWindow = async (destroy: () => Promise<void>) => {
    await within(stop(), limitMs, undefined);
    await destroy();
  };
  return async (destroy) => {
    const saving = workspaces.saveAllForWindowClose();
    const saved = await within<boolean | "still-saving">(saving, limitMs, "still-saving");
    if (saved === false) return false;
    if (saved === "still-saving") {
      const question = workspaces.askStillSaving();
      void saving
        .then(async (ended) => {
          if (ended && question !== undefined && workspaces.withdrawStillSaving(question)) {
            await closeWindow(destroy);
          }
        })
        .catch((error: unknown) => console.error(error));
      return false;
    }
    await within(stop(), limitMs, undefined);
    return true;
  };
}
