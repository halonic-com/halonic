import type { ToastStore } from "@halonicjs/studio-kit";
import { errorMessageFor } from "@halonicjs/studio-shell";
import type { AgentRef, AgentsHost, TrashedAgent } from "../api.ts";
import { deleteWords } from "./delete-words.ts";

/** The sentence a failure gives the person: a system message never reaches them. */
function reasonOf(error: unknown, title: string): string | undefined {
  const message = errorMessageFor(error, { title });
  const reason = message.body.trim();
  return message.kind === "internal" || reason === "" ? undefined : reason;
}

/** What {@link trashAgent} needs to know of the agent. */
export interface TrashRequest extends AgentRef {
  /** The name the row or the page shows. */
  readonly name: string;
}

/** What {@link trashAgent} can tell its caller or do besides moving the agent. */
export interface TrashOptions {
  /** A page that is open says the move itself, so no toast says it. */
  readonly quiet?: boolean;
  /** Called with the way back and the second line, once the agent is in the trash; also after a Try again. */
  readonly onTrashed?: (trashed: TrashedAgent, line: string | undefined) => void;
  /** Called once the toast's Undo has put the agent back. */
  readonly onRestored?: () => void;
}

/**
 * The second line of the move: how many workflow steps run the agent and now show an error, or
 * `undefined` when none does or the workflows can't be read (the move doesn't wait on that).
 */
async function warningLine(host: AgentsHost, ref: AgentRef): Promise<string | undefined> {
  try {
    const users = await host.referencesTo(ref);
    const steps = users.reduce((sum, user) => sum + user.stepIds.length, 0);
    return steps === 0 ? undefined : deleteWords.movedLine(steps);
  } catch {
    return undefined;
  }
}

/**
 * Closes the toast once the agent is back some other way, such as the workspace's undo (Ctrl Z):
 * its Undo could only fail then. Stops listening when the toast goes by itself.
 */
function closeWhenBack(host: AgentsHost, toasts: ToastStore, ref: AgentRef, toastId: string): void {
  const stopAll = () => {
    stopHost();
    stopToasts();
  };
  const stopHost = host.subscribe(() => {
    host.read(ref).then(
      () => {
        stopAll();
        toasts.close(toastId);
      },
      () => undefined,
    );
  });
  const stopToasts = toasts.subscribe(() => {
    if (!toasts.list().some((toast) => toast.id === toastId)) stopAll();
  });
}

/**
 * Brings an agent back, or says why it couldn't. Success says nothing: the restored row or page is
 * the feedback. Resolves to whether it came back.
 */
export async function putBackAgent(
  trashed: TrashedAgent,
  name: string,
  toasts: ToastStore | null,
): Promise<boolean> {
  try {
    await trashed.undo();
    return true;
  } catch (error) {
    const title = deleteWords.couldntUndo(name);
    const reason = reasonOf(error, title);
    toasts?.show({ tone: "danger", title, ...(reason === undefined ? {} : { text: reason }) });
    return false;
  }
}

/**
 * Moves an agent to the trash with no dialog. A row's delete says so with a toast that has Undo and,
 * when workflows run the agent, a second line about them; a page that is open says it itself and
 * passes `quiet`. When it can't be moved, a toast that stays says why and offers Try again.
 *
 * @returns whether the agent is in the trash
 */
export async function trashAgent(
  host: AgentsHost,
  toasts: ToastStore | null,
  request: TrashRequest,
  options: TrashOptions = {},
): Promise<boolean> {
  const { name, hubId, id } = request;
  try {
    const line = await warningLine(host, { hubId, id });
    const trashed = await host.trash({ hubId, id });
    options.onTrashed?.(trashed, line);
    if (options.quiet !== true && toasts !== null) {
      const toastId = toasts.show({
        tone: "success",
        title: deleteWords.moved(name, line !== undefined),
        ...(line === undefined ? {} : { text: line }),
        action: {
          label: deleteWords.undo,
          onClick: () =>
            void putBackAgent(trashed, name, toasts).then((restored) => {
              if (restored) options.onRestored?.();
            }),
        },
      });
      closeWhenBack(host, toasts, { hubId, id }, toastId);
    }
    return true;
  } catch (error) {
    toasts?.show({
      tone: "danger",
      title: deleteWords.couldntMove(name, reasonOf(error, name)),
      sticky: true,
      action: {
        label: deleteWords.tryAgain,
        onClick: () => void trashAgent(host, toasts, request, options),
      },
    });
    return false;
  }
}
