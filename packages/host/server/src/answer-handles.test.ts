import type { RunSummary, WaitingPoint } from "@halonicjs/events";
import type { RunExecutor, RunStore } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { handlesFor, sendBodyOf } from "./answer-handles.ts";
import type { Server } from "./api.ts";
import type { AnswerHandleStore, ManyUserPorts, StoredAnswer } from "./many-users-api.ts";
import { memoryAnswerHandles } from "./memory-answer-handles.test-helper.ts";
import { memoryRunOwnership } from "./memory-run-ownership.test-helper.ts";
import { ids, StubSessionVerifier } from "./stub-session-verifier.test-helper.ts";
import { testServer, unusedPort } from "./test-server.ts";

const host = "deploy.acme.example";
const since = "2026-11-26T10:00:00.000Z";
const approval: WaitingPoint = { kind: "approval", callId: "call-1" };
const question: WaitingPoint = { kind: "question", state: "check", events: ["ok", "redo"] };
const message: WaitingPoint = { kind: "message", state: "chat", event: "message" };

/** Alice's waiting runs in her organisation, and what the engine was sent. */
function setup(answers: AnswerHandleStore | undefined = memoryAnswerHandles()) {
  const waiting = { status: "waiting", approvals: [] } as unknown as RunSummary;
  const runs = new Map([
    ["run_a", { ...waiting, id: "run_a" }],
    ["run_b", { ...waiting, id: "run_b" }],
  ]);
  const sent: unknown[][] = [];
  let refuse = false;
  const executor = {
    send: async (...args: unknown[]) => {
      sent.push(args);
      if (refuse) throw new Error("the run doesn't wait on this");
      return { ...runs.get(String(args[0])), context: { secret: "never shown" } };
    },
  } as unknown as RunExecutor;
  const runStore = {
    get: async (runId: string) => runs.get(runId) ?? null,
    list: async () => [...runs.values()],
  } as unknown as Pick<RunStore, "get" | "list">;
  const ownership = memoryRunOwnership({
    run_a: { startedBy: ids.alice, visibility: "private" },
    run_b: { startedBy: ids.alice, visibility: "private" },
  });
  const manyUsers: ManyUserPorts = {
    verifier: new StubSessionVerifier({
      "alice-token": { aud: "app", sub: ids.alice, scope: `o/${ids.acme}`, role: "member" },
    }),
    cookieName: "acme-session",
    scopedRuns: () => ({ runs: executor, runStore, ownership, ...(answers ? { answers } : {}) }),
  };
  const server = testServer({
    passwordHash: null,
    runs: unusedPort("the unscoped runs"),
    runStore: unusedPort("the unscoped run store"),
    secrets: unusedPort("secrets"),
    trust: { check: async () => ({ state: "trusted", message: "Trusted." }) },
    config: { allowedHosts: [host], maxBodyBytes: 4096 },
    manyUsers,
  });
  return { server, sent, refuseNext: () => (refuse = true) };
}

