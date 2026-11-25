// A Build chat's `read_docs` in the folder's Assistant (`studio.assistant-read-docs`): the
// sites the person allowed or declined and the docs log, kept with the chat in the profile,
// never in the workspace, so no workspace file can allow a site. A new chat asks again.

import type { ChatTool } from "@halonicjs/app";
import type {
  DocsLogEntry,
  DocsOptions,
  DocsSites,
  SiteAnswer,
  TimeLimit,
} from "@halonicjs/assistant";
import type { ChatMessage, HttpClient, SavedChatDocs } from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import type { KeptChats } from "./kept-chats.ts";

/** What the folder's Assistant reads docs with. Absent where there is no shell: no `read_docs`. */
export interface DocsReading {
  /** The shell's client for public addresses only (`publicOnlyShellHttpClient`), with no keys. */
  readonly http: HttpClient;
  /** Starts a time limit; {@link pageTimeLimit} by default. */
  readonly timeLimit?: ((delayMs: number) => TimeLimit) | undefined;
}

/** A time limit on the page's own timers. */
export function pageTimeLimit(delayMs: number): TimeLimit {
  const stopper = new AbortController();
  const timer = setTimeout(() => stopper.abort(), delayMs);
  return { signal: stopper.signal, stop: () => clearTimeout(timer) };
}

/** No sites asked and nothing logged: a chat that never read docs. */
export const noDocs: SavedChatDocs = { sites: [], log: [] };

/**
 * One chat's docs sites and log, kept in its {@link KeptChats} entry. Each log line names the
 * `read_docs` call it is for, so the chat shows it under that call.
 */
export class KeptDocsSites implements DocsSites {
  readonly #chats: KeptChats;
  readonly #chatId: string;
  readonly #changed: () => void;
  /** The `read_docs` call running now; tools run one at a time, in the model's order. */
  #callId = "";

  constructor(chats: KeptChats, chatId: string, changed: () => void) {
    this.#chats = chats;
    this.#chatId = chatId;
    this.#changed = changed;
  }

  /** Runs `run` as the `read_docs` call `callId`, so its log lines name it. */
  async during<T>(callId: string, run: () => Promise<T>): Promise<T> {
    this.#callId = callId;
    try {
      return await run();
    } finally {
      this.#callId = "";
    }
  }

  async answerFor(host: string): Promise<SiteAnswer | undefined> {
    const { docs } = await this.#chats.get(this.#chatId);
    return docs?.sites.find((site) => site.host === host)?.answer;
  }

  async ask(host: string, cardId: string): Promise<void> {
    await this.#change((docs) => ({
      ...docs,
      sites: [...docs.sites, { host, answer: "asked", cardId }],
    }));
  }

  async log(entry: DocsLogEntry): Promise<void> {
    const callId = this.#callId;
    await this.#change((docs) => ({ ...docs, log: [...docs.log, { callId, ...entry }] }));
  }

  async #change(change: (docs: SavedChatDocs) => SavedChatDocs): Promise<void> {
    await this.#chats.get(this.#chatId);
    this.#chats.changeDocs(this.#chatId, change);
    this.#changed();
  }
}

/**
 * The options `read_docs` gets for one chat. `messages` reads the chat as kept, which holds each
 * tool result as it arrives, so a page read earlier in the same answer counts.
 */
export function docsOptionsOf(
  reading: DocsReading,
  sites: KeptDocsSites,
  messages: () => Promise<readonly ChatMessage[]>,
  now: () => Date,
): DocsOptions {
  return {
    http: reading.http,
    sites,
    messages,
    timeLimit: reading.timeLimit ?? pageTimeLimit,
    now,
  };
}

/** The chat's tools, with each `read_docs` call run as itself, so its log lines name it. */
export function withCallIds(tools: readonly ChatTool[], sites: KeptDocsSites): ChatTool[] {
  return tools.map((tool) =>
    tool.definition.name === "read_docs"
      ? {
          definition: tool.definition,
          call: (toolCall, signal) => sites.during(toolCall.id, () => tool.call(toolCall, signal)),
        }
      : tool,
  );
}

/**
 * The person's answer on the site card under the `read_docs` call `cardId`. Only the site that
 * call asked about changes, and only while it waits: an answer stays for the rest of the chat.
 *
 * @throws KindedError `not_found` when the chat has no such card, `conflict` when it was answered
 */
export async function answerSiteCard(
  chats: KeptChats,
  chatId: string,
  cardId: string,
  answer: "allowed" | "declined",
): Promise<void> {
  const { docs } = await chats.get(chatId);
  const site = docs?.sites.find((each) => each.cardId === cardId);
  if (site === undefined) throw new KindedError("not_found", "This site card isn't in this chat.");
  if (site.answer !== "asked") {
    throw new KindedError("conflict", `${site.host} was already answered in this chat.`);
  }
  chats.changeDocs(chatId, (kept) => ({
    ...kept,
    sites: kept.sites.map((each) => (each.cardId === cardId ? { ...each, answer } : each)),
  }));
}
