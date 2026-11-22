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
  acmeRuns = await makeAcmeRuns("runs-show-refused");
  await writeFiles(acmeRuns.acme, {
    "hubs/support/workflows/mail-triage.workflow.yaml": mailTriage,
    "hubs/support/agents/writer.agent.yaml": "id: writer\nname: Writer\ninstructions: Read it.\n",
  });
});

afterEach(async () => {
  await removeAcmeRuns(acmeRuns);
});

/** The `tool.refused` of the Writer's call `id` to `send_mail` on `mail`, whose sending is off. */
function sendingOff(id: string): RunEventBody {
  return {
    type: "tool.refused",
    agent: "writer",
    tool: "send_mail",
    toolCallId: id,
    reason: "sending-off",
    connector: "mail",
  };
}

/** A finished Mail triage run whose read step logged `logged`. */
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

/** Writes the connector `mail` with `transport`, a Google one or another kind. */
async function mailConnector(transport: string): Promise<void> {
  await writeFiles(acmeRuns.acme, {
    "library/connectors/mail.connector.yaml": `name: Mail\ntransport:\n${transport}`,
  });
}

const googleMail = "  google:\n    account: family@example.com\n";

async function show(...more: string[]): Promise<{ code: number; stdout: readonly string[] }> {
  const io = captureIo(acmeRuns.acme);
  const code = await runCli(["runs", "show", "0a0b0c", ...more], io, [
    runsCommandWith(acmeRunsSetup(acmeRuns)),
  ]);
  return { code, stdout: io.stdout };
}

verifies("cli.runs-show-sending-off", () => {
  it("says under the steps, once, that a send was refused because sending is off, and the fix", async () => {
    await mailConnector(googleMail);
    await storeRuns(acmeRuns, triagedAfter([sendingOff("m-1"), sendingOff("m-2")]));

    const { code, stdout } = await show();

    expect(code).toBe(exitCode.ok);
    expect(stdout).toEqual([
      "Mail triage in Acme · run 0a0b0c · started 10:20, finished 10:20",
      "",
      "✓ Read the email   Writer · default   1 s",
      "",
      "! The call to send_mail was refused: sending is off for mail, so nothing was sent.",
      "  To switch it on, run halonic google allow-sending mail on",
      "",
      "✓ Mail triage finished in 18 s.",
      "  Sent nothing",
    ]);
  });

  it("names the user's own --dir in the command", async () => {
    await mailConnector(googleMail);
    await storeRuns(acmeRuns, triagedAfter([sendingOff("m-1")]));

    const { stdout } = await show("--dir", ".");

    expect(stdout[5]).toBe("  To switch it on, run halonic google allow-sending --dir . mail on");
  });

  it("says the CLI can't switch sending on for a connector that isn't a Google one", async () => {
    await mailConnector("  stdio:\n    command: node\n");
    await storeRuns(acmeRuns, triagedAfter([sendingOff("m-1")]));

    const { stdout } = await show();

    expect(stdout.slice(4, 6)).toEqual([
      "! The call to send_mail was refused: sending is off for mail, so nothing was sent.",
      "  The halonic command can't switch sending on for it yet.",
    ]);
  });

  it("adds nothing for a call to a tool that wasn't offered", async () => {
    await storeRuns(
      acmeRuns,
      triagedAfter([
        {
          type: "tool.refused",
          agent: "writer",
          tool: "delete_all",
          toolCallId: "m-1",
          reason: "not-offered",
        },
      ]),
    );

    const { stdout } = await show();

    expect(stdout.slice(2, 5)).toEqual([
      "✓ Read the email   Writer · default   1 s",
      "",
      "✓ Mail triage finished in 18 s.",
    ]);
  });
});
