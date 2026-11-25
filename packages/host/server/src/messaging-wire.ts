import {
  type AttachmentRead,
  channelMembersMax,
  checkActionResultAnswer,
  type InboxAnswer,
  type MessagingRefusal,
  type OutgoingAttachment,
} from "@halonicjs/ports";
import { type Infer, parse, type Schema, s } from "@halonicjs/schema-kit";
import { decodeBase64url, encodeBase64url } from "@halonicjs/std";
import type { ServerErrorBody } from "./api.ts";

// The bodies the messaging routes take. IDs travel in bodies, never in the
// path, so the request log, which keeps the path, holds none of them.

const id = s.string().min(1).max(1024);
const members = s.array(id).max(channelMembersMax);
const outgoingFile = s
  .object({
    name: s.string().min(1).max(256),
    type: s.string().min(1).max(256),
    base64url: s.string(),
  })
  .strict();

export const messagingBodies = {
  messages: s.object({ conversation: id }).strict(),
  search: s.object({ text: s.string().min(1).max(1024) }).strict(),
  attachment: s.object({ attachment: id }).strict(),
  answer: s.object({ item: id, answer: s.unknown() }).strict(),
  send: s
    .object({
      conversation: id,
      body: s.string().min(1).max(20_000),
      attachments: s.array(outgoingFile).max(10).optional(),
      to: members.optional(),
    })
    .strict(),
  startChannel: s.object({ title: s.string().min(1).max(256), members, lead: id }).strict(),
  setMembers: s.object({ channel: id, members, lead: id }).strict(),
  channel: s.object({ channel: id }).strict(),
  focus: s.object({ inFront: s.boolean() }).strict(),
} as const;

/** A JSON body checked against its schema, or `null` when it isn't JSON or doesn't fit. A parse error is never described: it could quote the body. */
export function readMessagingBody<S extends Schema>(schema: S, body: Uint8Array): Infer<S> | null {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return null;
  }
  const parsed = parse(schema, value);
  return parsed.ok ? parsed.value : null;
}

const optionAnswer = s
  .object({
    kind: s.literal("option"),
    option: s.string().min(1).max(256),
    note: s.string().max(20_000).optional(),
  })
  .strict();
const replyAnswer = s
  .object({ kind: s.literal("reply"), text: s.string().min(1).max(20_000) })
  .strict();

/**
 * The port's answer from a body's `answer`, or `null` when it is none: an
 * option, a reply, or an `action-result` that passes the port's own
 * allow-list (`checkActionResultAnswer`).
 */
export function readInboxAnswer(value: unknown): InboxAnswer | null {
  const option = parse(optionAnswer, value);
  if (option.ok) {
    const { option: chosen, note } = option.value;
    return note === undefined
      ? { kind: "option", option: chosen }
      : { kind: "option", option: chosen, note };
  }
  const reply = parse(replyAnswer, value);
  if (reply.ok) return reply.value;
  const action = checkActionResultAnswer(value);
  return action.ok ? action.answer : null;
}

/** The files of a send, or `null` when one isn't strict base64url. */
export function readOutgoingFiles(
  files: Infer<typeof messagingBodies.send>["attachments"],
): OutgoingAttachment[] | null {
  const read: OutgoingAttachment[] = [];
  for (const { name, type, base64url } of files ?? []) {
    const bytes = decodeBase64url(base64url);
    if (bytes === undefined) return null;
    read.push({ name, type, bytes });
  }
  return read;
}

/** An attachment's read as JSON: its bytes as base64url, which an answer body can carry. */
export function attachmentAnswer(read: Extract<AttachmentRead, { outcome: "read" }>) {
  return { outcome: "read", type: read.type, base64url: encodeBase64url(read.bytes) } as const;
}

const refusalMessages: Readonly<Record<MessagingRefusal, string>> = {
  offline: "The source is offline. Nothing was sent.",
  "signed-out": "The source is signed out. Connect it again first.",
  "not-found": "The source has nothing with that ID.",
  "too-large": "A file is too large. Nothing was sent.",
  "unsupported-type": "The source doesn't take this type of file. Nothing was sent.",
  "bad-answer": "That answer doesn't fit the item.",
  "bad-members": "Those agents can't make a channel.",
  "not-supported": "The source has no channels.",
};

/** Every refusal the port has, so a client can tell one from the server's own error codes. */
export const messagingRefusals = Object.keys(refusalMessages) as readonly MessagingRefusal[];

/**
 * A refusal from the port as the route's answer: the refusal is the error's
 * code, 404 for `not-found` and 409 for the rest (`server.messaging-routes`).
 */
export function refusalResponse(reason: MessagingRefusal): Response {
  const body: ServerErrorBody = { code: reason, message: refusalMessages[reason] };
  return Response.json(body, { status: reason === "not-found" ? 404 : 409 });
}
