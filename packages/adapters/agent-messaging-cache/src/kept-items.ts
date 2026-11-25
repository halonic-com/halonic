import type {
  ActionResultAnswer,
  ActionResultStep,
  Attachment,
  Conversation,
  InboxActionRequest,
  InboxAnswer,
  InboxItem,
  InboxItemOption,
  InboxItemState,
  InboxQuestion,
  InboxQuestionAnswer,
  Message,
  MessageWork,
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
  const kept: Conversation = {
    id: conversation.id,
    source: conversation.source,
    agent: conversation.agent,
    title: conversation.title,
    updatedAt: conversation.updatedAt,
    waitingForMe: conversation.waitingForMe,
  };
  if (conversation.members !== undefined) kept.members = [...conversation.members];
  return kept;
}

/** The message's port fields only. */
export function keptMessage(message: Message): Message {
  const kept: Message = {
    id: message.id,
    conversation: message.conversation,
    author: keptAuthor(message.author),
    body: message.body,
    sentAt: message.sentAt,
    attachments: message.attachments.map(keptAttachment),
  };
  if (message.to !== undefined) kept.to = [...message.to];
  if (message.work !== undefined) kept.work = message.work.map(keptMessageWork);
  return kept;
}

/** The inbox item's port fields only. */
export function keptInboxItem(item: InboxItem): InboxItem {
  const kept: InboxItem = {
    id: item.id,
    source: item.source,
    from: keptAuthor(item.from),
    question: item.question,
    options: item.options.map(keptOption),
    createdAt: item.createdAt,
    state: keptState(item.state),
    attachments: item.attachments.map(keptAttachment),
  };
  if (item.questions !== undefined) kept.questions = item.questions.map(keptQuestion);
  if (item.action !== undefined) kept.action = keptAction(item.action);
  if (item.project !== undefined) kept.project = { id: item.project.id, name: item.project.name };
  if (item.work !== undefined) kept.work = item.work;
  if (item.risk !== undefined) kept.risk = item.risk;
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

function keptMessageWork(line: MessageWork): MessageWork {
  const kept: MessageWork = { agent: line.agent, state: line.state, since: line.since };
  if (line.work !== undefined) kept.work = line.work;
  if (line.passedTo !== undefined) kept.passedTo = line.passedTo;
  return kept;
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
  if (answer.kind === "action-result") return keptActionResult(answer);
  if (answer.kind === "answers") {
    return { kind: "answers", answers: answer.answers.map(keptQuestionAnswer) };
  }
  const kept: InboxAnswer = { kind: "option", option: answer.option };
  if (answer.note !== undefined) kept.note = answer.note;
  return kept;
}

function keptOption(option: InboxItemOption): InboxItemOption {
  return { id: option.id, label: option.label };
}

function keptQuestion(question: InboxQuestion): InboxQuestion {
  return {
    id: question.id,
    prompt: question.prompt,
    selection: question.selection,
    options: question.options.map(keptOption),
    required: question.required,
  };
}

function keptQuestionAnswer(answer: InboxQuestionAnswer): InboxQuestionAnswer {
  const kept: InboxQuestionAnswer = { question: answer.question, options: [...answer.options] };
  if (answer.text !== undefined) kept.text = answer.text;
  return kept;
}

function keptAction(action: InboxActionRequest): InboxActionRequest {
  const kept: InboxActionRequest = {
    definition: action.definition,
    version: action.version,
    parameters: { ...action.parameters },
    expires: action.expires,
  };
  if (action.expect !== undefined) kept.expect = { ...action.expect };
  return kept;
}

function keptActionResult(answer: ActionResultAnswer): ActionResultAnswer {
  return { kind: "action-result", outcome: answer.outcome, steps: answer.steps.map(keptStep) };
}

function keptStep(step: ActionResultStep): ActionResultStep {
  const kept: ActionResultStep = { step: step.step, outcome: step.outcome };
  if (step.status !== undefined) kept.status = step.status;
  if (step.kept !== undefined) kept.kept = { ...step.kept };
  if (step.failure !== undefined) kept.failure = step.failure;
  if (step.error !== undefined) kept.error = { untrusted: true, text: step.error.text };
  return kept;
}
