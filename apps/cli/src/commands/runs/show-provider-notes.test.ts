import type { RunEventBody } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { runCli } from "../../run-cli.ts";
import {
  type AcmeRuns,
  acmeRunsSetup,
  makeAcmeRuns,
  removeAcmeRuns,
  type StoredRun,
  storeRuns,
  today,
  writeFiles,
} from "../../test/acme-runs.ts";
import { captureIo } from "../../test/capture-io.ts";
import { runsCommandWith } from "./command.ts";

const leftOut = "Left out temperature: claude-sonnet-5-5 doesn't take it.";

let acmeRuns: AcmeRuns;

/** Mail triage: Writer reads the email, then the run ends. */
const mailTriage = [
  "id: mail-triage",
  "name: Mail triage",
  "initial: read",
  "states:",
  "  read:",
  "    description: Read the email",
  "    agent: writer",
  "    on:",
  "      - to: done",
  "  done:",
  "    type: final",
  "",
].join("\n");

beforeEach(async () => {
  acmeRuns = await makeAcmeRuns("runs-show-notes");
  await writeFiles(acmeRuns.acme, {
    "hubs/support/workflows/mail-triage.workflow.yaml": mailTriage,
    "hubs/support/agents/writer.agent.yaml": "id: writer\nname: Writer\ninstructions: Read it.\n",
  });
});

afterEach(async () => {
  await removeAcmeRuns(acmeRuns);
});

/** One model call of the read step, with the given notes. */
function response(notes: string[]): RunEventBody {
  return {
    type: "llm.response",
    agent: "writer",
    provider: "anthropic",
    model: "claude-sonnet-5-5",
    usage: { inputTokens: 10, outputTokens: 5 },
    latencyMs: 300,
    text: "",
    notes,
  };
}

/** A finished Mail triage run whose read step made three model calls that each have `notes`. */
function triagedWith(notes: string[]): StoredRun {
  return {
    id: "run_mfx3k2a1_0a0b0c",
    workflowId: "mail-triage",
    start: today("10:20:00"),
    after: [
      [today("10:20:00"), { type: "state.entered", state: "read" }],
      [today("10:20:00"), { type: "agent.started", state: "read", agent: "writer", prompt: "" }],
      [today("10:20:00"), response(notes)],
      [today("10:20:01"), response(notes)],
      [today("10:20:01"), response(notes)],
      [today("10:20:01"), { type: "state.entered", state: "done" }],
      [today("10:20:18"), { type: "run.completed", state: "done", context: {} }],
    ],
  };
}

async function show(): Promise<{ code: number; stdout: readonly string[] }> {
  const io = captureIo(acmeRuns.acme);
  const code = await runCli(["runs", "show", "0a0b0c"], io, [
    runsCommandWith(acmeRunsSetup(acmeRuns)),
  ]);
  return { code, stdout: io.stdout };
}

verifies("cli.run-provider-notes", () => {
  it("shows each note once, after the step lines and before the ending", async () => {
    await storeRuns(acmeRuns, triagedWith([leftOut]));

    const { code, stdout } = await show();

    expect(code).toBe(exitCode.ok);
    expect(stdout).toEqual([
      "Mail triage in Acme · run 0a0b0c · started 10:20, finished 10:20",
      "",
      "✓ Read the email   Writer · default   1 s",
      "",
      leftOut,
      "",
      "✓ Mail triage finished in 18 s.",
      "  Sent nothing",
    ]);
  });

  it("shows no note line for a run without notes", async () => {
    await storeRuns(acmeRuns, triagedWith([]));

    const { stdout } = await show();

    expect(stdout.slice(2, 5)).toEqual([
      "✓ Read the email   Writer · default   1 s",
      "",
      "✓ Mail triage finished in 18 s.",
    ]);
  });
});
