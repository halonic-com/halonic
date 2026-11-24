import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import type {
  PaperclipAnswerResult,
  PaperclipCardAnswer,
  PaperclipCommentResult,
  PaperclipItemId,
  PaperclipRead,
  PaperclipSource,
  PaperclipTask,
} from "./index.ts";

// Type tests: `tsc -p tsconfig.test.json` checks them. Each `@ts-expect-error`
// fails the typecheck if the line it marks ever starts to compile.

const chief: PaperclipItemId = { connection: "acme", company: "acme-co", id: "agent-1" };

verifies("ports.paperclip-source", () => {
  typeTest("makes only the fixed list of calls", () => {
    expectTypeOf<keyof PaperclipSource>().toEqualTypeOf<
      | "connection"
      | "company"
      | "listAgents"
      | "listProjects"
      | "listTasks"
      | "listComments"
      | "listCards"
      | "answerCard"
      | "commentOnChat"
    >();
    expectTypeOf<PaperclipSource["listTasks"]>().returns.toEqualTypeOf<
      Promise<PaperclipRead<PaperclipTask>>
    >();
    expectTypeOf<PaperclipSource["answerCard"]>().parameters.toEqualTypeOf<
      [card: PaperclipItemId, answer: PaperclipCardAnswer]
    >();
    expectTypeOf<PaperclipSource["answerCard"]>().returns.toEqualTypeOf<
      Promise<PaperclipAnswerResult>
    >();
    expectTypeOf<PaperclipSource["commentOnChat"]>().parameters.toEqualTypeOf<
      [task: PaperclipItemId, body: string]
    >();
    expectTypeOf<PaperclipSource["commentOnChat"]>().returns.toEqualTypeOf<
      Promise<PaperclipCommentResult>
    >();
  });

  it("names every item by its connection, company and Paperclip ID", () => {
    // @ts-expect-error: a key such as HAL-10 repeats across instances, so the connection is required
    const keyOnly: PaperclipItemId = { company: "acme-co", id: "agent-1" };
    // @ts-expect-error: the company is required too
    const noCompany: PaperclipItemId = { connection: "acme", id: "agent-1" };
    expect(chief.connection).toBe("acme");
    expect([keyOnly, noCompany]).toHaveLength(2);
  });

  it("refuses a write rather than queueing it", () => {
    const offline: PaperclipAnswerResult = { outcome: "refused", reason: "offline" };
    // @ts-expect-error: no write is queued to send later
    const queued: PaperclipAnswerResult = { outcome: "queued" };
    expect(offline.outcome).toBe("refused");
    expect(queued).toBeDefined();
  });
});
