import { MemorySecrets } from "@halonicjs/adapter-memory";
import { RunHistory } from "@halonicjs/app";
import type { PasswordHasher } from "@halonicjs/ports";
import { verifies, waitUntil } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { runCli } from "../../run-cli.ts";
import { openSecretStore } from "../../secret-host.ts";
import {
  type AcmeRuns,
  acmeRunsSetup,
  makeAcmeRuns,
  removeAcmeRuns,
  trustAcmeRuns,
  writeFiles,
} from "../../test/acme-runs.ts";
import { captureIo } from "../../test/capture-io.ts";
import {
  acme,
  canaryKey,
  FakePaperclip,
  watchedTask,
  watcherPassPath,
  writeConnection,
} from "../../test/fake-paperclip.ts";
import { fakeSignals } from "../../test/fake-signals.ts";
import { type FakeTime, fakeTime, wokenUp } from "../../test/fake-time.ts";
import { engineStart } from "../../test/run-setup.ts";
import { openWorkspaceRuns } from "../../workspace-runs.ts";
import { serveCommandWith } from "./command.ts";
import { paperclipKeySecretName } from "./serve-messaging.ts";

// A served routine reaches Paperclip only through its workflow's tool steps and the stored key
// (HAL-19721): it reads the PR watcher's pass, decides in a rule step, and wakes the author.

/** The first start opens the engine, the rule worker and the listener from cold imports. */
const slow = { timeout: 60_000 };

const password = "acme-owner-password";

/** A hasher whose hash is plain to read: these tests are about the key, not the password. */
const plainHasher: PasswordHasher = {
  hash: async (text) => `plain:${text}`,
  verify: async (text, hash) => hash === `plain:${text}`,
  needsRehash: () => false,
};

/** Reads the pass, picks the pull requests with red checks, and wakes the first one's author. */
const watchWorkflow = [
  "id: watch",
  "name: Watch",
  "initial: read",
  "states:",
  "  read:",
  "    type: tool",
  "    connector: paperclip",
  "    tool: pr-watcher-pass",
  "    output: pass",
  "    on:",
  "      - to: decide",
  "        event: done",
  "  decide:",
  "    type: rule",
  "    rule: rules/red.rule.js",
  "    input:",
  '      prs: "{{context.pass.input.prs}}"',
  "    output: decision",
  "    on:",
  "      - to: wake",
  "        event: done",
  "  wake:",
  "    type: tool",
  "    connector: paperclip",
  "    tool: wake",
  "    with:",
  '      task: "{{context.decision.task}}"',
  '      agent: "{{context.decision.agent}}"',
  '      comment: "{{context.decision.comment}}"',
  "    output: woken",
  "    on:",
  "      - to: done",
  "        event: done",
  "  done:",
  "    type: final",
  "",
].join("\n");

const redRule = [
  "export function run(ctx) {",
  '  const red = ctx.input.prs.filter((pr) => pr.checks === "red")[0];',
    '  return { task: red.task, agent: red.author, comment: "ci-ok is red on #" + red.number + "." };',
  "}",
  "",
].join("\n");

/** The workspace's connector: the pass runs unasked, `wake` asks a person first. */
const paperclipConnector = [
  "id: paperclip",
  "name: Paperclip",
  "transport:",
  "  paperclip:",
  "    connection: halonic",
  "tools:",
  "  allow: [pr-watcher-pass, wake]",
  "  read: [pr-watcher-pass]",
  "",
].join("\n");

let acmeRuns: AcmeRuns;
let paperclip: FakePaperclip;
let running: { signals: ReturnType<typeof fakeSignals>; serving: Promise<number> } | undefined;

beforeEach(async () => {
  acmeRuns = await makeAcmeRuns("serve-paperclip-tools");
  paperclip = new FakePaperclip();
  await writeConnection(acmeRuns.acme, "halonic", { label: "Halonic", ...acme });
  await writeFiles(acmeRuns.acme, {
    "hubs/watch/hub.yaml": "id: watch\nname: Watch\n",
    "hubs/watch/library/connectors/paperclip.connector.yaml": paperclipConnector,
    "hubs/watch/rules/red.rule.js": redRule,
    "hubs/watch/workflows/watch.workflow.yaml": watchWorkflow,
    "hubs/watch/workflows/routines/watch.routine.yaml":
      "id: watch\nname: Watch\ntrigger: { every: 10m }\nrun: { workflow: watch }\n",
  });
  // Writes ask for a trusted workspace: the connector's writes are made only with a grant.
  await trustAcmeRuns(acmeRuns);
});

afterEach(async () => {
  if (running !== undefined) {
    running.signals.send("SIGINT");
    await running.serving.catch(() => undefined);
    running = undefined;
  }
  await removeAcmeRuns(acmeRuns);
});

/**
 * Starts `halonic serve` with the sign-in password on the fake time, and gives its address and a
 * signed-in session once its scheduler's first tick, which only records the time, has settled.
 */
