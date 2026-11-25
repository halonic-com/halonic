import type { Conversation, Message } from "@halonicjs/ports";
import type { PaperclipIds } from "./ids.ts";
import { asList, asRecords, field, type JsonRecord, text } from "./json.ts";
import type { PaperclipReader } from "./reader.ts";

// A chat's two signals from its agent's runs: whether the agent works on it now
// (`paperclip-client.agent-working`) and when it read each of the person's messages
// (`paperclip-client.read-receipts`). Both read only the runs' agent, task, status, start
// and the comments that woke them; a run's logs, errors and wake text are never kept.

/** A run that has started: running, or already ended. A queued run has no start yet. */
function startOf(record: JsonRecord): string | undefined {
  return text(record, "status") === "queued" ? undefined : text(record, "startedAt");
}

/**
 * The chats whose own agent has a run going now, as `task agent` pairs, from Paperclip's live
 * runs. `undefined` when Paperclip didn't answer: the chats then carry no `agentWorking`, as a
 * source that can't tell, and the next read tries again.
 */
export async function readWorkingChats(
  reader: PaperclipReader,
  company: string,
): Promise<ReadonlySet<string> | undefined> {
  const answer = await reader.send("listLiveRuns", { path: { company } });
  if (answer.kind === "failed") {
    return undefined;
  }
  const working = asRecords(answer.body).flatMap((record) => {
    const task = text(record, "issueId");
    const agent = text(record, "agentId");
    const running = text(record, "status") === "running" && startOf(record) !== undefined;
    return running && task !== undefined && agent !== undefined ? [workingKey(task, agent)] : [];
  });
  return new Set(working);
}

/** The key of agent `agent` working on task `task` in {@link readWorkingChats}' answer. */
function workingKey(task: string, agent: string): string {
  return `${task} ${agent}`;
}

/**
 * `conversation` with `agentWorking` set from `working`: only a run of the chat's own agent on
 * the chat's task counts. A chat whose agent Paperclip didn't name is left as it is.
 */
export function withAgentWorking(
  ids: PaperclipIds,
  conversation: Conversation,
  working: ReadonlySet<string> | undefined,
): Conversation {
  const [task] = ids.read(conversation.id, "chat") ?? [];
  const [agent] = ids.read(conversation.agent, "agent") ?? [];
  if (working === undefined || task === undefined || agent === undefined) {
    return conversation;
  }
  return { ...conversation, agentWorking: working.has(workingKey(task, agent)) };
}

/**
 * Chat task `task`'s messages, with `readAt` on the person's own messages: the start of the first
 * run of `agent` on the task that names the message among the comments that woke it, or that
 * started after the message was sent, because such a run reads the whole thread. A queued run
 * never counts. Reads the task's runs only when the person has a message there; when Paperclip
 * doesn't answer, the messages carry no `readAt` and the next read tries again.
 */
export async function withReadAt(
  reader: PaperclipReader,
  ids: PaperclipIds,
  chat: { task: string; agent: string },
  messages: readonly Message[],
): Promise<readonly Message[]> {
  if (!messages.some((message) => message.author.kind === "me")) {
    return messages;
  }
  const answer = await reader.send("listIssueRuns", { path: { task: chat.task } });
  if (answer.kind === "failed") {
    return messages;
  }
  const started = asRecords(answer.body).flatMap((record) => {
    const startedAt = startOf(record);
    return text(record, "agentId") === chat.agent && startedAt !== undefined
      ? [{ startedAt, woke: wakeComments(record) }]
      : [];
  });
  return messages.map((message) => {
    const [, comment] = ids.read(message.id, "comment") ?? [];
    if (message.author.kind !== "me" || comment === undefined) {
      return message;
    }
    const readAt = started
      .filter((run) => run.woke.has(comment) || run.startedAt > message.sentAt)
      .map((run) => run.startedAt)
      .sort()[0];
    return readAt === undefined ? message : { ...message, readAt };
  });
}

/** The comments that woke run `record`: its list, and the single field older runs carry. */
function wakeComments(record: JsonRecord): ReadonlySet<string> {
  const listed = asList(field(record, "wakeCommentIds"));
  const ids = [...listed, field(record, "wakeCommentId")];
  return new Set(ids.filter((id): id is string => typeof id === "string"));
}
