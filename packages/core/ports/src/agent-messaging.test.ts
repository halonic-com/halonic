import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import type {
  AgentMessaging,
  AnswerResult,
  InboxAnswer,
  MessagingId,
  MessagingSource,
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
      | "send"
      | "changes"
    >();
    expectTypeOf<AgentMessaging["answer"]>().parameters.toEqualTypeOf<
      [item: MessagingId, answer: InboxAnswer]
    >();
    expectTypeOf<AgentMessaging["answer"]>().returns.toEqualTypeOf<Promise<AnswerResult>>();
    expectTypeOf<AgentMessaging["send"]>().parameters.toEqualTypeOf<
      [conversation: MessagingId, body: string]
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
