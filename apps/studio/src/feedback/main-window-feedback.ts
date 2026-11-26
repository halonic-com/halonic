import {
  FeedbackOutbox,
  type FeedbackSender,
  type FeedbackStore,
  feedbackToast,
  type OutboxLock,
  type SendOutgoing,
} from "@halonicjs/studio-feature-feedback";
import type { FeedbackConnected } from "@halonicjs/studio-feature-feedback/api";
import type { AgentConnections } from "@halonicjs/studio-services";
import { destinationOf, holdsKey } from "./folder-feedback-sender.ts";

/** A toast, as the window's toast region shows it. */
type ToastMessage = NonNullable<ReturnType<typeof feedbackToast>>;

/** The folder the main window shows, as the feedback needs it. */
export interface ShownFolder {
  readonly location: string;
  /** Its connections, as Settings › Connections lists them; absent without an agent host. */
  readonly connections: AgentConnections | undefined;
}

/** What {@link MainWindowFeedback} needs of the main window. */
export interface MainWindowFeedbackParts {
  /** The folder shown now; `undefined` on the Welcome screen. */
  readonly shown: () => ShownFolder | undefined;
  /** Calls `listener` when another folder shows; returns a function that stops the calls. */
  readonly subscribeShown: (listener: () => void) => () => void;
  /** Sends one folder's feedback through its Paperclip connection with this ID. */
  readonly senderFor: (location: string, connection: string) => FeedbackSender;
  /** The waiting feedback every window shares, opened on first use. */
  readonly store: () => Promise<FeedbackStore>;
  /** The lock every window's outbox takes (`feedback.outbox-windows`). */
  readonly lock: OutboxLock;
  /** The window's toast region, for "Feedback sent" and "Feedback saved". */
  readonly toasts: { show(message: ToastMessage): unknown };
  /** Opens a task's page in the browser, for "Open task". */
  readonly openTask: (taskUrl: string) => void;
  /** Writes what went wrong, or was dropped, to the log. */
  readonly log: (text: string, error?: unknown) => void;
}

/**
 * Send feedback in Studio's main window (`studio.feedback-send`): each feedback goes through the
 * outbox of the folder shown and the connection that last held its key there, and is kept for that
 * connection alone, so it never goes to another that signs in later. Its outcome shows as a
 * toast in the window. Feedback kept to send later is sent when its folder shows, when the window
 * regains focus and when a connection of the shown folder changes, with "Feedback sent" for each.
 * It says whether Studio is connected to Paperclip: whether a connection of the shown folder holds
 * its key (`feedback.connected-only`).
 */
export class MainWindowFeedback implements FeedbackConnected {
  readonly #parts: MainWindowFeedbackParts;
  readonly #listeners = new Set<() => void>();
  readonly #outboxes = new Map<string, Promise<FeedbackOutbox>>();
  /** Each folder's connection that feedback goes through: the last seen holding its key. */
  readonly #connectionOf = new Map<string, string>();
  #connected = false;
  #stopConnections: (() => void) | undefined;

  constructor(parts: MainWindowFeedbackParts) {
    this.#parts = parts;
  }

  /** Follows the shown folder and the window's focus; gives the stop. */
  start(window: EventTarget): () => void {
    const onFocus = () => this.flush();
    const stopShown = this.#parts.subscribeShown(() => this.#follow());
    window.addEventListener("focus", onFocus);
    this.#follow();
    return () => {
      stopShown();
      window.removeEventListener("focus", onFocus);
      this.#stopConnections?.();
    };
  }

  current(): boolean {
    return this.#connected;
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /** Hands one feedback from the Send feedback dialog to the shown folder's outbox. */
  readonly send: SendOutgoing = async ({ task, png }) => {
    const folder = this.#parts.shown();
    if (folder === undefined) throw new Error("No folder is open to send the feedback from.");
    const connection = this.#connectionOf.get(folder.location);
    if (connection === undefined) throw new Error("Studio isn't connected to Paperclip.");
    const outbox = await this.#outboxFor(folder.location, connection);
    const outcome = await outbox.submit(task, png);
    if (outcome.kind === "refused") return { kind: "refused", reason: outcome.reason };
    this.#toast(feedbackToast(outcome, task.title, this.#parts.openTask));
    return { kind: "taken" };
  };

  /** How many feedbacks wait to be sent on this computer, for Settings › Feedback. */
  async waiting(): Promise<number> {
    return (await (await this.#parts.store()).list()).length;
  }

  /** Sends the shown folder's waiting feedback, saying "Feedback sent" for each. */
  flush(): void {
    const location = this.#parts.shown()?.location;
    const connection = location === undefined ? undefined : this.#connectionOf.get(location);
    if (location === undefined || connection === undefined || !this.#connected) return;
    this.#outboxFor(location, connection)
      .then((outbox) => outbox.flush())
      .then((report) => {
        for (const { feedback, taskId, taskUrl } of report.sent) {
          const sent = { kind: "sent", taskId, taskUrl } as const;
          this.#toast(feedbackToast(sent, feedback.task.title, this.#parts.openTask));
        }
        for (const { feedback } of report.givenUp) {
          this.#parts.log(`Paperclip refused waiting feedback ${feedback.id} three times.`);
        }
      })
      .catch((error: unknown) => this.#parts.log("The waiting feedback wasn't sent:", error));
  }

  /** Watches the connections of the folder shown now, and sends what waits for it. */
  #follow(): void {
    this.#stopConnections?.();
    this.#stopConnections = undefined;
    const folder = this.#parts.shown();
    const connections = folder?.connections;
    if (folder !== undefined && connections !== undefined) {
      this.#stopConnections = connections.subscribe(() => this.#readConnections(folder));
    }
    this.#readConnections(folder);
  }

  #readConnections(folder: ShownFolder | undefined): void {
    const connections = folder?.connections;
    const listed = connections === undefined ? Promise.resolve([]) : connections.list();
    listed
      .then((rows) => {
        const holding = rows.find(holdsKey);
        // Kept while none holds its key, so the feedback kept then waits for that same connection.
        if (folder !== undefined && holding !== undefined) {
          this.#connectionOf.set(folder.location, holding.id);
        }
        this.#setConnected(holding !== undefined);
        this.flush();
      })
      .catch((error: unknown) => {
        this.#setConnected(false);
        this.#parts.log("The Paperclip connections couldn't be read:", error);
      });
  }

  #setConnected(connected: boolean): void {
    if (connected === this.#connected) return;
    this.#connected = connected;
    for (const listener of this.#listeners) listener();
  }

  #outboxFor(location: string, connection: string): Promise<FeedbackOutbox> {
    const destination = destinationOf(location, connection);
    let outbox = this.#outboxes.get(destination);
    if (outbox === undefined) {
      const { senderFor, lock, log } = this.#parts;
      outbox = this.#parts.store().then(
        (store) =>
          new FeedbackOutbox(store, senderFor(location, connection), {
            newId: () => crypto.randomUUID(),
            now: Date.now,
            dropped: (feedback) => log(`Waiting feedback ${feedback.id} was dropped for the cap.`),
            destination,
            lock,
          }),
      );
      this.#outboxes.set(destination, outbox);
      // A store that couldn't open is tried again on the next use, not kept failing.
      outbox.catch(() => this.#outboxes.delete(destination));
    }
    return outbox;
  }

  #toast(message: ToastMessage | undefined): void {
    if (message !== undefined) this.#parts.toasts.show(message);
  }
}
