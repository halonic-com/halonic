// The tools of each chat in the folder's Assistant, made once per chat so they remember what the
// model read, and each chat's fix attempts on the local integration it is about
// (`assistant.build.fix-attempts`), kept with the chat in the profile, never in the workspace.

import type { ChatTool, RequestLogLine, ReviewStep } from "@halonicjs/app";
import { buildChatTools, FixAttempts, type ShowOutcome } from "@halonicjs/assistant";
import type { AssistantAnswerRequest } from "@halonicjs/studio-feature-assistant/api";
import type { ItemRef } from "@halonicjs/studio-shell";
import { loadWorkspace } from "@halonicjs/workspace";
import { docsOptionsOf, KeptDocsSites, withCallIds } from "./chat-docs.ts";
import { localIntegrationIn, type RequestLogs, requestLogReading } from "./chat-request-log.ts";
import type { KeptChats } from "./kept-chats.ts";
import type { WorkspaceAssistantParts } from "./workspace-assistant-parts.ts";

/** How an answering chat's `show` tool shows an item: the window of the answer's panel. */
export type ChatShow = NonNullable<AssistantAnswerRequest["show"]>;

/** What {@link ChatToolSets} works with, from its `WorkspaceAssistant`. */
export interface ChatToolSetsParts {
  readonly parts: WorkspaceAssistantParts;
  readonly chats: KeptChats;
  /** Tells the window that the chat changed, as when it asked about a docs site. */
  readonly changed: (chatId: string) => void;
  /** The person's own messages in the chat, which the Build chat's gate counts as named. */
  readonly personMessages: (chatId: string) => Promise<string[]>;
}

/** The tools a turn before trust leaves out: it offers exactly the six authoring tools. */
const afterTrust = ["show", "integration_guide", "read_docs", "read_request_log"];

/** The tools and fix attempts of the chats of one open workspace. */
export class ChatToolSets {
  readonly #parts: ChatToolSetsParts;
  readonly #tools = new Map<string, readonly ChatTool[]>();
  readonly #fixes = new Map<string, FixAttempts>();
  readonly #shows = new Map<string, ChatShow>();

  constructor(parts: ChatToolSetsParts) {
    this.#parts = parts;
  }

  /** Shows the chat's items in `show` while it answers; `undefined` stops showing them. */
  showIn(chatId: string, show: ChatShow | undefined): void {
    if (show === undefined) this.#shows.delete(chatId);
    else this.#shows.set(chatId, show);
  }

  /**
   * The chat's tools; `read_docs` keeps its sites and log with the chat
   * (`studio.assistant-read-docs`). `read_request_log` is offered only in a chat about a local
   * integration (`aboutLocal`), and before trust a turn offers exactly the six authoring tools
   * (`studio.assistant-authoring-turn`).
   */
  toolsOf(chatId: string, aboutLocal: boolean): readonly ChatTool[] {
    const tools = this.#tools.get(chatId) ?? this.#made(chatId);
    const offered = tools.filter(
      (tool) => aboutLocal || tool.definition.name !== "read_request_log",
    );
    return this.#parts.parts.isTrusted()
      ? offered
      : offered.filter((tool) => !afterTrust.includes(tool.definition.name));
  }

  /**
   * Counts an Accept as a fix attempt in every chat whose card it covers. Only an Accept's step
   * comes here: an Undo or a Redo of a part Accept looks the same, and counts nothing. The Accept
   * is done already, so a count that fails is logged, not thrown.
   */
  async accepted(step: ReviewStep): Promise<void> {
    const chatIds = new Set(step.files.flatMap((each) => each.record.before?.card.chatId ?? []));
    for (const chatId of chatIds) {
      await this.#fixesOf(chatId)
        ?.reviewed(step)
        .catch((error: unknown) => console.error("Counting a fix", error));
    }
  }

  /** Lets go of a chat that is gone, deleted or dropped past the 40 (HAL-17294). */
  forget(chatId: string): void {
    this.#tools.delete(chatId);
    this.#fixes.delete(chatId);
    this.#shows.delete(chatId);
  }

  #made(chatId: string): readonly ChatTool[] {
    const { parts, chats, changed, personMessages } = this.#parts;
    const { files, review, isTrusted, digest, requestLogs } = parts;
    const show = async (item: ItemRef): Promise<ShowOutcome> =>
      this.#shows.get(chatId)?.(item) ?? "nowhere";
    const sites = new KeptDocsSites(chats, chatId, () => changed(chatId));
    const now = parts.now ?? (() => new Date());
    const messages = async () => (await chats.get(chatId)).messages;
    const docs = parts.docs && docsOptionsOf(parts.docs, sites, messages, now);
    const about = async () => (await chats.get(chatId)).about;
    const requestLog = requestLogs && requestLogReading(files, about, requestLogs);
    const tools = withCallIds(
      buildChatTools({
        chatId,
        files,
        review,
        isTrusted,
        digest,
        show,
        personMessages: () => personMessages(chatId),
        docs,
        requestLog,
        fixes: this.#fixesOf(chatId),
      }),
      sites,
    );
    this.#tools.set(chatId, tools);
    return tools;
  }

  /**
   * The chat's fix attempts, made once, also for a chat that hasn't answered in this window.
   * Without a request log no fix can be seen to fail, so then there are none.
   */
  #fixesOf(chatId: string): FixAttempts | undefined {
    const { parts, chats } = this.#parts;
    const { files, requestLogs } = parts;
    if (requestLogs === undefined) return undefined;
    let fixes = this.#fixes.get(chatId);
    if (fixes === undefined) {
      fixes = new FixAttempts({
        chatId,
        kept: {
          read: async () => (await chats.get(chatId)).fixes,
          write: async (kept) => {
            await chats.get(chatId);
            chats.changeFixes(chatId, kept);
          },
        },
        integration: async () =>
          localIntegrationIn(await loadWorkspace(files), files, (await chats.get(chatId)).about),
        lines: linesOrNone(requestLogs),
        now: parts.now ?? (() => new Date()),
      });
      this.#fixes.set(chatId, fixes);
    }
    return fixes;
  }
}

/**
 * The log's lines for the fix count. A read that fails reads as no lines, so the attempt stays
 * pending: its error, which can hold the log's own text, never reaches the model as the answer
 * of `propose_file`, `propose_delete` or `read_request_log`.
 */
function linesOrNone(
  logs: RequestLogs,
): (integration: string) => Promise<readonly RequestLogLine[]> {
  return (integration) =>
    logs(integration).catch((error: unknown) => {
      console.error("Reading the request log for the fix count", error);
      return [];
    });
}
