import type {
  PaperclipConnectionList,
  PaperclipConnectionRow,
} from "@halonicjs/adapter-agent-host-client";
import type { FeedbackSender, FeedbackTask, SendOutcome } from "@halonicjs/studio-feature-feedback";
import {
  AgentHostNotAnswering,
  type FeedbackSent,
  type FeedbackToSend,
} from "@halonicjs/studio-services";

/** What {@link FolderFeedbackSender} needs of the agent host, for one open folder. */
export interface FolderFeedbackHost {
  /** The folder's Paperclip connections and its real path (`AgentHostPaperclipSignIn.listed`). */
  listed(): Promise<PaperclipConnectionList>;
  /** Sends one feedback through the host, which holds the key (`AgentHostFeedback.send`). */
  send(feedback: FeedbackToSend): Promise<FeedbackSent>;
}

/**
 * Whether a connection holds its key on this computer: online, or offline while Paperclip doesn't
 * answer. Only such a connection can send, and only then is Studio connected to Paperclip.
 */
export function holdsKey(row: Pick<PaperclipConnectionRow, "state">): boolean {
  return row.state.kind === "online" || row.state.kind === "offline";
}

/**
 * Sends the feedback of one open folder through one of its Paperclip connections, by its ID
 * (`studio.feedback-sender`). The host keeps the key, so the page never sees one. A host that isn't
 * answering is `offline`, and a connection that doesn't hold its key now `not-connected`; both keep
 * the feedback to send later. The host never passes on Paperclip's words, so a refusal has no reason.
 */
export class FolderFeedbackSender implements FeedbackSender {
  readonly #host: FolderFeedbackHost;
  /** The ID of the connection it sends through, as `AgentConnection.id` and the host's row say. */
  readonly #connection: string;

  constructor(host: FolderFeedbackHost, connection: string) {
    this.#host = host;
    this.#connection = connection;
  }

  async send(id: string, task: FeedbackTask, image: Uint8Array | null): Promise<SendOutcome> {
    try {
      return await this.#sendThroughHost(id, task, image);
    } catch (error) {
      // The host can stop answering between listing the connections and sending.
      if (error instanceof AgentHostNotAnswering) return { kind: "offline" };
      throw error;
    }
  }

  async #sendThroughHost(
    id: string,
    task: FeedbackTask,
    image: Uint8Array | null,
  ): Promise<SendOutcome> {
    const listed: PaperclipConnectionList = await this.#host.listed();
    const connection = listed.connections.find((row) => row.id === this.#connection);
    if (connection === undefined || !holdsKey(connection)) return { kind: "not-connected" };
    const sent = await this.#host.send({
      workspace: listed.workspace,
      connection: connection.name,
      id,
      title: task.title,
      description: task.description,
      project: task.project,
      assignee: task.assignee,
      screenshot:
        image === null || task.screenshot === null
          ? null
          : { fileName: task.screenshot.fileName, png: image },
    });
    return outcomeOf(sent);
  }
}

function outcomeOf(sent: FeedbackSent): SendOutcome {
  if (sent.outcome === "sent") {
    return { kind: "sent", taskId: taskIdOf(sent.taskUrl), taskUrl: sent.taskUrl };
  }
  if (sent.outcome === "refused") return { kind: "refused", reason: "" };
  return { kind: sent.outcome };
}

/**
 * Where an outbox sends: one folder's one Paperclip connection, so a feedback kept for it never goes
 * to another connection that signs in later.
 */
export function destinationOf(location: string, connection: string): string {
  return JSON.stringify([location, connection]);
}

/** The task's ID from its page, the last part of its path: `ACME-12` from `…/ACME/issues/ACME-12`. */
export function taskIdOf(taskUrl: string): string {
  const path = URL.canParse(taskUrl) ? new URL(taskUrl).pathname : taskUrl;
  const last =
    path
      .split("/")
      .filter((part) => part !== "")
      .at(-1) ?? "";
  return decodeURIComponent(last);
}
