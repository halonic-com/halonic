import type { WorkspaceSwitcher } from "@halonicjs/studio-feature-workspace";
import { settlePendingSaves } from "@halonicjs/studio-kit";

/**
 * How long a closing window waits for the open workspaces to save before it asks, so a
 * hung save can't keep it open for ever. A save that misses it doesn't close the window: it asks
 * "Close Acme?" with "still saving" and waits for the answer (HAL-8048).
 */
export const closeLimitMs = 5000;

/** Settles with `task`'s result or, after `ms`, with `fallback`, whichever comes first. */
export async function withinLimit<T>(task: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  try {
    return await Promise.race([task, limit]);
  } finally {
    clearTimeout(timer);
  }
}

/** What {@link windowCloseHandler} needs from the window's workspaces. */
export type ClosingWorkspaces = Pick<
  WorkspaceSwitcher,
  "saveAllForWindowClose" | "askStillSaving" | "withdrawStillSaving"
>;

/**
 * Hands in what the person has typed but not yet left: the field with the cursor in it saves on
 * blur, so blurring it starts that save. Then waits for every save a field has registered with
 * `settleOnClose` (the kit), so the workspaces are asked to finish theirs only once the blur
 * saves have staged their changes.
 */
export async function leaveFocusedField(
  page: Pick<Document, "activeElement">,
  settle: () => Promise<void> = settlePendingSaves,
): Promise<void> {
  const field = page.activeElement;
  if (field instanceof HTMLElement) field.blur();
  await settle();
}

/** What {@link windowCloseHandler} is given. */
export interface WindowCloseOptions {
  readonly workspaces: ClosingWorkspaces;
  /** Stops the Studio's services and takes the window's content off the page. */
  readonly stop: () => Promise<void>;
  /** How long to wait for the saves before asking "Close Acme?" (`still saving`). */
  readonly limitMs: number;
  /** Settles with the task's result or, after `ms`, with `fallback`. */
  readonly within: <T>(task: Promise<T>, ms: number, fallback: T) => Promise<T>;
  /** Runs before the workspaces save, to hand in drafts a page keeps until a field is left. */
  readonly settleDrafts?: () => Promise<void>;
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
  const { workspaces, stop, limitMs, within, settleDrafts } = options;
  const closeWindow = async (destroy: () => Promise<void>) => {
    await within(stop(), limitMs, undefined);
    await destroy();
  };
  return async (destroy) => {
    if (settleDrafts !== undefined) {
      // A draft save that hangs falls through to the saves below and the "still saving" question.
      await within(settleDrafts(), limitMs, undefined).catch((error: unknown) =>
        console.error(error),
      );
    }
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
