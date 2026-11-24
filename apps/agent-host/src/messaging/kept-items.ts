import type {
  Attachment,
  Conversation,
  InboxAnswer,
  InboxItem,
  InboxItemState,
  Message,
  MessagingAgent,
  MessagingAuthor,
  WorkItem,
} from "@halonicjs/ports";

// Each function copies only the fields the port names, so whatever else a
// provider hangs on an item (a request, its headers, a key) never reaches the
// cache file (requirement `agent-host.agent-messaging-cache`).

/** The agent's port fields only. */
export function keptAgent(agent: MessagingAgent): MessagingAgent {
  const kept: MessagingAgent = {
    id: agent.id,
    source: agent.source,
    name: agent.name,
    activity: agent.activity,
  };
  if (agent.title !== undefined) kept.title = agent.title;
  return kept;
}

/** The conversation's port fields only. */
export function keptConversation(conversation: Conversation): Conversation {
  return {
    id: conversation.id,
    source: conversation.source,
    agent: conversation.agent,
    title: conversation.title,
    updatedAt: conversation.updatedAt,
    waitingForMe: conversation.waitingForMe,
  };
}

/** The message's port fields only. */
export function keptMessage(message: Message): Message {
  return {
    id: message.id,
    conversation: message.conversation,
    author: keptAuthor(message.author),
    body: message.body,
    sentAt: message.sentAt,
    attachments: message.attachments.map(keptAttachment),
  };
}

/** The inbox item's port fields only. */
export function keptInboxItem(item: InboxItem): InboxItem {
  const kept: InboxItem = {
    id: item.id,
    source: item.source,
    from: keptAuthor(item.from),
    question: item.question,
    options: item.options.map((option) => ({ id: option.id, label: option.label })),
    createdAt: item.createdAt,
    state: keptState(item.state),
    attachments: item.attachments.map(keptAttachment),
  };
  if (item.project !== undefined) kept.project = { id: item.project.id, name: item.project.name };
  if (item.work !== undefined) kept.work = item.work;
  return kept;
}

/** The work item's port fields only. */
export function keptWork(work: WorkItem): WorkItem {
  const kept: WorkItem = {
    id: work.id,
    source: work.source,
    label: work.label,
    title: work.title,
    state: work.state,
    blockedBy: [...work.blockedBy],
    updatedAt: work.updatedAt,
  };
  if (work.assignee !== undefined) kept.assignee = work.assignee;
  return kept;
}

/** A file's listing only; its bytes are never cached, they come from the source on each read. */
function keptAttachment(attachment: Attachment): Attachment {
  return {
    id: attachment.id,
    name: attachment.name,
    type: attachment.type,
    size: attachment.size,
  };
}

function keptAuthor(author: MessagingAuthor): MessagingAuthor {
  if (author.kind === "me") return { kind: "me" };
  if (author.kind === "agent") return { kind: "agent", agent: author.agent, name: author.name };
  return { kind: "person", name: author.name };
}

function keptState(state: InboxItemState): InboxItemState {
  if (state.kind === "open") return { kind: "open" };
  return {
    kind: "answered",
    by: keptAuthor(state.by),
    answer: keptAnswer(state.answer),
    answeredAt: state.answeredAt,
  };
}

function keptAnswer(answer: InboxAnswer): InboxAnswer {
  if (answer.kind === "reply") return { kind: "reply", text: answer.text };
  const kept: InboxAnswer = { kind: "option", option: answer.option };
  if (answer.note !== undefined) kept.note = answer.note;
  return kept;
}
