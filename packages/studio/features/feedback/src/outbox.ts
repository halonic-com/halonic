import type { FeedbackTask } from "./payload.ts";

/** How many feedbacks wait at most; screenshots are large, so the queue stays small. */
export const maxWaiting = 50;

/** How many bytes of screenshots wait at most, 100 MB. */
export const maxWaitingBytes = 100 * 1000 * 1000;

/** How many times Paperclip may refuse a waiting feedback before it is given up. */
export const maxRefusals = 3;

/**
 * A feedback waiting to be sent. Its screenshot isn't in here: the store keeps it with the
 * feedback, by `id`, and loads it only to send it, so listing what waits stays small.
 */
export interface WaitingFeedback {
  /** Also the idempotency key Paperclip gets, so every try makes the same one task. */
  readonly id: string;
  readonly task: FeedbackTask;
  /** When it was kept, in milliseconds since 1970; the oldest is sent, and dropped, first. */
  readonly keptAt: number;
  /** Its screenshot's size in bytes, 0 without one, so the cap needs no screenshot loaded. */
  readonly imageBytes: number;
  /** How many times Paperclip refused it so far, and why it last did. */
  readonly refusals: number;
  readonly lastRefusal: string | null;
}

/**
 * Where waiting feedback is kept, so it survives a restart of Studio: one entry per feedback,
 * by its `id`, holding the feedback and its screenshot together.
 */
export interface FeedbackStore {
  /** Every waiting feedback, in any order, without loading a screenshot. */
  list(): Promise<readonly WaitingFeedback[]>;
  /** Keeps `feedback` with its screenshot, both or neither. */
  add(feedback: WaitingFeedback, image: Uint8Array | null): Promise<void>;
  /** Saves `feedback`'s new refusal count; its screenshot stays as it is. */
  update(feedback: WaitingFeedback): Promise<void>;
  /** Feedback `id`'s screenshot, or `null` when there is none. */
  loadImage(id: string): Promise<Uint8Array | null>;
  /** Forgets feedback `id` and its screenshot, both or neither; nothing happens when it is gone. */
  remove(id: string): Promise<void>;
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
  | { readonly kind: "refused"; readonly reason: string };

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

/** What the outbox needs besides its store and sender. */
export interface OutboxParts {
  /** Names a new feedback; Studio gives a random UUID. */
  readonly newId: () => string;
  /** The clock, in milliseconds since 1970. */
  readonly now: () => number;
  /** Says that a waiting feedback was dropped to keep the cap; Studio logs it. */
  readonly dropped: (feedback: WaitingFeedback) => void;
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
  private readonly parts: OutboxParts;
  private flushing: Promise<FlushReport> | undefined;

  /** Uses `store` for waiting feedback and `sender` to create tasks. */
  constructor(store: FeedbackStore, sender: FeedbackSender, parts: OutboxParts) {
    this.store = store;
    this.sender = sender;
    this.parts = parts;
  }

  /**
   * Sends one feedback now, or saves it when there is no connection. A refusal saves nothing.
   * It doesn't wait for older waiting feedback, so its task can come before theirs.
   */
  async submit(task: FeedbackTask, image: Uint8Array | null): Promise<SubmitOutcome> {
    const id = this.parts.newId();
    const outcome = await this.sender.send(id, task, image);
    if (outcome.kind === "sent" || outcome.kind === "refused") {
      return outcome;
    }
    // The reply may only have been lost: the waiting feedback keeps the same `id`, so its
    // retry gets the task Paperclip may already have made.
    const feedback: WaitingFeedback = {
      id,
      task,
      keptAt: this.parts.now(),
      imageBytes: image?.byteLength ?? 0,
      refusals: 0,
      lastRefusal: null,
    };
    await this.makeRoomFor(feedback);
    await this.store.add(feedback, image);
    return { kind: "saved", until: outcome.kind === "offline" ? "online" : "connected" };
  }

  /** How many feedbacks wait to be sent (Settings → Feedback). */
  async waiting(): Promise<number> {
    return (await this.store.list()).length;
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
    for (const feedback of await this.oldestFirst()) {
      const image = feedback.imageBytes === 0 ? null : await this.store.loadImage(feedback.id);
      const outcome = await this.sender.send(feedback.id, feedback.task, image);
      if (outcome.kind === "offline" || outcome.kind === "not-connected") {
        break;
      }
      if (outcome.kind === "sent") {
        await this.store.remove(feedback.id);
        sent.push({ feedback, taskId: outcome.taskId, taskUrl: outcome.taskUrl });
        continue;
      }
      if (feedback.refusals + 1 >= maxRefusals) {
        await this.store.remove(feedback.id);
        givenUp.push({ feedback, reason: outcome.reason });
        continue;
      }
      await this.store.update({
        ...feedback,
        refusals: feedback.refusals + 1,
        lastRefusal: outcome.reason,
      });
    }
    return { sent, givenUp, waiting: await this.waiting() };
  }

  /**
   * Drops the oldest waiting feedback until `feedback` fits under {@link maxWaiting} and
   * {@link maxWaitingBytes}, and says which it dropped: newer feedback is likelier to still matter.
   */
  private async makeRoomFor(feedback: WaitingFeedback): Promise<void> {
    const waiting = await this.oldestFirst();
    let count = waiting.length + 1;
    let bytes = waiting.reduce((sum, each) => sum + each.imageBytes, feedback.imageBytes);
    for (const oldest of waiting) {
      if (count <= maxWaiting && bytes <= maxWaitingBytes) return;
      await this.store.remove(oldest.id);
      this.parts.dropped(oldest);
      count -= 1;
      bytes -= oldest.imageBytes;
    }
  }

  private async oldestFirst(): Promise<readonly WaitingFeedback[]> {
    return [...(await this.store.list())].sort((first, second) => first.keptAt - second.keptAt);
  }
}
