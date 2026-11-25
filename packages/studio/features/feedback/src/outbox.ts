import type { FeedbackTask } from "./payload.ts";

/** How many feedbacks wait at most; screenshots are large, so the queue stays small. */
export const maxWaiting = 50;

/** How many times Paperclip may refuse a waiting feedback before it is given up. */
export const maxRefusals = 3;

/**
 * A feedback waiting to be sent. Its screenshot isn't in here: the store keeps
 * it apart, by `id`, so the list it loads and saves on every change stays small.
 */
export interface WaitingFeedback {
  /** Also the idempotency key Paperclip gets, so every try makes the same one task. */
  readonly id: string;
  readonly task: FeedbackTask;
  /** How many times Paperclip refused it so far, and why it last did. */
  readonly refusals: number;
  readonly lastRefusal: string | null;
}

/** Where waiting feedback is kept, so it survives a restart of Studio. */
export interface FeedbackStore {
  load(): Promise<readonly WaitingFeedback[]>;
  save(waiting: readonly WaitingFeedback[]): Promise<void>;
  /** Keeps feedback `id`'s screenshot, as its own file. */
  saveImage(id: string, image: Uint8Array): Promise<void>;
  /** Feedback `id`'s screenshot, or `null` when there is none. */
  loadImage(id: string): Promise<Uint8Array | null>;
  /** Forgets feedback `id`'s screenshot; nothing happens when there is none. */
  deleteImage(id: string): Promise<void>;
}

/** What creating one task in Paperclip came to. */
export type SendOutcome =
  | { readonly kind: "sent"; readonly taskId: string; readonly taskUrl: string }
  | { readonly kind: "offline" }
  | { readonly kind: "not-connected" }
  | { readonly kind: "refused"; readonly reason: string };

/** Creates one feedback task, with its screenshot, through Studio's Paperclip connection. */
export interface FeedbackSender {
  /**
   * Sends feedback `id`. Sending the same `id` again gives the task already
   * made, so a retry after a lost reply makes no second task.
   */
  send(id: string, task: FeedbackTask, image: Uint8Array | null): Promise<SendOutcome>;
}

/** What pressing Send came to: sent, saved to send later, or refused. */
export type SubmitOutcome =
  | { readonly kind: "sent"; readonly taskId: string; readonly taskUrl: string }
  | { readonly kind: "saved"; readonly until: "online" | "connected" }
  | { readonly kind: "refused"; readonly reason: string }
  | { readonly kind: "full" };

/** What one pass over the waiting feedback did. */
export interface FlushReport {
  readonly sent: readonly {
    readonly feedback: WaitingFeedback;
    readonly taskId: string;
    readonly taskUrl: string;
  }[];
  readonly givenUp: readonly { readonly feedback: WaitingFeedback; readonly reason: string }[];
  readonly waiting: number;
}

/**
 * Sends feedback now when Studio can, and keeps it to send later when
 * Studio is offline or not yet connected to Paperclip. The caller runs
 * {@link FeedbackOutbox.flush} when the connection comes back; the outbox
 * keeps no timer of its own.
 */
export class FeedbackOutbox {
  private readonly store: FeedbackStore;
  private readonly sender: FeedbackSender;
  private readonly newId: () => string;
  private queueChange: Promise<unknown> = Promise.resolve();
  private flushing: Promise<FlushReport> | undefined;

  /** Uses `store` for waiting feedback, `sender` to create tasks and `newId` to name waiting feedback. */
  constructor(store: FeedbackStore, sender: FeedbackSender, newId: () => string) {
    this.store = store;
    this.sender = sender;
    this.newId = newId;
  }

  /**
   * Sends one feedback now, or saves it when there is no connection. A refusal saves nothing.
   * It doesn't wait for older waiting feedback, so its task can come before theirs.
   */
  async submit(task: FeedbackTask, image: Uint8Array | null): Promise<SubmitOutcome> {
    const id = this.newId();
    const outcome = await this.sender.send(id, task, image);
    if (outcome.kind === "sent" || outcome.kind === "refused") {
      return outcome;
    }
    // The reply may only have been lost: the waiting feedback keeps the same `id`, so its
    // retry gets the task Paperclip may already have made.
    if (image !== null) {
      await this.store.saveImage(id, image);
    }
    const feedback = { id, task, refusals: 0, lastRefusal: null };
    const added = await this.change((waiting) =>
      waiting.length >= maxWaiting ? undefined : [...waiting, feedback],
    );
    if (!added) {
      await this.store.deleteImage(id);
      return { kind: "full" };
    }
    return { kind: "saved", until: outcome.kind === "offline" ? "online" : "connected" };
  }

  /** How many feedbacks wait to be sent (Settings → Feedback). */
  async waiting(): Promise<number> {
    return (await this.store.load()).length;
  }

  /**
   * Sends the waiting feedback, oldest first, and stops at the first one
   * that finds no connection. A call while a pass is running joins that pass.
   */
  flush(): Promise<FlushReport> {
    if (this.flushing === undefined) {
      this.flushing = this.flushOnce().finally(() => {
        this.flushing = undefined;
      });
    }
    return this.flushing;
  }

  private async flushOnce(): Promise<FlushReport> {
    const sent: FlushReport["sent"][number][] = [];
    const givenUp: FlushReport["givenUp"][number][] = [];
    for (const feedback of await this.store.load()) {
      const image =
        feedback.task.screenshot === null ? null : await this.store.loadImage(feedback.id);
      const outcome = await this.sender.send(feedback.id, feedback.task, image);
      if (outcome.kind === "offline" || outcome.kind === "not-connected") {
        break;
      }
      if (outcome.kind === "sent") {
        await this.forget(feedback.id);
        sent.push({ feedback, taskId: outcome.taskId, taskUrl: outcome.taskUrl });
        continue;
      }
      if (feedback.refusals + 1 >= maxRefusals) {
        await this.forget(feedback.id);
        givenUp.push({ feedback, reason: outcome.reason });
        continue;
      }
      const refused = { ...feedback, refusals: feedback.refusals + 1, lastRefusal: outcome.reason };
      await this.change((waiting) =>
        waiting.map((each) => (each.id === feedback.id ? refused : each)),
      );
    }
    return { sent, givenUp, waiting: await this.waiting() };
  }

  /**
   * Takes feedback `id` off the waiting list, then deletes its screenshot: a stop in between
   * leaves a stray file, never a waiting feedback without its screenshot.
   */
  private async forget(id: string): Promise<void> {
    await this.change((waiting) => waiting.filter((each) => each.id !== id));
    await this.store.deleteImage(id);
  }

  /**
   * Changes the waiting list one change at a time, so a feedback saved while
   * a pass is sending is never lost to the pass's own save. `edit` returns
   * `undefined` to leave the list as it is.
   */
  private change(
    edit: (waiting: readonly WaitingFeedback[]) => readonly WaitingFeedback[] | undefined,
  ): Promise<boolean> {
    const next = this.queueChange.then(async () => {
      const changed = edit(await this.store.load());
      if (changed === undefined) {
        return false;
      }
      await this.store.save(changed);
      return true;
    });
    // The caller gets the failure through `next`; the chain only has to go on.
    this.queueChange = next.catch(() => undefined);
    return next;
  }
}
