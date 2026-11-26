import type { InboxItem, MessagingProject } from "@halonicjs/ports";
import { asRecord, asRecords, field, type JsonRecord, text } from "./json.ts";
import { authorOf, fullLinksOf, type MapContext } from "./map.ts";
import type { PaperclipReader } from "./reader.ts";
import { bodyOf } from "./transport.ts";
import type { PaperclipWebLinks } from "./web-links.ts";

// Comments that mention the signed-in person, as `comment` items (`paperclip-client.board-mentions`,
// HAL-19669). Only the agent-tools plugin's route says which comments mention the person: it reads
// the mention link Paperclip's mention picker writes. The provider never looks for a name in text.

/** How long a mention stays in the Inbox when nobody answers it. */
const mentionDays = 14;
const mentionMs = mentionDays * 24 * 60 * 60_000;
/** How many of a comment's lines the item shows, and at most how many characters. */
const shownLines = 3;
const shownChars = 280;

/** Looks up a Paperclip project ID in the projects read for this list. */
export type ProjectOf = (projectId: string | undefined) => MessagingProject | undefined;

/** The first lines of a comment, without blank lines, cut to {@link shownChars}. */
function firstLines(body: string): string {
  const lines = body
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== "");
  const shown = lines.slice(0, shownLines).join("\n");
  const cut = shown.length > shownChars || lines.length > shownLines;
  return cut ? `${shown.slice(0, shownChars).trimEnd()}…` : shown;
}

/** Whether the person commented on the task after the mention: then it is answered. */
function answered(mention: JsonRecord, createdAt: string): boolean {
  const repliedAt = text(mention, "repliedAt");
  return repliedAt !== undefined && Date.parse(repliedAt) > Date.parse(createdAt);
}

/**
 * Reads the plugin's mentions route for the Inbox. A failed read is reported through `warn` and
 * the Inbox shows its other items; with no `warn`, it fails the list. A 404 means the plugin, or
 * this route of it, isn't installed: then there are no mentions.
 */
export class PaperclipBoardMentions {
  readonly #reader: PaperclipReader;
  readonly #company: string;
  readonly #webLinks: PaperclipWebLinks;
  readonly #warn: ((message: string) => void) | undefined;
  readonly #now: () => Date;

  /** `connection` is the provider's: its company, and where a read that need not fail a list is reported. */
  constructor(
    reader: PaperclipReader,
    webLinks: PaperclipWebLinks,
    connection: { company: string; warn?: ((message: string) => void) | undefined },
    now: () => Date,
  ) {
    this.#reader = reader;
    this.#company = connection.company;
    this.#webLinks = webLinks;
    this.#warn = connection.warn;
    this.#now = now;
  }

  /** The mentions on `open` tasks the person hasn't answered, from the last 14 days. */
  async list(
    context: MapContext,
    open: readonly JsonRecord[],
    projectOf: ProjectOf,
  ): Promise<InboxItem[]> {
    const since = new Date(this.#now().getTime() - mentionMs).toISOString();
    let mentions: JsonRecord[];
    try {
      mentions = await this.#read(since);
    } catch (error) {
      if (this.#warn === undefined) {
        throw error;
      }
      const reason = error instanceof Error ? error.message : String(error);
      this.#warn(`Couldn't read the comments that mention you in Paperclip: ${reason}`);
      return [];
    }
    const tasks = new Map(open.flatMap((task) => [[text(task, "id"), task] as const]));
    return mentions.flatMap((mention) => {
      const task = tasks.get(text(mention, "taskId"));
      const item = task === undefined ? undefined : this.#toItem(context, mention, task, since);
      if (item === undefined || task === undefined) return [];
      const project = projectOf(text(task, "projectId"));
      return [project === undefined ? item : { ...item, project }];
    });
  }

  async #read(since: string): Promise<JsonRecord[]> {
    const answer = await this.#reader.send("boardMentions", {
      query: { companyId: this.#company, since },
    });
    if (answer.kind === "failed" && answer.failure === "not-found") {
      return [];
    }
    return asRecords(field(asRecord(bodyOf("boardMentions", answer)), "mentions"));
  }

  /** A mention as a `comment` item; none when it is answered, too old or has no page to answer on. */
  #toItem(
    context: MapContext,
    mention: JsonRecord,
    task: JsonRecord,
    since: string,
  ): InboxItem | undefined {
    const taskId = text(task, "id");
    const commentId = text(mention, "commentId");
    const createdAt = text(mention, "createdAt");
    // The item is answered in Paperclip, so it needs the task's page there.
    const webLink = this.#webLinks.task(text(task, "identifier"));
    if (taskId === undefined || commentId === undefined || createdAt === undefined)
      return undefined;
    const tooOld = Date.parse(createdAt) < Date.parse(since);
    if (webLink === undefined || tooOld || answered(mention, createdAt)) return undefined;
    const authorUserId = text(mention, "authorUserId");
    if (authorUserId !== undefined && authorUserId === context.userId) return undefined;
    const title = text(task, "title") ?? text(mention, "title") ?? "";
    return {
      id: context.ids.make("comment", taskId, commentId),
      source: context.ids.source(),
      from: authorOf(context, text(mention, "authorAgentId"), authorUserId),
      question: [title, fullLinksOf(context, firstLines(text(mention, "body") ?? ""))]
        .filter((part) => part !== "")
        .join("\n\n"),
      options: [],
      kind: "comment",
      answerElsewhere: { link: webLink.link },
      webLink,
      work: context.ids.make("task", taskId),
      attachments: [],
      createdAt,
      state: { kind: "open" },
    };
  }
}
