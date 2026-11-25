import { checkedOrigin } from "./address.ts";
import { asRecord, asRecords, type JsonRecord, text } from "./json.ts";
import { isSafeSegment, UnsafeIdError } from "./requests.ts";
import {
  type PaperclipAnswer,
  PaperclipClientError,
  PaperclipTransport,
  type TransportOptions,
} from "./transport.ts";

/** One Paperclip connection, as Studio hands it in. The key stays behind its guard. */
export interface PaperclipFeedbackOptions extends TransportOptions {
  /** The Paperclip company the feedback task is made in. */
  company: string;
}

/** One feedback to send: the task's words, where it goes, and its screenshot file, if any. */
export interface FeedbackTaskInput {
  readonly title: string;
  readonly description: string;
  /** The project's name (or ID), such as "Halonic apps". */
  readonly project: string;
  /** The agent's name (or ID), such as "Chief". */
  readonly assignee: string;
  readonly screenshot: { readonly fileName: string; readonly contentType: "image/png" } | null;
}

/** What sending one feedback came to. */
export type FeedbackSendOutcome =
  | { readonly kind: "sent"; readonly taskId: string; readonly taskUrl: string }
  | { readonly kind: "offline" }
  | { readonly kind: "not-connected" }
  | { readonly kind: "refused"; readonly reason: string };

/** Why Paperclip or the client refused a feedback, in words the person reads. */
export const feedbackRefusals = {
  noProject: (name: string) => `Paperclip has no project called “${name}”.`,
  noAgent: (name: string) => `Paperclip has no agent called “${name}”.`,
  badId: "This feedback can't be sent: its ID isn't one Paperclip takes.",
  refused: "Paperclip refused the feedback.",
} as const;

type Refused = Extract<FeedbackSendOutcome, { kind: "refused" }>;

/** The idempotency key Paperclip keeps with the task, so the same feedback makes one task. */
export function feedbackKey(id: string): string {
  return `halonic-feedback:${id}`;
}

/**
 * Screenshot feedback through Studio's Paperclip connection
 * (`paperclip-client.feedback-tasks`, HAL-18737): one task in a project,
 * assigned to one agent with status `todo`, with the screenshot attached.
 *
 * Sending the same feedback `id` again is safe: Paperclip answers a repeated
 * idempotency key with the task it already made, and the screenshot is
 * uploaded only when the task has no file of that name yet. So a retry after
 * a lost reply makes no second task and no second file.
 */
export class PaperclipFeedback {
  readonly #company: string;
  readonly #origin: string;
  readonly #transport: PaperclipTransport;

  constructor(options: PaperclipFeedbackOptions) {
    this.#company = options.company;
    this.#origin = checkedOrigin(options.address);
    this.#transport = new PaperclipTransport(options);
  }

  /** Sends feedback `id`: makes its task, or finds the one already made, and attaches `image`. */
  async send(
    id: string,
    task: FeedbackTaskInput,
    image: Uint8Array | null,
  ): Promise<FeedbackSendOutcome> {
    if (!isSafeSegment(id)) {
      return { kind: "refused", reason: feedbackRefusals.badId };
    }
    try {
      return await this.#send(id, task, image);
    } catch (error) {
      if (error instanceof UnsafeIdError) {
        return { kind: "refused", reason: feedbackRefusals.refused };
      }
      throw error;
    }
  }

