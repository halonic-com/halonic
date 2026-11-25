// The rows of `halonic routines` that say "✕ Can't start", the line above the
// list that counts them and the reason each gets under it (HAL-14299,
// HAL-15607, C570, C672 #1). The other rows are in list.test.ts.

import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { runCli } from "../../run-cli.ts";
import {
  type AcmeRuns,
  acmeRunsSetup,
  makeAcmeRuns,
  removeAcmeRuns,
  writeFiles,
} from "../../test/acme-runs.ts";
import { type CapturedIo, captureIo } from "../../test/capture-io.ts";
import { routinesCommandWith } from "./command.ts";

const hint =
  "Routines start on time only while this workspace is open in Halonic Studio, or while `halonic serve` or `halonic routines watch` is running.";

/** The line above the list for `count` routines that can't start, each with its reason under it (C672 #1). */
const cantStartLine = (count: number) =>
  count === 1
    ? "! 1 routine can't start. The line under the list says why."
    : `! ${count} routines can't start. The lines under the list say why.`;
const agentReason = (name: string) =>
  `! ${name} can't start: Halonic can't run an agent on its own yet, only as a step in a workflow. Make a workflow with the agent as a step, then have the routine start that workflow.`;

let acmeRuns: AcmeRuns;

beforeEach(async () => {
  acmeRuns = await makeAcmeRuns("routines-list-cant-start");
});

afterEach(async () => {
  await removeAcmeRuns(acmeRuns);
});

/** A routine of the support hub that runs Support reply, with its trigger and more lines. */
function routine(id: string, name: string, trigger: string, ...more: string[]): string {
  return [
    `id: ${id}`,
    `name: ${name}`,
    `trigger: ${trigger}`,
    "run: { workflow: support-reply }",
    ...more,
    "",
  ].join("\n");
}

async function addRoutines(routines: Readonly<Record<string, string>>): Promise<void> {
  const files = Object.fromEntries(
    Object.entries(routines).map(([id, text]) => [
      `hubs/support/workflows/routines/${id}.routine.yaml`,
      text,
    ]),
  );
  await writeFiles(acmeRuns.acme, files);
}

async function routinesIn(...args: string[]): Promise<{ code: number; io: CapturedIo }> {
  return await routinesWith({}, ...args);
}

/** `halonic routines` with a secrets store that knows only `secrets`. */
async function routinesWith(
  secrets: Readonly<Record<string, string>>,
  ...args: string[]
): Promise<{ code: number; io: CapturedIo }> {
  const io = captureIo(acmeRuns.acme);
  const code = await runCli(
    ["routines", ...args],
    io,
    [routinesCommandWith(acmeRunsSetup(acmeRuns))],
    {
      secrets: { get: async (name) => secrets[name] ?? null },
    },
  );
  return { code, io };
}

