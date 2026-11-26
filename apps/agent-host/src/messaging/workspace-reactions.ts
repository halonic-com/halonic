import type { PaperclipMessaging } from "@halonicjs/adapter-paperclip-client";
import { paperclipSourceId } from "@halonicjs/adapter-paperclip-client";
import type {
  MessageReactions,
  MessagingId,
  ReactionEmoji,
  ReactionsRead,
  ReactResult,
} from "@halonicjs/ports";

/** A connected connection's provider by the connection's name, as the workspace holds them. */
export type ProvidersByName = () => ReadonlyMap<string, Pick<PaperclipMessaging, "reactions">>;

const notSupported = { outcome: "refused", reason: "not-supported" } as const;

/**
 * A workspace's message reactions (`agent-host.message-reactions-routes`,
 * HAL-19139): each conversation's or message's own connection answers, found
 * by the source ID its IDs start with. With no such connection, or while the
 * workspace's engine is a server that keeps none, the answer is
 * `not-supported`, so Studio shows the chat without reactions.
 */
export class WorkspaceReactions implements MessageReactions {
  readonly #providers: ProvidersByName;

  /** `providers` gives the connected providers now, or none while the engine is a server. */
  constructor(providers: ProvidersByName) {
    this.#providers = providers;
  }

  async list(conversation: MessagingId): Promise<ReactionsRead> {
    return (await this.#of(conversation)?.list(conversation)) ?? notSupported;
  }

  async react(message: MessagingId, emoji: ReactionEmoji, on: boolean): Promise<ReactResult> {
    return (await this.#of(message)?.react(message, emoji, on)) ?? notSupported;
  }

  #of(id: MessagingId): MessageReactions | undefined {
    for (const [name, provider] of this.#providers()) {
      if (id.startsWith(`${paperclipSourceId(name)}:`)) {
        return provider.reactions();
      }
    }
    return undefined;
  }
}
