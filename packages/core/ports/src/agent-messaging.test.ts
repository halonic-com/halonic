import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import {
  type AgentMessaging,
  type AnswerResult,
  type Attachment,
  type AttachmentRead,
  channelMembersFit,
  type InboxAnswer,
  type InboxItem,
  type InboxItemOption,
  type Message,
  type MessageSendOptions,
  type MessageWork,
  type MessagingAgent,
  type MessagingId,
  type MessagingRefusal,
  type MessagingSource,
  messageWorkReasonMax,
  type OutgoingAttachment,
  type SendResult,
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
      | "startChannel"
      | "setMembers"
      | "browseChannels"
      | "joinChannel"
      | "leaveChannel"
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
        options?: MessageSendOptions,
      ) => Promise<SendResult>
    >();
    // Who is addressed is a list of IDs; nothing names an author.
    expectTypeOf<keyof MessageSendOptions>().toEqualTypeOf<"to">();
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

  it("fits a channel of 2 to 8 agents of one source with the lead among them", () => {
    const agents: MessagingAgent[] = ["a", "b", "c", "d", "e", "f", "g", "h", "i"].map((id) => ({
      id,
      source: id === "i" ? "globex" : "acme",
      name: id,
      activity: "idle",
    }));
    const eight = ["a", "b", "c", "d", "e", "f", "g", "h"];

    expect(channelMembersFit(["a", "b"], "a", agents)).toBe(true);
    expect(channelMembersFit(eight, "h", agents)).toBe(true);
    expect(channelMembersFit(["a"], "a", agents)).toBe(false);
    expect(channelMembersFit([...eight, "i"], "a", agents)).toBe(false);
    expect(channelMembersFit(["a", "i"], "a", agents)).toBe(false);
    expect(channelMembersFit(["a", "b"], "c", agents)).toBe(false);
    expect(channelMembersFit(["a", "a"], "a", agents)).toBe(false);
    expect(channelMembersFit(["a", "unknown"], "a", agents)).toBe(false);
  });

  it("gives a failed work line a reason, shown cut to 300 characters", () => {
    const failed: MessageWork = {
      agent: "elena",
      state: "failed",
      reason: "Build broke",
      since: "2026-11-25T10:00:00.000Z",
    };

    expectTypeOf(failed.reason).toEqualTypeOf<string | undefined>();
    expect(messageWorkReasonMax).toBe(300);
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

verifies("ports.agent-messaging-avatars", () => {
  typeTest("gives an agent's picture as an optional ID", () => {
    expectTypeOf<MessagingAgent["avatar"]>().toEqualTypeOf<MessagingId | undefined>();
  });

  it("holds no address for an agent's picture", () => {
    const agent: MessagingAgent = {
      id: "acme:ada",
      source: "acme",
      name: "Ada",
      activity: "idle",
      avatar: "acme:avatar:ada.png",
    };
    // @ts-expect-error: an app never gets an address to load the picture from itself
    const address: MessagingAgent = { ...agent, avatarUrl: "https://acme.example/ada.png" };
    expect(agent.avatar).toBeDefined();
    expect(address).toBeDefined();
  });
});

verifies("ports.agent-messaging-inbox-conversation", () => {
  typeTest("names the conversation an inbox item was asked in as an optional ID", () => {
    expectTypeOf<InboxItem["conversation"]>().toEqualTypeOf<MessagingId | undefined>();
  });

  it("takes an item with no conversation", () => {
    const item: InboxItem = {
      id: "acme:item:1",
      source: "acme",
      from: { kind: "agent", agent: "acme:ada", name: "Ada" },
      question: "Ship it?",
      options: [],
      attachments: [],
      createdAt: "2026-11-25T10:00:00Z",
      state: { kind: "open" },
    };
    const asked: InboxItem = { ...item, conversation: "acme:chat:1" };
    expect(item.conversation).toBeUndefined();
    expect(asked.conversation).toBe("acme:chat:1");
  });
});

verifies("ports.agent-messaging-option-note", () => {
  typeTest("lets an option label its note field, optionally", () => {
    expectTypeOf<InboxItemOption["noteLabel"]>().toEqualTypeOf<string | undefined>();
  });

  it("takes options with and without a note, and the note in the option answer", () => {
    const plain: InboxItemOption = { id: "approve", label: "Approve" };
    const noted: InboxItemOption = {
      id: "request-changes",
      label: "Request changes",
      noteRequired: true,
      noteLabel: "What should change?",
    };
    const answer: InboxAnswer = { kind: "option", option: noted.id, note: "Lower the budget" };
    expect(plain.noteLabel).toBeUndefined();
    expect(noted).toMatchObject({ noteRequired: true, noteLabel: "What should change?" });
    expect(answer).toMatchObject({ option: "request-changes", note: "Lower the budget" });
  });
});