verifies("cli.commands.routines.list", () => {
  it("lists a routine file that doesn't load with its error, never hiding it", async () => {
    await addRoutines({ broken: routine("broken", "Broken check", "{ every: 0m }") });

    const { code, io } = await routinesIn();

    expect(code).toBe(exitCode.failed);
    expect(io.stdout).toEqual([
      cantStartLine(1),
      'broken   Invalid file, line 3: use a number and a unit, e.g. "15m", "1h", "1d" (runs are placed from midnight UTC)   ✕ Can\'t start   Never ran',
      "! broken can't start until its file is fixed · halonic validate",
      hint,
    ]);
  });

  it("says Can't start for a routine whose file has errors, counts them above the list, and exits 1", async () => {
    await addRoutines({
      digest: routine("digest", "Friday digest", '{ schedule: "0 16 * * 5" }').replace(
        "support-reply",
        "weekly-digest",
      ),
      morning: routine("morning", "Morning check", '{ schedule: "0 8 * * *" }'),
    });

    const { code, io } = await routinesIn("--dir", ".");

    // The support hub has no workflow weekly-digest, so the routine's start would fail.
    expect(code).toBe(exitCode.failed);
    expect(io.stdout).toEqual([
      cantStartLine(1),
      "Friday digest   Fridays at 16:00   ✕ Can't start         Never ran",
      "Morning check   Daily at 08:00     Next tomorrow 08:00   Never ran",
      "! Friday digest can't start until its file is fixed · halonic validate --dir .",
      hint,
    ]);
  });

  it("says Can't start for a routine whose input lacks a field the first step reads", async () => {
    await writeFiles(acmeRuns.acme, {
      "hubs/support/workflows/announce.workflow.yaml": [
        "id: announce",
        "name: Announce",
        "initial: write",
        "states:",
        "  write:",
        "    type: task",
        "    agent: writer",
        '    input: "Write an announcement about: {{input.topic}}"',
        "    on: [{ to: done, event: done }]",
        "  done: { type: final }",
        "",
      ].join("\n"),
      "hubs/support/agents/writer.agent.yaml": "id: writer\nname: Writer\nmodel: test\n",
    });
    await addRoutines({
      monday: routine("monday", "Monday note", '{ schedule: "0 8 * * 1" }').replace(
        "support-reply",
        "announce",
      ),
    });

    const { code, io } = await routinesIn("--dir", ".");

    // C480 P5 (HAL-14777): the run would start with "Write an announcement about: ".
    expect(code).toBe(exitCode.failed);
    expect(io.stdout).toEqual([
      cantStartLine(1),
      "Monday note   Mondays at 08:00   ✕ Can't start   Never ran",
      "! Monday note can't start until its file is fixed · halonic validate --dir .",
      hint,
    ]);
  });

  it("says Can't start for the webhook routines halonic serve says won't start, and exits 1", async () => {
    await writeFiles(acmeRuns.acme, {
      "hubs/support/agents/writer.agent.yaml": "id: writer\nname: Writer\nmodel: test\n",
    });
    await addRoutines({
      hook: routine("hook", "Order hook", "{ webhook: { secret: order-hook } }"),
      "no-secret": routine("no-secret", "New mail", "{ webhook: { secret: mail-hook } }"),
      "to-agent": routine(
        "to-agent",
        "Agent on request",
        "{ webhook: { secret: order-hook } }",
      ).replace("workflow: support-reply", "agent: writer, prompt: Hi"),
    });

    const { code, io } = await routinesWith(
      { "order-hook": "order-hook-value-1234" },
      "--dir",
      ".",
    );

    // C570 #3: mail-hook has no value; the agent's routine has its own line (HAL-15607).
    expect(code).toBe(exitCode.failed);
    expect(io.stdout).toEqual([
      cantStartLine(1),
      "! 1 routine can't start on a web request · halonic serve --dir .",
      "Order hook         On a signed web request   No set time     Never ran",
      "New mail           On a signed web request   ✕ Can't start   Never ran",
      "Agent on request   On a signed web request   ✕ Can't start   Never ran",
      agentReason("Agent on request"),
      hint,
    ]);
  });

  it("says Can't start and why under the list for a routine that starts an agent", async () => {
    await writeFiles(acmeRuns.acme, {
      "hubs/support/agents/writer.agent.yaml": "id: writer\nname: Writer\nmodel: test\n",
    });
    await addRoutines({
      digest: routine("digest", "Daily digest", '{ schedule: "0 8 * * 1-5" }').replace(
        "run: { workflow: support-reply }",
        "run: { agent: writer, prompt: Write the digest. }",
      ),
    });

    const { code, io } = await routinesIn("--json");
    const listed = await routinesIn();

    // C600 #2 (HAL-15607): it said "Next tomorrow 08:00" for a run that never comes.
    expect(code).toBe(exitCode.ok);
    expect(JSON.parse(io.stdout.join("\n")).routines[0]).toMatchObject({
      nextRun: null,
      startsAgent: true,
    });
    expect(listed.io.stdout).toEqual([
      cantStartLine(1),
      "Daily digest   Weekdays at 08:00   ✕ Can't start   Never ran",
      agentReason("Daily digest"),
      hint,
    ]);
  });

  // C672 #1 (HAL-16096): the count left out the agent's routine, and the
  // missing agent's routine was told to make a workflow, while the missing
  // workflow's routine got no line at all.
  it("counts every Can't start row above the list and gives each its reason, file errors first", async () => {
    await writeFiles(acmeRuns.acme, {
      "hubs/support/agents/writer.agent.yaml": "id: writer\nname: Writer\nmodel: test\n",
    });
    await addRoutines({
      a: routine("a", "Ghost agent", '{ schedule: "0 9 * * 1" }').replace(
        "workflow: support-reply",
        "agent: nobody, prompt: Hi",
      ),
      b: routine("b", "Missing flow", '{ schedule: "0 9 * * 1" }').replace(
        "support-reply",
        "missing-flow",
      ),
      c: routine("c", "Real agent", '{ schedule: "0 9 * * 1" }').replace(
        "workflow: support-reply",
        "agent: writer, prompt: Hi",
      ),
    });

    const { code, io } = await routinesIn();

    expect(code).toBe(exitCode.failed);
    expect(io.stdout).toEqual([
      cantStartLine(3),
      "Ghost agent    Mondays at 09:00   ✕ Can't start   Never ran",
      "Missing flow   Mondays at 09:00   ✕ Can't start   Never ran",
      "Real agent     Mondays at 09:00   ✕ Can't start   Never ran",
      "! Ghost agent can't start until its file is fixed · halonic validate",
      "! Missing flow can't start until its file is fixed · halonic validate",
      agentReason("Real agent"),
      hint,
    ]);
  });
});
