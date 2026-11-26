import { readFileSync } from "node:fs";
import { verifies } from "@halonicjs/testing-spec";
import type { PluginApiRequestInput } from "@paperclipai/plugin-sdk";
import { expect, test } from "vitest";
import { loadSignals } from "../signals/load.ts";
import { ruleInputs } from "../signals/pr-watcher-input.ts";
import type { PrWatcherAction, PrWatcherSettings } from "../signals/rules/pr-watcher.ts";
import {
  fakeHost,
  fakeJobContext,
  type HostWrite,
  mergedGreenOnGitHub,
} from "./fake-host.test-helper.ts";
import type { LifecycleRunner } from "./fast-track-lifecycle-job.ts";
import { runWatcher } from "./job.ts";
import { handlePrWatcherPass, type PrWatcherPassAnswer } from "./pr-watcher-pass-route.ts";

const now = new Date("2026-11-22T07:20:00Z");
const token = { type: "secret_ref", secretId: "secret-pr-watcher" };

interface OpenPage {
  repository: { pullRequests: { nodes: { number: number; headRefName: string }[] } };
}

/**
 * The recorded open pull requests of 22 Nov, with #4485 merged green beside
 * them. #4952, red and conflicting, moves to Mateo's branch: the fake host
 * knows only Mateo, Priya and Liam.
 */
function recordedAnswers(): Record<string, unknown> {
  const file = new URL("../snapshot/recordings/halonic-22-nov.json", import.meta.url);
  const recording = JSON.parse(readFileSync(file, "utf8")) as { open: { data: OpenPage } };
  for (const pull of recording.open.data.repository.pullRequests.nodes) {
    if (pull.number === 4952) {
      pull.headRefName = "mateo/HAL-15916-doctor-plugin-records";
    }
  }
  return { ...mergedGreenOnGitHub, "graphql OpenPulls": recording.open.data };
}

/** HAL-4485's pull request merged green; HAL-15916's is open, red and conflicting, on Mateo's branch. */
const tasks = [
  {
    id: "task-4485",
    identifier: "HAL-4485",
    status: "in_progress",
    assigneeAgentId: "agent-priya",
  },
  {
    id: "task-15916",
    identifier: "HAL-15916",
    status: "in_progress",
    assigneeAgentId: "agent-mateo",
  },
];

/** The keys the watcher wrote: a done as `task|pulls|done`, each wake by its marker. */
function writtenKeys(writes: readonly HostWrite[]): string[] {
  const identifier = (issueId: string) => issueId.replace("task-", "HAL-");
  return writes.flatMap((write) => {
    if (write.kind === "update") {
      return [`${identifier(write.issueId)} done`];
    }
    if (write.kind !== "comment") {
      return [];
    }
    return [...write.body.matchAll(/<!-- pr-watcher: (.+?) -->/g)].map(
      (match) => `${identifier(write.issueId)} ${match[1]}`,
    );
  });
}

/** The keys the signal pass logged, in the same form. */
function loggedKeys(lines: readonly string[]): string[] {
  return lines.flatMap((line) =>
    [...line.matchAll(/would (?:wake|mark) (\S+) .*?\((.+?)\)\.$/gm)].map(([, task, key]) =>
      key?.endsWith("|done") ? `${task} done` : `${task} ${key}`,
    ),
  );
}

