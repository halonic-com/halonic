import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import type {
  AgentMessaging,
  AnswerResult,
  Attachment,
  AttachmentRead,
  InboxAnswer,
  InboxItem,
  Message,
  MessagingId,
  MessagingRefusal,
  MessagingSource,
  OutgoingAttachment,
  SendResult,
} from "./index.ts";

// Type tests: `tsc -p tsconfig.test.json` checks them. Each `@ts-expect-error`
// fails the typecheck if the line it marks ever starts to compile.

verifies("ports.agent-messaging", () => {
  typeTest("has the calls apps need and no provider's", () => {
    expectTypeOf<keyof AgentMessaging>().toEqualTypeOf<
      | "listSources"
      | "listAgents"
      | "listConversations"
      | "listMessages"
      | "listInboxItems"
      | "listWork"
      | "search"
      | "answer"
      | "readAttachment"
      | "send"
      | "changes"
    >();
    expectTypeOf<AgentMessaging["answer"]>().parameters.toEqualTypeOf<
      [item: MessagingId, answer: InboxAnswer]
    >();
    expectTypeOf<AgentMessaging["readAttachment"]>().parameters.toEqualTypeOf<
      [attachment: MessagingId]
    >();
    expectTypeOf<AgentMessaging["answer"]>().returns.toEqualTypeOf<Promise<AnswerResult>>();
    expectTypeOf<AgentMessaging["send"]>().toEqualTypeOf<
      (
        conversation: MessagingId,
        body: string,
        attachments?: readonly OutgoingAttachment[],
      ) => Promise<SendResult>
    >();
    expectTypeOf<AgentMessaging["send"]>().returns.toEqualTypeOf<Promise<SendResult>>();
    expectTypeOf<AgentMessaging["changes"]>().returns.toEqualTypeOf<AsyncIterable<MessagingId>>();
  });

  it("says how fresh a source is, and offline as of when", () => {
    const offline: MessagingSource = {
      id: "source-1",
      provider: "paperclip",
      label: "Paperclip · Acme",
      state: { kind: "offline", asOf: "2026-11-24T14:02:00.000Z" },
    };
    // @ts-expect-error: offline always says as of when
    const unknownAge: MessagingSource = { ...offline, state: { kind: "offline" } };
    expect(offline.state.kind).toBe("offline");
    expect(unknownAge).toBeDefined();
  });

  it("refuses a write rather than queueing it", () => {
    const refused: AnswerResult = { outcome: "refused", reason: "offline" };
    // @ts-expect-error: no write is queued to send later
    const queued: SendResult = { outcome: "queued" };
    expect(refused.outcome).toBe("refused");
    expect(queued).toBeDefined();
  });
});

verifies("ports.agent-messaging-attachments", () => {
  typeTest(
    "lists attachments on items and messages, by name, type and size, with no address",
    () => {
      expectTypeOf<keyof Attachment>().toEqualTypeOf<"id" | "name" | "type" | "size">();
      expectTypeOf<InboxItem["attachments"]>().toEqualTypeOf<readonly Attachment[]>();
      expectTypeOf<Message["attachments"]>().toEqualTypeOf<readonly Attachment[]>();
      expectTypeOf<AgentMessaging["readAttachment"]>().returns.toEqualTypeOf<
        Promise<AttachmentRead>
      >();
    },
  );

  typeTest(
    "refuses a file sent with a message that is too large or of a type it won't take",
    () => {
      expectTypeOf<Extract<MessagingRefusal, "too-large" | "unsupported-type">>().toEqualTypeOf<
        "too-large" | "unsupported-type"
      >();
    },
  );

  it("gives an attachment's bytes, or refuses the read", () => {
    const read: AttachmentRead = { outcome: "read", bytes: new Uint8Array([1]), type: "image/png" };
    const refused: AttachmentRead = { outcome: "refused", reason: "offline" };
    // @ts-expect-error: an app never gets an address to load the file from itself
    const address: AttachmentRead = { outcome: "read", url: "https://acme.example/a.png" };
    expect(read.outcome).toBe("read");
    expect(refused.outcome).toBe("refused");
    expect(address).toBeDefined();
  });
});
