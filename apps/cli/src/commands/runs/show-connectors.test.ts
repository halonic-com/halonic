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
  acmeRuns = await makeAcmeRuns("runs-show-connectors");
  await writeFiles(acmeRuns.acme, {
    "hubs/support/workflows/mail-triage.workflow.yaml": mailTriage,
    "hubs/support/agents/writer.agent.yaml": "id: writer\nname: Writer\ninstructions: Read it.\n",
    "library/connectors/handbook.connector.yaml":
      "name: Handbook\ntransport:\n  stdio:\n    command: npx-nope\n",
  });
});

afterEach(async () => {
  await removeAcmeRuns(acmeRuns);
});

/** A `connector.listing-failed` of the Writer for `connector`. */
function listingFailed(
  connector: string,
  cause: { why: "other" | "secret-not-set" | "program-missing"; name?: string },
): RunEventBody {
  return {
    type: "connector.listing-failed",
    agent: "writer",
    connector,
    cause: { code: "connector-not-started", ...cause },
  };
}

/** A `connector.part-off` of the Writer for the plugin connector `orders`. */
function partOff(part: string, reason: "failed" | "not-trusted"): RunEventBody {
  return { type: "connector.part-off", agent: "writer", connector: "orders", part, reason };
}

/** A finished Mail triage run whose read step logged `logged` at its start. */
function triagedAfter(logged: RunEventBody[]): StoredRun {
  return {
    id: "run_mfx3k2a1_0a0b0c",
    workflowId: "mail-triage",
    start: today("10:20:00"),
    after: [
      [today("10:20:00"), { type: "state.entered", state: "read" }],
      [today("10:20:00"), { type: "agent.started", state: "read", agent: "writer", prompt: "" }],
      ...logged.map((event): [string, RunEventBody] => [today("10:20:00"), event]),
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

verifies("cli.runs-show-connector-not-started", () => {
  it("says under the steps why a connector didn't start, as halonic run warned", async () => {
    await storeRuns(
      acmeRuns,
      triagedAfter([
        listingFailed("handbook", { why: "program-missing", name: "npx-nope" }),
        listingFailed("handbook", { why: "program-missing", name: "npx-nope" }),
      ]),
    );

    const { code, stdout } = await show();

    expect(code).toBe(exitCode.ok);
    expect(stdout).toEqual([
      "Mail triage in Acme · run 0a0b0c · started 10:20, finished 10:20",
      "",
      "! Read the email   Writer · default   1 s",
      "",
      "! handbook didn't start, so its tools are off in this run.",
      "  The program npx-nope isn't on this computer.",
      "  Install npx-nope, or change the command in library/connectors/handbook.connector.yaml.",
      "",
      "✓ Mail triage finished in 18 s.",
      "  Sent nothing",
    ]);
  });

  it("names the tools review command when the log can't say why", async () => {
    await storeRuns(acmeRuns, triagedAfter([listingFailed("handbook", { why: "other" })]));

    const { stdout } = await show();

    expect(stdout.slice(3, 6)).toEqual([
      "",
      "! handbook couldn't list its tools, so they are off in this run.",
      "  To see why, run halonic tools review handbook",
    ]);
  });

  it("gives each part of a plugin connector that was off its own warning, once", async () => {
    await storeRuns(
      acmeRuns,
      triagedAfter([
        partOff("backend", "failed"),
        partOff("local:lister", "not-trusted"),
        listingFailed("orders", { why: "other" }),
        partOff("backend", "failed"),
      ]),
    );

    const { stdout } = await show();

    expect(stdout.slice(2, 10)).toEqual([
      "! Read the email   Writer · default   1 s",
      "",
      "! The backend of orders didn't start, so its tools are off in this run.",
      "  To see why, run halonic tools review orders",
      "! The program lister of orders didn't start, so its tools are off in this run.",
      "  Your trust doesn't cover it as it is now.",
      "  To see why, run halonic tools review orders",
      "",
    ]);
  });

  it("adds nothing when every connector started", async () => {
    await storeRuns(acmeRuns, triagedAfter([]));

    const { stdout } = await show();

    expect(stdout.slice(2, 5)).toEqual([
      "✓ Read the email   Writer · default   1 s",
      "",
      "✓ Mail triage finished in 18 s.",
    ]);
  });
});