async function answer(server: Server, runId: string, body: unknown) {
  const response = await server.handle(
    new Request(`https://${host}/api/runs/${runId}/events`, {
      method: "POST",
      headers: { host, authorization: "Bearer alice-token", "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: response.status, body: await response.text() };
}

async function stored(store: AnswerHandleStore, runId: string, point: WaitingPoint) {
  const handleOf = await handlesFor(store, runId, [point], since);
  return handleOf(point);
}

verifies("server.answer-handles", () => {
  describe("the answer route", () => {
    it("sends an approval for its call once, and answers with the run's id only", async () => {
      const answers = memoryAnswerHandles();
      const { server, sent } = setup(answers);
      const handle = await stored(answers, "run_a", approval);

      const first = await answer(server, "run_a", { handle, payload: { approved: true } });
      expect(first).toEqual({ status: 200, body: JSON.stringify({ id: "run_a" }) });
      expect(sent).toEqual([["run_a", "approve", undefined, { callId: "call-1" }]]);

      const again = await answer(server, "run_a", { handle, payload: { approved: true } });
      expect(again.status).toBe(404);
      expect(sent).toHaveLength(1);
    });

    it("answers a spent, an unknown and another run's handle the same", async () => {
      const answers = memoryAnswerHandles();
      const { server } = setup(answers);
      const spent = await stored(answers, "run_a", approval);
      await answer(server, "run_a", { handle: spent, payload: { approved: false } });
      const otherRuns = await stored(answers, "run_b", approval);
      const payload = { approved: true };

      const responses = [
        await answer(server, "run_a", { handle: spent, payload }),
        await answer(server, "run_a", { handle: "ah_neverMade", payload }),
        await answer(server, "run_a", { handle: otherRuns, payload }),
      ];
      expect(responses[0]?.status).toBe(404);
      expect(JSON.parse(responses[0]?.body ?? "")).toMatchObject({ code: "answer_not_found" });
      expect(responses[1]).toEqual(responses[0]);
      expect(responses[2]).toEqual(responses[0]);
    });

    it("answers every handle as unknown when the scope keeps none", async () => {
      const { server, sent } = setup(undefined);
      const response = await answer(server, "run_a", { handle: "ah_any", payload: {} });
      expect(JSON.parse(response.body)).toMatchObject({ code: "answer_not_found" });
      expect(sent).toEqual([]);
    });

    it("never takes an event name, a call id or a state from the caller", async () => {
      const answers = memoryAnswerHandles();
      const { server, sent } = setup(answers);
      const handle = await stored(answers, "run_a", approval);
      const payload = { approved: true };
      for (const extra of [{ event: "approve" }, { callId: "call-9" }, { state: "ship" }]) {
        const response = await answer(server, "run_a", { handle, payload, ...extra });
        expect(response.status, JSON.stringify(extra)).toBe(400);
      }
      expect((await answer(server, "run_a", { event: "approve" })).status).toBe(400);
      expect(sent).toEqual([]);
    });

    it("refuses a payload of the wrong shape without spending the handle", async () => {
      const answers = memoryAnswerHandles();
      const { server, sent } = setup(answers);
      const handle = await stored(answers, "run_a", question);

      expect((await answer(server, "run_a", { handle, payload: { choice: 2 } })).status).toBe(400);
      expect((await answer(server, "run_a", { handle, payload: { approved: true } })).status).toBe(
        400,
      );
      const chosen = await answer(server, "run_a", { handle, payload: { choice: 1 } });
      expect(chosen.status).toBe(200);
      expect(sent).toEqual([["run_a", "redo", undefined, { wait: { state: "check", since } }]]);
    });

    it("passes on the engine's refusal of a wait that moved on, and the handle is spent", async () => {
      const answers = memoryAnswerHandles();
      const { server, refuseNext } = setup(answers);
      const handle = await stored(answers, "run_a", message);
      refuseNext();
      const refused = await answer(server, "run_a", { handle, payload: { text: "Thanks" } });
      expect(refused.status).toBe(409);
      expect(await answers.get("run_a", handle)).toBeNull();
    });
  });

  describe("handles", () => {
    it("are random, and the same for two readers of one wait", async () => {
      const answers = memoryAnswerHandles();
      const first = await handlesFor(answers, "run_a", [approval, question], since);
      const second = await handlesFor(answers, "run_a", [approval, question], since);
      expect(first(approval)).toMatch(/^ah_[A-Za-z0-9_-]{43}$/);
      expect(first(approval)).not.toBe(first(question));
      expect(second(approval)).toBe(first(approval));
      expect(second(question)).toBe(first(question));
      expect(answers.size()).toBe(2);
    });

    it("are new for a later wait at the same step", async () => {
      const answers = memoryAnswerHandles();
      const earlier = await stored(answers, "run_a", question);
      const later = await handlesFor(answers, "run_a", [question], "2026-11-26T11:00:00.000Z");
      expect(later(question)).not.toBe(earlier);
    });

    it("turn each payload shape into what the engine is sent", () => {
      const at = (point: WaitingPoint): StoredAnswer => ({ point, waitingSince: since });
      const wait = (state: string) => ({ state, since });
      expect(sendBodyOf(at(approval), { approved: false })).toEqual({
        event: "reject",
        callId: "call-1",
      });
      expect(sendBodyOf(at(question), { choice: 0 })).toEqual({ event: "ok", wait: wait("check") });
      expect(sendBodyOf(at(message), { text: "Hello" })).toEqual({
        event: "message",
        payload: { text: "Hello" },
        wait: wait("chat"),
      });
      for (const [point, payload] of [
        [approval, { approved: "yes" }],
        [approval, { approved: true, comment: "ok" }],
        [question, { choice: -1 }],
        [question, { choice: 0.5 }],
        [message, { text: "" }],
        [message, { text: "x".repeat(20_001) }],
        [message, "Hello"],
      ] as const) {
        expect(sendBodyOf(at(point), payload), JSON.stringify(payload)).toBeNull();
      }
    });
  });
});
