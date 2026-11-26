import type {
  MessageReaction,
  MessageReactions,
  MessagingAuthor,
  MessagingId,
  ReactionEmoji,
  ReactionsRead,
  ReactResult,
} from "@halonicjs/ports";

/**
 * A source's reactions for a test (`messenger.reactions`), for one chat at a time: `add` puts a
 * reaction on a message, `saved` records what the Messenger asked to change. `keeps: false` is a
 * source with no reactions, `failSaves` one whose saves throw, and `failReads` one whose reads do.
 */
export class FakeReactions implements MessageReactions {
  readonly saved: { message: MessagingId; emoji: ReactionEmoji; on: boolean }[] = [];
  keeps = true;
  failSaves = false;
  failReads = false;
  readonly #byMessage = new Map<MessagingId, MessageReaction[]>();

  /** Puts `by`'s `emoji` on `message`. */
  add(message: MessagingId, emoji: ReactionEmoji, by: MessagingAuthor): void {
    const at = "2026-11-24T09:30:00.000Z";
    this.#byMessage.set(message, [...(this.#byMessage.get(message) ?? []), { emoji, by, at }]);
  }

  async list(): Promise<ReactionsRead> {
    if (this.failReads) throw new Error("The reactions route didn't answer.");
    if (!this.keeps) return { outcome: "refused", reason: "not-supported" };
    return { outcome: "read", reactions: Object.fromEntries(this.#byMessage) };
  }

  async react(message: MessagingId, emoji: ReactionEmoji, on: boolean): Promise<ReactResult> {
    this.saved.push({ message, emoji, on });
    if (this.failSaves) throw new Error("The reaction didn't reach the source.");
    const others = (this.#byMessage.get(message) ?? []).filter(
      (reaction) => !(reaction.emoji === emoji && reaction.by.kind === "me"),
    );
    const now = on
      ? [...others, { emoji, by: { kind: "me" } as const, at: "2026-11-25T12:00Z" }]
      : others;
    this.#byMessage.set(message, now);
    return { outcome: "saved", reactions: now };
  }
}