verifies("paperclip.signal-pass-in-watcher", () => {
  test("a pr-watch pass logs the same done and wake actions as the watcher writes, and writes nothing more", async () => {
    const { host, writes } = fakeHost(tasks);
    const { ctx, logs, sent } = fakeJobContext({
      host,
      configs: { acme: { githubToken: token, dryRun: false } },
      answers: recordedAnswers(),
    });
    await runWatcher(ctx, now);
    const lines = logs.map((log) => log.message).filter((line) => line.startsWith("Signal "));
    const written = writtenKeys(writes);
    expect(written).toContain("HAL-4485 done");
    expect(written.some((key) => key.startsWith("HAL-15916 "))).toBe(true);
    expect(loggedKeys(lines).sort()).toEqual([...written].sort());
    // The watcher's writes only: a done is an update and its comment, a wake its comment and wake-up.
    expect(writes.map((write) => write.kind).sort()).toEqual([
      "comment",
      "comment",
      "update",
      "wake",
    ]);
    for (const request of sent) {
      expect(request.method === "GET" || new URL(request.url).pathname === "/graphql").toBe(true);
    }
  });

  test("keeps its state, so a later pass logs no action twice", async () => {
    const { host } = fakeHost(tasks);
    const { ctx, logs } = fakeJobContext({
      host,
      configs: { acme: { githubToken: token } },
      answers: recordedAnswers(),
    });
    await runWatcher(ctx, now);
    const first = logs.filter((log) =>
      log.message.startsWith("Signal pr-watcher (dry run)"),
    ).length;
    expect(first).toBeGreaterThan(0);
    await runWatcher(ctx, now);
    const both = logs.filter((log) => log.message.startsWith("Signal pr-watcher (dry run)")).length;
    expect(both).toBe(first);
  });

  test("hands the watched tasks and the rule's actions to the PR watcher's lifecycle", async () => {
    const { host } = fakeHost(tasks);
    const { ctx } = fakeJobContext({
      host,
      configs: { acme: { githubToken: token } },
      answers: recordedAnswers(),
    });
    const handed: Parameters<LifecycleRunner["runPrWatcher"]>[] = [];
    const lifecycle: LifecycleRunner = {
      run: async () => {},
      runPrWatcher: async (...args) => {
        handed.push(args);
      },
    };
    await runWatcher(ctx, now, undefined, lifecycle);
    const [companyId, pass] = handed[0] ?? [];
    expect(companyId).toBe("acme");
    expect(pass?.tasks.map((task) => task.task).sort()).toEqual(["HAL-15916", "HAL-4485"]);
    expect(pass?.actions).toContainEqual(
      expect.objectContaining({ kind: "task-update", task: "HAL-4485" }),
    );
  });
});

/** The board's call to the pass route. */
const boardCall = {
  routeKey: "pr-watcher-pass",
  method: "GET",
  path: "/pr-watcher/pass",
  params: {},
  query: { companyId: "acme" },
  body: undefined,
  headers: {},
  companyId: "acme",
  actor: { actorType: "user", actorId: "user-1", userId: "user-1" },
} as unknown as PluginApiRequestInput;

/** An action in the form `writtenKeys` gives. */
function actionKey(action: PrWatcherAction): string {
  return action.kind === "task-update" ? `${action.task} done` : `${action.task} ${action.key}`;
}

verifies("paperclip.pr-watcher-pass-route", () => {
  test("after a pass, the route answers the rule's input and the actions the watcher wrote", async () => {
    const { host, writes } = fakeHost(tasks);
    const { ctx } = fakeJobContext({
      host,
      configs: { acme: { githubToken: token, dryRun: false } },
      answers: recordedAnswers(),
    });
    const handed: Parameters<LifecycleRunner["runPrWatcher"]>[1][] = [];
    await runWatcher(ctx, now, undefined, {
      run: async () => {},
      runPrWatcher: async (_companyId, pass) => {
        handed.push(pass);
      },
    });
    const response = await handlePrWatcherPass(boardCall, ctx);
    expect(response.status).toBe(200);
    const answer = response.body as PrWatcherPassAnswer;
    const plan = loadSignals(undefined).plans.get("pr-watcher");
    if (plan === undefined || plan === "off") throw new Error("the built-in pr-watcher is off");
    const settings = plan.settings as PrWatcherSettings;
    const { inputs } = ruleInputs(now.toISOString(), settings, handed[0]?.tasks ?? []);
    expect(inputs).toHaveLength(1);
    expect(answer.input).toEqual(inputs[0]);
    expect(answer.at).toBe(now.toISOString());
    expect(answer.truncated).toBe(false);
    expect(answer.actions.map(actionKey).sort()).toEqual(writtenKeys(writes).sort());
    // The rule decides the same, so the served workflow's dry run can compare with these.
    expect([...answer.actions].sort((a, b) => a.key.localeCompare(b.key))).toEqual(
      [...(handed[0]?.actions ?? [])].sort((a, b) => a.key.localeCompare(b.key)),
    );
  });
});
