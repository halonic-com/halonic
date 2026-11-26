import type { RunEventBody, ToolFailureCause, ToolOutcome } from "@halonicjs/events";
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
  acmeRuns = await makeAcmeRuns("runs-show-failed-call");
  await writeFiles(acmeRuns.acme, {
    "hubs/support/workflows/mail-triage.workflow.yaml": mailTriage,
    "hubs/support/agents/writer.agent.yaml": "id: writer\nname: Writer\ninstructions: Read it.\n",
  });
});

afterEach(async () => {
  await removeAcmeRuns(acmeRuns);
});

const connectorStarted = (connector: string): RunEventBody => ({
  type: "connector.started",
  state: "read",
  agent: "writer",
  connector,
  timeoutMs: 60_000,
});

const called = (tool: string): RunEventBody => ({
  type: "tool.called",
  agent: "writer",
  tool,
  args: { query: "refund" },
});

const result = (tool: string, outcome: ToolOutcome, cause?: ToolFailureCause): RunEventBody => ({
  type: "tool.result",
  agent: "writer",
  tool,
  result: "Error: connect ECONNREFUSED",
  outcome,
  ...(cause === undefined ? {} : { cause }),
});

/** A finished Mail triage run whose read step logged `logged`, then wrote "Hi Sam,". */
function triagedAfter(logged: RunEventBody[]): StoredRun {
  return {
    id: "run_mfx3k2a1_0a0b0c",
    workflowId: "mail-triage",
    start: today("10:20:00"),
    after: [
      [today("10:20:00"), { type: "state.entered", state: "read" }],
      [today("10:20:00"), { type: "agent.started", state: "read", agent: "writer", prompt: "" }],
      ...logged.map((event): [string, RunEventBody] => [today("10:20:00"), event]),
      [
        today("10:20:01"),
        { type: "agent.finished", state: "read", agent: "writer", output: "Hi Sam," },
      ],
      [today("10:20:01"), { type: "state.entered", state: "done" }],
      [today("10:20:18"), { type: "run.completed", state: "done", context: {} }],
    ],
  };
}

async function show(...options: string[]): Promise<{ code: number; stdout: readonly string[] }> {
  const io = captureIo(acmeRuns.acme);
  const code = await runCli(["runs", "show", "0a0b0c", ...options], io, [
    runsCommandWith(acmeRunsSetup(acmeRuns)),
  ]);
  return { code, stdout: io.stdout };
}

verifies("cli.run-view-failed-call", () => {
  it("says under a step that kept its ✓ why its tool call didn't work, in Studio's words", async () => {
    await storeRuns(
      acmeRuns,
      triagedAfter([
        connectorStarted("notion"),
        called("search_pages"),
        result("search_pages", "unknown", { code: "time-limit", seconds: 60 }),
      ]),
    );

    const { code, stdout } = await show();

    expect(code).toBe(exitCode.ok);
    expect(stdout.slice(0, 4)).toEqual([
      "Mail triage in Acme · run 0a0b0c · started 10:20, finished 10:20",
      "",
      "✓ Read the email   Writer · default   1 s",
      "  Didn't work: the tool search_pages (notion) didn't answer within 60 seconds, so it may or may not have done its work.",
    ]);
  });

  it("says the service asked to slow down, in the words Studio's step panel says", async () => {
    await storeRuns(
      acmeRuns,
      triagedAfter([
        connectorStarted("notes-mcp"),
        called("create_note"),
        result("create_note", "error", {
          code: "service-refused",
          why: "slow-down",
          retries: 2,
          sentOnce: true,
        }),
      ]),
    );

    const { stdout } = await show();

    expect(stdout[3]).toBe(
      "  Didn't work: the service asked Halonic to slow down when the tool create_note (notes-mcp) called it, and still did after Halonic tried again twice. Try again in a few minutes. Nothing was sent twice.",
    );
  });

  it("says only that it didn't work when the log gives no reason, and never the tool's own text", async () => {
    await storeRuns(
      acmeRuns,
      triagedAfter([called("search_pages"), result("search_pages", "error")]),
    );

    const { stdout } = await show();

    expect(stdout.slice(2, 4)).toEqual([
      "✓ Read the email   Writer · default   1 s",
      "  Didn't work.",
    ]);
    expect(stdout.join("\n")).not.toContain("ECONNREFUSED");
  });

  it("gives a line only to the call that failed, and names a connector the log doesn't by its tool", async () => {
    await storeRuns(
      acmeRuns,
      triagedAfter([
        called("search_pages"),
        result("search_pages", "ok"),
        called("create_note"),
        result("create_note", "error", {
          code: "connector-not-started",
          why: "program-missing",
          name: "acme-notes-mcp",
        }),
      ]),
    );

    const { stdout } = await show();

    expect(stdout.slice(2, 5)).toEqual([
      "✓ Read the email   Writer · default   1 s",
      "  Didn't work: the connector of the tool create_note didn't start: its program acme-notes-mcp isn't on this computer.",
      "",
    ]);
  });

  it("puts the line above the step's output with --output", async () => {
    await storeRuns(
      acmeRuns,
      triagedAfter([called("search_pages"), result("search_pages", "unknown")]),
    );

    const { stdout } = await show("--output");

    expect(stdout.slice(2, 5)).toEqual([
      "✓ Read the email   Writer · default   1 s",
      "  Didn't work: the tool search_pages broke off without an answer, so it may or may not have done its work.",
      "  Hi Sam,",
    ]);
  });

  it("makes a tool name from the log printable", async () => {
    const tool = "search\u001b[2Jpages";
    await storeRuns(acmeRuns, triagedAfter([called(tool), result(tool, "unknown")]));

    const { stdout } = await show();

    expect(stdout[3]).toMatch(/^ {2}Didn't work: the tool search.+pages broke off/);
    expect(stdout.join("\n")).not.toContain("\u001b");
  });
});
