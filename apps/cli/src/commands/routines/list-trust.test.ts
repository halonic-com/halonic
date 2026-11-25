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
import { userInfoConnectorYaml } from "../../test/user-info-connector.ts";
import { savedVersionOf } from "../../workspace-at-version.ts";
import { openWorkspaceDir } from "../../workspace-dir.ts";
import { assertTrustable, cliTrustService, readWorkspaceTrust } from "../../workspace-trust.ts";
import { routinesCommandWith } from "./command.ts";

const hint =
  "Routines start on time only while this workspace is open in Halonic Studio, or while `halonic serve` or `halonic routines watch` is running.";
const routinePath = "hubs/support/workflows/routines/morning.routine.yaml";
/** A provider that reaches a real model, so Acme needs trust to start anything. */
const realModel = { "providers/ollama.yaml": "id: ollama\ntype: ollama\nlocal: true\n" };

/** Morning check of the support hub, daily at 08:00, with more lines. */
function morning(...more: string[]): string {
  return [
    "id: morning",
    "name: Morning check",
    'trigger: { schedule: "0 8 * * *" }',
    "run: { workflow: support-reply }",
    ...more,
    "",
  ].join("\n");
}

let acmeRuns: AcmeRuns;

beforeEach(async () => {
  acmeRuns = await makeAcmeRuns("routines-list-trust");
});

afterEach(async () => {
  await removeAcmeRuns(acmeRuns);
});

async function routinesIn(...args: string[]): Promise<{ code: number; io: CapturedIo }> {
  const io = captureIo(acmeRuns.acme);
  const code = await runCli(["routines", ...args], io, [
    routinesCommandWith(acmeRunsSetup(acmeRuns)),
  ]);
  return { code, io };
}

/** Trusts Acme as its files are now, as `halonic trust` does. */
async function trustAcme(): Promise<void> {
  const machine = acmeRunsSetup(acmeRuns).trust();
  const dir = await openWorkspaceDir({ positionals: [], options: {} }, { cwd: acmeRuns.acme });
  const read = await readWorkspaceTrust(dir, machine.commandSearch, await savedVersionOf(dir));
  const service = cliTrustService(machine.trustStore, machine.clock);
  const check = await service.check(read.subject);
  assertTrustable(check, read);
  await service.grant(read.subject, check.fingerprint, "cli");
}

verifies("cli.commands.routines.list", () => {
  it("says a routine that is on is paused until Acme is trusted, with halonic trust above the list", async () => {
    await writeFiles(acmeRuns.acme, { ...realModel, [routinePath]: morning() });

    const { code, io } = await routinesIn();

    expect(code).toBe(exitCode.ok);
    expect(io.stdout).toEqual([
      "! Acme isn't trusted on this computer yet, so its routines don't start · halonic trust",
      "Morning check   Daily at 08:00   ! Paused until trusted   Never ran",
      hint,
    ]);
  });

  it("gives the next run again once Acme is trusted", async () => {
    await writeFiles(acmeRuns.acme, { ...realModel, [routinePath]: morning() });
    await trustAcme();

    const { io } = await routinesIn();

    expect(io.stdout).toEqual([
      "Morning check   Daily at 08:00   Next tomorrow 08:00   Never ran",
      hint,
    ]);
  });

  it("says Acme changed since it was trusted when its files changed since", async () => {
    await writeFiles(acmeRuns.acme, { [routinePath]: morning() });
    await writeFiles(acmeRuns.acme, realModel);
    await trustAcme();
    await writeFiles(acmeRuns.acme, {
      "providers/ollama.yaml":
        "id: ollama\ntype: ollama\nlocal: true\nbaseUrl: http://127.0.0.1:11435\n",
    });

    const { io } = await routinesIn("--dir", ".");

    expect(io.stdout[0]).toBe(
      "! Acme changed since you trusted it, so its routines don't start · halonic trust --dir .",
    );
  });

  it("says which file trust refuses and why, and to trust the workspace once it is fixed", async () => {
    await writeFiles(acmeRuns.acme, {
      ...realModel,
      [routinePath]: morning(),
      "library/connectors/web.connector.yaml": userInfoConnectorYaml,
    });

    const { code, io } = await routinesIn();

    expect(code).toBe(exitCode.ok);
    expect(io.stdout).toEqual([
      "! Acme's routines don't start: library/connectors/web.connector.yaml can't be trusted, because the address has a user name or password in it. Fix the address in that file, then trust the workspace with halonic trust.",
      "Morning check   Daily at 08:00   ! Paused until trusted   Never ran",
      hint,
    ]);
  });

  it("gives no trust line when the only routine that is on is a webhook one serve won't start", async () => {
    await writeFiles(acmeRuns.acme, {
      ...realModel,
      [routinePath]: [
        "id: morning",
        "name: New mail",
        "trigger: { webhook: { secret: mail-hook } }",
        "run: { workflow: support-reply }",
        "",
      ].join("\n"),
    });

    const { code, io } = await routinesIn();

    // No row says "Paused until trusted", so no line above the list points to halonic trust.
    expect(code).toBe(exitCode.failed);
    expect(io.stdout).toEqual([
      "! 1 routine can't start on a web request · halonic serve",
      "New mail   On a signed web request   ✕ Can't start   Never ran",
      hint,
    ]);
  });

  it("leaves a routine that is off as Off, with no trust line", async () => {
    await writeFiles(acmeRuns.acme, { ...realModel, [routinePath]: morning("enabled: false") });

    const { io } = await routinesIn();

    expect(io.stdout).toEqual(["Morning check   Daily at 08:00   Off   Never ran", hint]);
  });

  it("says Can't start, not Paused until trusted, for a routine that starts an agent, with no trust line for it alone", async () => {
    await writeFiles(acmeRuns.acme, {
      ...realModel,
      "hubs/support/agents/writer.agent.yaml": "id: writer\nname: Writer\nmodel: test\n",
      [routinePath]: morning().replace(
        "run: { workflow: support-reply }",
        "run: { agent: writer, prompt: Check the inbox. }",
      ),
    });

    const { code, io } = await routinesIn();

    // Trusting Acme wouldn't start it, so halonic trust isn't the fix (HAL-15607).
    expect(code).toBe(exitCode.ok);
    expect(io.stdout).toEqual([
      "! 1 routine can't start. The line under the list says why.",
      "Morning check   Daily at 08:00   ✕ Can't start   Never ran",
      "! Morning check can't start: Halonic can't run an agent on its own yet, only as a step in a workflow. Make a workflow with the agent as a step, then have the routine start that workflow.",
      hint,
    ]);
  });

  it("says in --json whether Acme's routines can start here", async () => {
    await writeFiles(acmeRuns.acme, { ...realModel, [routinePath]: morning() });

    const { io } = await routinesIn("--json");

    expect(JSON.parse(io.stdout.join("\n"))).toMatchObject({ trusted: false });
  });
});