async function startServe(time: FakeTime): Promise<{ address: string; cookie: string }> {
  const setup = acmeRunsSetup(acmeRuns);
  const io = captureIo(acmeRuns.acme);
  const signals = fakeSignals();
  const command = serveCommandWith({
    ...setup,
    hasher: plainHasher,
    paperclipFetch: paperclip.fetch,
    studioFolder: null,
    engine: { ...setup.engine, clock: time.clock, setTimer: time.setTimer },
  });
  const serving = runCli(["serve", "--port", "0"], io, [command], {
    secrets: new MemorySecrets({ "serve-password": `plain:${password}` }),
    stop: { signals, exitNow: () => undefined },
  });
  running = { signals, serving };
  await waitUntil("the server to print its address", () => io.stdout.length >= 1, slow);
  const found = /(http:\/\/localhost:\d+)/u.exec(io.stdout[0] ?? "");
  if (found?.[1] === undefined) throw new Error(`No address in ${JSON.stringify(io.stdout)}.`);
  const address = found[1];
  const cookie = await signIn(address);
  // A tick comes a minute after the engine opened at 14:01.
  time.set("2026-11-10T14:02:00.000Z");
  await waitUntil(
    "the first tick",
    async () => {
      wokenUp(time);
      const health = await fetch(`${address}/api/routines/health`, { headers: { cookie } });
      return ((await health.json()) as { lastTick: string | null }).lastTick !== null;
    },
    slow,
  );
  return { address, cookie };
}

/** Whether a run with `status` has ended. */
const ended = (status: string): boolean => status !== "running" && status !== "waiting";

/** The one run of the routine, once it has started at the 14:10 tick. */
async function routineRun(time: FakeTime, until: (status: string) => boolean) {
  time.set("2026-11-10T14:10:05.000Z");
  let found: { id: string; status: string } | undefined;
  await waitUntil(
    "the routine's run",
    async () => {
      wokenUp(time);
      const store = await openWorkspaceRuns(acmeRuns.acme, acmeRuns.profile);
      found = (await new RunHistory(store).listRuns()).runs[0];
      return found !== undefined && until(found.status);
    },
    slow,
  );
  if (found === undefined) throw new Error("No run.");
  return found;
}

/** Signs in with the password and answers the session cookie. */
async function signIn(address: string): Promise<string> {
  const answer = await fetch(`${address}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
  });
  const cookie = answer.headers.get("set-cookie")?.split(";")[0];
  if (answer.status !== 200 || cookie === undefined) throw new Error("The test couldn't sign in.");
  return cookie;
}

/** What the tool steps sent: every request but the server's messaging reads. */
function toolStepRequests(): string[] {
  return paperclip.seen
    .map((request) => ({ ...request, url: new URL(request.url) }))
    .filter(({ url }) => url.pathname === watcherPassPath || url.pathname === watchedTask)
    .map(({ method, url }) => `${method} ${url.pathname}${url.search}`);
}

verifies("cli.serve-paperclip-tools", () => {
  it(
    "reads the pass, runs the rule and wakes the author once a person approves, with exactly the listed requests",
    slow,
    async () => {
      await openSecretStore(acmeRuns.profile).set(
        paperclipKeySecretName("halonic"),
        JSON.stringify({ key: canaryKey, ...acme }),
      );
      const time = fakeTime(engineStart);
      const { address, cookie } = await startServe(time);
      const waiting = await routineRun(time, (status) => status === "waiting");
      // The read ran unasked; the write waits for a person and has sent nothing yet.
      expect(toolStepRequests()).toEqual([`GET ${watcherPassPath}?companyId=${acme.company}`]);
      const approved = await fetch(`${address}/api/runs/${waiting.id}/events`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ event: "approve" }),
      });
      expect(approved.status).toBe(200);
      expect((await routineRun(time, ended)).status).toBe("completed");
      expect(toolStepRequests()).toEqual([
        `GET ${watcherPassPath}?companyId=${acme.company}`,
        `GET ${watchedTask}`,
        `PATCH ${watchedTask}`,
      ]);
      expect(paperclip.seen.at(-1)?.body).toEqual({
        assigneeAgentId: "agent-ada",
        status: "todo",
        comment: "ci-ok is red on #12.",
      });
      expect(
        paperclip.seen.every(({ authorization }) => authorization === `Bearer ${canaryKey}`),
      ).toBe(true);
    },
  );
});

// The same run as a routine's: with no stored key it fails, and shows as a failed routine run.
verifies("server.routines", () => {
  it("fails the run with signed-out and sends nothing when no key is stored", slow, async () => {
    const time = fakeTime(engineStart);
    await startServe(time);
    const run = await routineRun(time, ended);
    expect(run.status).toBe("failed");
    const events = await (await openWorkspaceRuns(acmeRuns.acme, acmeRuns.profile)).events(run.id);
    expect(events.at(-1)).toMatchObject({
      type: "run.failed",
      state: "read",
      error: expect.stringContaining("signed-out"),
    });
    expect(paperclip.seen).toEqual([]);
  });
});
