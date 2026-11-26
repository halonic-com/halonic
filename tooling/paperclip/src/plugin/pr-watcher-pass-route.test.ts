import { verifies } from "@halonicjs/testing-spec";
import type { PluginApiRequestInput } from "@paperclipai/plugin-sdk";
import { expect, test } from "vitest";
import { maxInputBytes, ruleInputs } from "../signals/pr-watcher-input.ts";
import type {
  PrWatcherAction,
  PrWatcherSettings,
  WatchedTask,
} from "../signals/rules/pr-watcher.ts";
import { handlePrWatcherPass, passAnswer } from "./pr-watcher-pass-route.ts";

const now = "2026-11-26T12:00:00.000Z";
const settings: PrWatcherSettings = { done: true, wakeOn: ["ci-red", "conflict"] };
const empty = { now, settings, tasks: [] };

function call(actor: object): PluginApiRequestInput {
  return {
    routeKey: "pr-watcher-pass",
    method: "GET",
    path: "/pr-watcher/pass",
    params: {},
    query: { companyId: "acme" },
    body: undefined,
    headers: {},
    companyId: "acme",
    actor,
  } as unknown as PluginApiRequestInput;
}

const board = { actorType: "user", actorId: "user-1", userId: "user-1" };
const agent = { actorType: "agent", actorId: "a1", agentId: "a1", runId: "run-1" };

/** A state that remembers what was read. */
function readCountingState(stored: unknown) {
  const reads: unknown[] = [];
  return {
    reads,
    ctx: {
      state: {
        get: async (key: unknown) => {
          reads.push(key);
          return stored;
        },
        set: async () => {},
      },
    },
  };
}

/** An invented task with one open, red pull request. */
function task(n: number): WatchedTask {
  return {
    task: `ACME-${n}`,
    holder: "agent-acme",
    owner: "agent-acme",
    running: false,
    openChildren: false,
    parked: false,
    memory: { reported: [], seenUntil: null, heldAt: null, lastCommentAt: null },
    pulls: [
      {
        pr: `acme/app#${n}`,
        state: "open",
        head: "a".repeat(40),
        ciOkOnHead: "failure",
        draft: false,
        conflicting: false,
        inQueue: false,
        retargeted: false,
        latestReview: null,
        githubApproved: false,
        held: false,
        requiredFailed: [],
        landed: false,
        mergedAt: null,
      },
    ],
  };
}

function wake(n: number): PrWatcherAction {
  const head = "a".repeat(40);
  return {
    kind: "wake",
    key: `acme/app#${n} aaaaaaa ci-red`,
    task: `ACME-${n}`,
    pr: `acme/app#${n}`,
    head,
    reason: "ci-red",
  };
}

const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;

verifies("paperclip.pr-watcher-pass-route", () => {
  test("answers an agent 403 and reads nothing", async () => {
    const { ctx, reads } = readCountingState(null);
    expect((await handlePrWatcherPass(call(agent), ctx)).status).toBe(403);
    expect(reads).toEqual([]);
  });

  test("before the first pass, answers no input", async () => {
    const { ctx } = readCountingState(null);
    const response = await handlePrWatcherPass(call(board), ctx);
    expect(response).toEqual({
      status: 200,
      body: { at: null, input: null, actions: [], truncated: false },
    });
  });

  test("keeps the input whole and the actions on its tasks when they fit", () => {
    const tasks = [task(1), task(2)];
    const { inputs, tooLarge } = ruleInputs(now, settings, tasks);
    const answer = passAnswer(empty, inputs, tooLarge, [wake(1), wake(2)]);
    expect(answer).toEqual({
      at: now,
      input: inputs[0],
      actions: [wake(1), wake(2)],
      truncated: false,
    });
  });

  test("a pass with no watched task answers an empty input", () => {
    expect(passAnswer(empty, [], [], [])).toEqual({
      at: now,
      input: empty,
      actions: [],
      truncated: false,
    });
  });

  test("leaves tasks out from the end to stay under 16 KB, and says so", () => {
    const tasks = Array.from({ length: 80 }, (_, n) => task(n + 1));
    const { inputs, tooLarge } = ruleInputs(now, settings, tasks);
    expect(inputs.length).toBeGreaterThan(1);
    const answer = passAnswer(
      empty,
      inputs,
      tooLarge,
      tasks.map((_, n) => wake(n + 1)),
    );
    expect(bytes(answer)).toBeLessThanOrEqual(maxInputBytes);
    expect(answer.truncated).toBe(true);
    const kept = answer.input?.tasks.map((watched) => watched.task) ?? [];
    expect(kept).toEqual(tasks.slice(0, kept.length).map((watched) => watched.task));
    expect(answer.actions.map((action) => action.task)).toEqual(kept);
  });
});