  async #send(
    id: string,
    task: FeedbackTaskInput,
    image: Uint8Array | null,
  ): Promise<FeedbackSendOutcome> {
    const projects = await this.#list("listProjects");
    if (!Array.isArray(projects)) return projects;
    const project = findByName(projects, task.project);
    if (project === undefined) return refused(feedbackRefusals.noProject(task.project));
    const agents = await this.#list("listAgents");
    if (!Array.isArray(agents)) return agents;
    const agent = findByName(agents, task.assignee);
    if (agent === undefined) return refused(feedbackRefusals.noAgent(task.assignee));

    const created = await this.#transport.send("createFeedbackTask", {
      path: { company: this.#company },
      body: {
        title: task.title,
        description: task.description,
        projectId: project,
        assigneeAgentId: agent,
        status: "todo",
        idempotencyKey: feedbackKey(id),
      },
    });
    if (created.kind === "failed") return outcomeOf(created);
    const record = asRecord(created.body);
    const taskId = text(record, "id");
    if (taskId === undefined) {
      throw new PaperclipClientError(
        "Paperclip's answer to createFeedbackTask has no task.",
        "bad-answer",
      );
    }
    if (task.screenshot !== null && image !== null) {
      const attached = await this.#attach(taskId, task.screenshot, image);
      if (attached !== undefined) return attached;
    }
    return { kind: "sent", taskId, taskUrl: this.#taskUrl(taskId, text(record, "identifier")) };
  }

  /** Attaches the screenshot unless the task already has it; a failure's outcome, or `undefined`. */
  async #attach(
    task: string,
    screenshot: NonNullable<FeedbackTaskInput["screenshot"]>,
    image: Uint8Array,
  ): Promise<FeedbackSendOutcome | undefined> {
    const listed = await this.#transport.send("listTaskAttachments", { path: { task } });
    if (listed.kind === "failed") return outcomeOf(listed);
    const names = asRecords(listed.body).map((each) => text(each, "originalFilename"));
    if (names.includes(screenshot.fileName)) return undefined;
    const uploaded = await this.#transport.send("attachScreenshot", {
      path: { company: this.#company, task },
      upload: { fileName: screenshot.fileName, contentType: screenshot.contentType, bytes: image },
    });
    return uploaded.kind === "failed" ? outcomeOf(uploaded) : undefined;
  }

  /** The company's projects or agents, or the outcome of a failed read. */
  async #list(name: "listProjects" | "listAgents"): Promise<JsonRecord[] | FeedbackSendOutcome> {
    const answer = await this.#transport.send(name, { path: { company: this.#company } });
    return answer.kind === "failed" ? outcomeOf(answer) : asRecords(answer.body);
  }

  /** The task's page in Paperclip: by its identifier, such as `/HAL/issues/HAL-42`, when it has one. */
  #taskUrl(id: string, identifier: string | undefined): string {
    const match = identifier === undefined ? null : /^([A-Z][A-Z0-9]*)-\d+$/.exec(identifier);
    const path =
      match === null ? `/issues/${encodeURIComponent(id)}` : `/${match[1]}/issues/${identifier}`;
    return new URL(path, this.#origin).href;
  }
}

/**
 * The ID of the record `wanted` names: by ID, by its name ignoring case, or else by the one
 * name that starts with it and a space, so "Halonic apps" finds "Halonic apps (desktop and
 * mobile)". Two such names find nothing, rather than a guess.
 */
export function findByName(records: readonly JsonRecord[], wanted: string): string | undefined {
  const needle = wanted.trim().toLowerCase();
  if (needle === "") return undefined;
  const named = records.flatMap((record) => {
    const id = text(record, "id");
    const name = text(record, "name")?.toLowerCase();
    return id === undefined || name === undefined ? [] : [{ id, name }];
  });
  const exact = named.find((each) => each.id === wanted || each.name === needle);
  if (exact !== undefined) return exact.id;
  const starting = named.filter((each) => each.name.startsWith(`${needle} `));
  return starting.length === 1 ? starting[0]?.id : undefined;
}

function refused(reason: string): Refused {
  return { kind: "refused", reason };
}

/** The outcome of a failed request: offline, signed out (not connected), or refused. */
function outcomeOf(answer: PaperclipAnswer & { kind: "failed" }): FeedbackSendOutcome {
  if (answer.failure === "offline") return { kind: "offline" };
  if (answer.failure === "signed-out") return { kind: "not-connected" };
  return refused(answer.detail ?? feedbackRefusals.refused);
}
