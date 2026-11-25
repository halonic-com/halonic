// What `read_docs` needs from the host for one chat (`assistant.build.read-docs`):
// the person's answer for each site, and the log of every address. The host
// keeps both with the chat, outside the workspace, so no workspace file can
// allow a site or change the log.

import type { ChatMessage, HttpClient } from "@halonicjs/ports";

/**
 * What the person said about one site in this chat: `asked` while its card
 * waits for an answer, then `allowed` or `declined`.
 */
export type SiteAnswer = "asked" | "allowed" | "declined";

/**
 * How one call ended:
 * - `read`: the page was read;
 * - `moved`: the site answered `3xx`, which isn't followed;
 * - `not-read`: another status, a type that isn't text, or a limit was hit;
 * - `waiting`: the site isn't allowed yet, and the person sees its card;
 * - `declined`: the person didn't allow the site;
 * - `refused`: the address was refused, before any request;
 * - `untrusted`: the workspace isn't trusted, so nothing was fetched.
 */
export type DocsOutcome =
  | "read"
  | "moved"
  | "not-read"
  | "waiting"
  | "declined"
  | "refused"
  | "untrusted";

/** One line of a chat's docs log. It never holds a request header or the page's text. */
export interface DocsLogEntry {
  /** When the call was made, as ISO text. */
  readonly at: string;
  /** The address, without a query or fragment (`loggedUrl`). */
  readonly url: string;
  readonly outcome: DocsOutcome;
  /** The site's status, when it answered. */
  readonly status?: number | undefined;
  /** How many bytes of the page were read: 0 when none were. */
  readonly bytes: number;
  /** Where a `3xx` pointed, which wasn't followed. */
  readonly location?: string | undefined;
}

/** The sites and log of one chat, kept by the host outside the workspace. */
export interface DocsSites {
  /** What the person said about `host` in this chat; `undefined` when it was never asked. */
  answerFor(host: string): Promise<SiteAnswer | undefined>;
  /**
   * Shows the person a card for `host`, with Allow and Don't allow, and marks it `asked`.
   *
   * @param cardId - the tool call that asked, so the card sits under it in the chat
   */
  ask(host: string, cardId: string): Promise<void>;
  /** Adds one line to the chat's docs log. */
  log(entry: DocsLogEntry): Promise<void>;
}

/** A time limit the host runs: its signal aborts after the delay, unless stopped first. */
export interface TimeLimit {
  readonly signal: AbortSignal;
  stop(): void;
}

/** What the host gives `read_docs` for one chat. Without it, the chat has no `read_docs`. */
export interface DocsOptions {
  /**
   * The client the pages are fetched with: one of its own, with no cookies, no keys and no
   * secret store, which refuses private addresses after the name resolves.
   */
  readonly http: HttpClient;
  readonly sites: DocsSites;
  /**
   * The chat's messages as kept so far, read on every call. They must include the tool results of
   * the answer in progress as each arrives, as the Studio keeps them, so a page read in turn 1
   * counts in turn 2. Once they hold a page, a site is asked for only when the person named it
   * (`assistant.build.loaded-page`).
   */
  readonly messages: () => Promise<readonly ChatMessage[]>;
  /** Starts a time limit of `delayMs`; the core has no timers of its own. */
  readonly timeLimit: (delayMs: number) => TimeLimit;
  readonly now: () => Date;
}

/** A chat's sites and log in memory, for tests and for a host that keeps them for the session. */
export class MemoryDocsSites implements DocsSites {
  readonly answers = new Map<string, SiteAnswer>();
  /** The cards asked for, in order. */
  readonly asks: { readonly host: string; readonly cardId: string }[] = [];
  readonly entries: DocsLogEntry[] = [];

  async answerFor(host: string): Promise<SiteAnswer | undefined> {
    return this.answers.get(host);
  }

  async ask(host: string, cardId: string): Promise<void> {
    this.answers.set(host, "asked");
    this.asks.push({ host, cardId });
  }

  async log(entry: DocsLogEntry): Promise<void> {
    this.entries.push(entry);
  }

  /** The person pressed Allow on the card for `host`. */
  allow(host: string): void {
    this.answers.set(host, "allowed");
  }

  /** The person pressed Don't allow on the card for `host`. */
  decline(host: string): void {
    this.answers.set(host, "declined");
  }
}
