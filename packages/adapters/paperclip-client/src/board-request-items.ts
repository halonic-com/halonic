import type { InboxAnswer, InboxItem, InboxItemOption, InboxItemState } from "@halonicjs/ports";
import { fieldLines, oneLine, section } from "./approval-text.ts";
import { boardRequestWords as words } from "./board-request-words.ts";
import type { AnswerRequest } from "./cards.ts";
import { asRecord, field, type JsonRecord, text } from "./json.ts";
import { authorOf, type MapContext, timeOf } from "./map.ts";

// Secret proposals and join requests as inbox items (`paperclip-client.board-requests`, HAL-18873).
// A proposal's record carries fields about its value (a fingerprint, a length); this module reads
// only the fields named below, never one about the value, so no part of a secret reaches an item.

const approve: InboxItemOption = { id: "approve", label: words.approve };
const reject: InboxItemOption = { id: "reject", label: words.reject };

/** `blocks` as Markdown: the title first, then each non-empty block. */
function question(title: string, blocks: readonly string[]): string {
  return [oneLine(title), ...blocks.filter((block) => block !== "")].join("\n\n");
}

/** The state of a request that was approved or rejected, from who did it and when. */
function decided(
  context: MapContext,
  option: string,
  userId: string | undefined,
  at: string,
): InboxItemState {
  const answer: InboxAnswer = { kind: "option", option };
  return { kind: "answered", by: authorOf(context, undefined, userId), answer, answeredAt: at };
}

/** A secret proposal's question: what it adds or binds, its setting path and the agent's reason. */
function proposalQuestion(record: JsonRecord): string {
  const why = section(words.why, text(record, "justification"))[0] ?? "";
  const blocked = text(record, "approveBlockReason");
  const notice = field(record, "viewerCanApprove") === false && blocked !== undefined;
  const footer = notice ? words.approveInPaperclip(oneLine(blocked)) : words.valueStays;
  if (text(record, "kind") === "binding") {
    const target = text(asRecord(field(record, "target")), "name") ?? words.someone;
    const secret = text(record, "secretName") ?? text(record, "secretProposalName");
    const facts = fieldLines([
      [words.secret, secret],
      [words.setting, text(record, "configPath")],
    ]);
    return question(words.useSecret(target), [facts.join("\n"), why, footer]);
  }
  const facts = fieldLines([
    [words.key, text(record, "proposedKey")],
    [words.description, text(record, "proposedDescription")],
  ]);
  const name = text(record, "proposedName") ?? words.someone;
  return question(words.newSecret(name), [facts.join("\n"), why, footer]);
}

/**
 * A secret proposal as an inbox item, or `undefined` when it isn't pending, approved or rejected.
 * Who proposed it is the agent; its task is the one the agent worked on. When Paperclip says this
 * person can't approve it, only Reject is offered and the question says why.
 */
export function secretProposalToItem(
  context: MapContext,
  record: JsonRecord,
): InboxItem | undefined {
  const id = text(record, "id");
  const status = text(record, "status");
  if (
    id === undefined ||
    (status !== "pending" && status !== "approved" && status !== "rejected")
  ) {
    return undefined;
  }
  const task = text(record, "originIssueId");
  const canApprove = field(record, "viewerCanApprove") !== false;
  return {
    id: context.ids.make("secret-proposal", id),
    source: context.ids.source(),
    from: authorOf(context, text(record, "proposedByAgentId"), undefined),
    question: proposalQuestion(record),
    options: canApprove ? [approve, reject] : [reject],
    ...(task === undefined ? {} : { work: context.ids.make("task", task) }),
    // A secret changes what an agent can reach.
    risk: "risky",
    createdAt: timeOf(record, "createdAt"),
    attachments: [],
    state:
      status === "pending"
        ? { kind: "open" }
        : decided(
            context,
            status === "approved" ? "approve" : "reject",
            text(record, "resolvedByUserId"),
            timeOf(record, "resolvedAt"),
          ),
  };
}

/** A join request's question: who asks to join, as a person or as an agent. */
function joinQuestion(record: JsonRecord): string {
  if (text(record, "requestType") === "agent") {
    const facts = fieldLines([
      [words.adapter, text(record, "adapterType")],
      [words.capabilities, text(record, "capabilities")],
    ]);
    const name = text(record, "agentName") ?? words.newAgent;
    return question(words.joinAgent(name), [facts.join("\n"), words.agentJoins]);
  }
  const user = asRecord(field(record, "requesterUser"));
  const email = text(user, "email") ?? text(record, "requestEmailSnapshot");
  const who = text(user, "name") ?? email ?? words.someone;
  return question(words.joinPerson(who), [fieldLines([[words.email, email]]).join("\n")]);
}

/** A join request's state, or `undefined` for one that no longer waits and wasn't decided. */
function joinState(context: MapContext, record: JsonRecord): InboxItemState | undefined {
  switch (text(record, "status")) {
    case "pending_approval":
      return { kind: "open" };
    case "approved":
      return decided(
        context,
        "approve",
        text(record, "approvedByUserId"),
        timeOf(record, "approvedAt"),
      );
    case "rejected":
      return decided(
        context,
        "reject",
        text(record, "rejectedByUserId"),
        timeOf(record, "rejectedAt"),
      );
    default:
      return undefined;
  }
}

/** A join request as an inbox item, or `undefined` when it isn't waiting, approved or rejected. */
export function joinRequestToItem(context: MapContext, record: JsonRecord): InboxItem | undefined {
  const id = text(record, "id");
  const itemState = joinState(context, record);
  if (id === undefined || itemState === undefined) {
    return undefined;
  }
  return {
    id: context.ids.make("join-request", id),
    source: context.ids.source(),
    from: authorOf(context, undefined, text(record, "requestingUserId")),
    question: joinQuestion(record),
    options: [approve, reject],
    // Approving changes who may work in the company.
    risk: "risky",
    createdAt: timeOf(record, "createdAt"),
    attachments: [],
    state: itemState,
  };
}

/**
 * The request that approves or rejects a secret proposal, or `undefined` for any other answer.
 * Approve sends no overrides, so Halonic never renames a secret; a reject carries the person's
 * note as Paperclip's required reason, else a fixed one.
 */
export function secretProposalAnswerRequest(answer: InboxAnswer): AnswerRequest | undefined {
  if (answer.kind !== "option") {
    return undefined;
  }
  if (answer.option === "approve") {
    return { name: "approveSecretProposal", body: {} };
  }
  const reason = answer.note?.trim() || words.rejectedInHalonic;
  return answer.option === "reject"
    ? { name: "rejectSecretProposal", body: { reason } }
    : undefined;
}

/** The request that approves or rejects a join request, or `undefined` for any other answer. */
export function joinRequestAnswerRequest(answer: InboxAnswer): AnswerRequest | undefined {
  if (answer.kind !== "option") {
    return undefined;
  }
  if (answer.option === "approve") {
    return { name: "approveJoinRequest", body: {} };
  }
  return answer.option === "reject" ? { name: "rejectJoinRequest", body: {} } : undefined;
}
