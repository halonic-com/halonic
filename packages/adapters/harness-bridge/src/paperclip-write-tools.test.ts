import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { noOutsideCall } from "./fakes.test-helper.ts";
import { PaperclipWriteTools } from "./paperclip-write-tools.ts";
import type { Fetch } from "./pass-through.ts";

const key = "pcp_exampleexampleexample";
const signal = new AbortController().signal;

interface Sent {
  url: string;
  init: RequestInit;
}

/** The tools over a fake Paperclip that answers every call with `reply`, and what it was sent. */
function toolsWith(reply: () => Response, secret: string | null = key) {
  const sent: Sent[] = [];
  const fetch: Fetch = async (input, init) => {
    sent.push({ url: String(input), init: init ?? {} });
    return reply();
  };
  const tools = new PaperclipWriteTools({
    baseUrl: "https://paperclip.example",
    taskId: "task-1",
    secret: "PAPERCLIP_TASK_KEY",
    secrets: { get: async () => secret },
    fetch,
    limits: { timeoutMs: 1000, maxAnswerBytes: 10_000 },
  });
  return { tools, sent };
}

const commented = () =>
  new Response(JSON.stringify({ id: "c-1", createdAt: "now", authorAgentId: "private" }), {
    status: 201,
  });

verifies("harness-bridge.paperclip-write", () => {
  describe("PaperclipWriteTools", () => {
    it("lists two tools and none that cancels or reassigns", async () => {
      const { tools } = toolsWith(commented);
      expect((await tools.list()).map((tool) => tool.name)).toEqual([
        "paperclip_post_comment",
        "paperclip_set_status",
      ]);
    });

    it("sends acceptable calls to a person and refuses any other name", async () => {
      const { tools } = toolsWith(commented);
      expect(await tools.check("paperclip_post_comment", { body: "Hi" })).toEqual({
        kind: "ask",
        connector: "paperclip",
      });
      expect(await tools.check("paperclip_set_status", { status: "in_review" })).toEqual({
        kind: "ask",
        connector: "paperclip",
      });
      expect(await tools.check("paperclip_reassign", { agent: "x" })).toMatchObject({
        kind: "refused",
      });
    });

    it.each([
      ["a status that cancels", "paperclip_set_status", { status: "cancelled" }],
      ["an empty comment", "paperclip_post_comment", { body: " " }],
      ["a task the tool doesn't offer", "paperclip_post_comment", { body: "x", taskId: "other" }],
    ])("refuses %s without asking or writing", async (_name, tool, args) => {
      const { tools, sent } = toolsWith(commented);
      expect(await tools.check(tool, args)).toMatchObject({ kind: "refused" });
      expect((await tools.call(tool, args, { signal })).outcome).toBe("error");
      expect(sent).toEqual([]);
    });

    it("posts a comment with one POST and returns only its id", async () => {
      const { tools, sent } = toolsWith(commented);
      const answer = await tools.call("paperclip_post_comment", { body: "Hi" }, { signal });
      expect(answer.outcome).toBe("ok");
      expect(JSON.parse(answer.result)).toEqual({ id: "c-1", createdAt: "now" });
      expect(sent[0]?.url).toBe("https://paperclip.example/api/issues/task-1/comments");
      expect(sent[0]?.init.method).toBe("POST");
      expect(sent[0]?.init.redirect).toBe("manual");
      expect(JSON.parse(String(sent[0]?.init.body))).toEqual({ body: "Hi" });
      expect(new Headers(sent[0]?.init.headers).get("authorization")).toBe(`Bearer ${key}`);
    });

    it("changes only the status", async () => {
      const { tools, sent } = toolsWith(
        () => new Response(JSON.stringify({ id: "task-1", status: "blocked" })),
      );
      const answer = await tools.call("paperclip_set_status", { status: "blocked" }, { signal });
      expect(JSON.parse(answer.result)).toEqual({ id: "task-1", status: "blocked" });
      expect(sent[0]?.url).toBe("https://paperclip.example/api/issues/task-1");
      expect(sent[0]?.init.method).toBe("PATCH");
      expect(JSON.parse(String(sent[0]?.init.body))).toEqual({ status: "blocked" });
    });

    it("names only the status when Paperclip refuses, never its words or the key", async () => {
      const { tools } = toolsWith(() => new Response(`bad ${key}`, { status: 500 }));
      const answer = await tools.call("paperclip_post_comment", { body: "Hi" }, { signal });
      expect(answer.outcome).toBe("error");
      expect(answer.result).toContain("500");
      expect(answer.result).not.toContain(key);
      expect(answer.result).not.toContain("bad");
    });

    it("doesn't call Paperclip when the secret isn't set, and names the secret", async () => {
      const { tools, sent } = toolsWith(commented, null);
      const answer = await tools.call("paperclip_post_comment", { body: "Hi" }, { signal });
      expect(answer.outcome).toBe("error");
      expect(answer.result).toContain("PAPERCLIP_TASK_KEY");
      expect(sent).toEqual([]);
    });

    it("says only that Paperclip could not be reached when the network fails", async () => {
      const tools = new PaperclipWriteTools({
        baseUrl: "https://paperclip.example",
        taskId: "task-1",
        secret: "S",
        secrets: { get: async () => key },
        fetch: async () => {
          throw new Error(`connect failed for ${key}`);
        },
      });
      const answer = await tools.call("paperclip_post_comment", { body: "Hi" }, { signal });
      expect(answer).toEqual({ result: "Paperclip could not be reached.", outcome: "error" });
    });

    it.each([
      ["an address with a path", "https://paperclip.example/x", "task-1"],
      ["an address that isn't http", "ftp://paperclip.example", "task-1"],
      ["an address with credentials", "https://u:p@paperclip.example", "task-1"],
      ["a task id with a slash", "https://paperclip.example", "a/b"],
    ])("refuses %s", (_name, baseUrl, taskId) => {
      expect(
        () =>
          new PaperclipWriteTools({
            baseUrl,
            taskId,
            secret: "S",
            secrets: { get: async () => null },
            fetch: noOutsideCall,
          }),
      ).toThrow(RangeError);
    });
  });
});
