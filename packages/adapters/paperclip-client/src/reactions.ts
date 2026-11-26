import {
  isReactionEmoji,
  type MessageReaction,
  type MessageReactions,
  type MessagingId,
  type MessagingRefusal,
  type ReactionEmoji,
  type ReactionsRead,
  type ReactResult,
} from "@halonicjs/ports";
import { asList, asRecord, field, type JsonRecord, text } from "./json.ts";
import { authorOf, type MapContext } from "./map.ts";
import type { PaperclipReader } from "./reader.ts";
import { isSafeSegment } from "./requests.ts";
import { bodyOf, type PaperclipAnswer } from "./transport.ts";

/** What the reactions read from the client they belong to. */
export interface ReactionsContext {
  readonly reader: PaperclipReader;
  readonly company: string;
  /** The client's map context as it is now. */
  readonly context: () => MapContext;
  /** Reads the agents' names when the client knows none yet. */
  readonly knowAgents: () => Promise<void>;
}

/**
 * {@link MessageReactions} for one Paperclip connection
 * (`paperclip-client.reactions`, HAL-19139). Paperclip's comments have no
 * reactions, so the agent-tools plugin keeps them: its board-only
 * `reactions` routes list a task's and toggle the person's own. A server
 * without the plugin answers 404, which reads as `not-supported`, so apps
 * show the chat without reactions. A reaction is never a comment, so it
 * changes nothing the poller reads.
 */
export class PaperclipReactions implements MessageReactions {
  readonly #from: ReactionsContext;

  constructor(from: ReactionsContext) {
    this.#from = from;
  }

  async list(conversation: MessagingId): Promise<ReactionsRead> {
    const { ids } = this.#from.context();
    const [task] = ids.read(conversation, "chat") ?? ids.read(conversation, "channel") ?? [];
    if (task === undefined || !isSafeSegment(task)) {
      return { outcome: "refused", reason: "not-found" };
    }
    const answer = await this.#from.reader.send("listReactions", this.#details(task));
    const refusal = refusalOf(answer, "not-supported");
    if (refusal !== undefined) {
      return { outcome: "refused", reason: refusal };
    }
    const byComment = asRecord(field(asRecord(bodyOf("listReactions", answer)), "reactions"));
    const context = await this.#named();
    const reactions: Record<MessagingId, readonly MessageReaction[]> = {};
    for (const [comment, list] of Object.entries(byComment ?? {})) {
      const read = toReactions(context, list);
      if (read.length > 0) {
        reactions[context.ids.make("comment", task, comment)] = read;
      }
    }
    return { outcome: "read", reactions };
  }

  async react(message: MessagingId, emoji: ReactionEmoji, on: boolean): Promise<ReactResult> {
    const [task, comment] = this.#from.context().ids.read(message, "comment") ?? [];
    if (task === undefined || comment === undefined || !isSafeSegment(task)) {
      return { outcome: "refused", reason: "not-found" };
    }
    const details = { ...this.#details(task), body: { commentId: comment, emoji, on } };
    const answer = await this.#from.reader.send("setReaction", details);
    const refusal = refusalOf(answer, "not-found");
    if (refusal !== undefined) {
      return { outcome: "refused", reason: refusal };
    }
    const reactions = field(asRecord(bodyOf("setReaction", answer)), "reactions");
    return { outcome: "saved", reactions: toReactions(await this.#named(), reactions) };
  }

  /** The map context once the agents' names are known; read only after the plugin answered. */
  async #named(): Promise<MapContext> {
    await this.#from.knowAgents();
    return this.#from.context();
  }

  #details(task: string) {
    return { path: { task }, query: { companyId: this.#from.company } };
  }
}

/**
 * Why a request was refused, for the failures apps handle: offline, signed
 * out, and a 404 as `notFound` says. Any other failure is thrown by `bodyOf`.
 */
function refusalOf(
  answer: PaperclipAnswer,
  notFound: MessagingRefusal,
): MessagingRefusal | undefined {
  if (answer.kind === "ok") {
    return undefined;
  }
  if (answer.failure === "not-found") {
    return notFound;
  }
  return answer.failure === "offline" || answer.failure === "signed-out"
    ? answer.failure
    : undefined;
}

/** The plugin's reactions as the port gives them; an entry it can't read is left out. */
function toReactions(context: MapContext, list: unknown): MessageReaction[] {
  return asList(list).flatMap((entry) => {
    const reaction = asRecord(entry);
    const emoji = field(reaction, "emoji");
    const at = text(reaction, "at");
    const by = toReactor(context, asRecord(field(reaction, "by")));
    return isReactionEmoji(emoji) && at !== undefined && by !== undefined
      ? [{ emoji, by, at }]
      : [];
  });
}

function toReactor(context: MapContext, by: JsonRecord | undefined) {
  const kind = text(by, "kind");
  const id = text(by, "id");
  if (id === undefined) {
    return undefined;
  }
  if (kind === "agent") {
    return authorOf(context, id, undefined);
  }
  return kind === "user" ? authorOf(context, undefined, id) : undefined;
}
