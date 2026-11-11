import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ProgramLaunch, ProgramStarter } from "@halonicjs/adapter-mcp";
import { MemorySecrets, MemoryTokenStore } from "@halonicjs/adapter-memory";
import { RunHistory } from "@halonicjs/app";
import type { Connector } from "@halonicjs/format";
import type { ProfileEnvironment } from "@halonicjs/profile";
import {
  type FingerprintCase,
  fingerprintAttacks,
  fingerprintControls,
} from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { filesOf, loadWorkspace } from "@halonicjs/workspace";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCommandWith } from "./commands/run/command.ts";
import { type ConnectorMachine, cliConnectorFactories } from "./connector-machine.ts";
import { exitCode } from "./exit-code.ts";
import { exitCodeOfError } from "./exit-code-for.ts";
import { runMessages } from "./messages/run.ts";
import { NotTrustedError } from "./not-trusted.ts";
import { runCli } from "./run-cli.ts";
import { readSourceListing } from "./source-listing.ts";
import { captureIo } from "./test/capture-io.ts";
import { heavyTestTimeout } from "./test/golden.ts";
import { testRunSetup } from "./test/run-setup.ts";
import { openWorkspaceDir } from "./workspace-dir.ts";
import { nodeProfileEnvironment, openWorkspaceRuns } from "./workspace-runs.ts";
import { cliTrustService, readWorkspaceTrust } from "./workspace-trust.ts";

/** The Acme example, on the test model, that the attacker's connectors are added to. */
const acmeExample = fileURLToPath(new URL("../../../examples/acme", import.meta.url));
const samsEmail = ["--input", "examples/refund-question.json"];
const noCommands = { path: undefined, endings: [] };
/** Every secret the cases name, so a connector is held back only by its trust. */
const secrets = () =>
  new MemorySecrets({ "files-token": "files", "admin-token": "admin", "mail-refresh": "mail" });

/** Every program start and server call a connector makes; each one fails, as none is needed. */
class Reached implements ProgramStarter {
  readonly programs: ProgramLaunch[] = [];
  readonly servers: string[] = [];

  async start(launch: ProgramLaunch): Promise<never> {
    this.programs.push(launch);
    throw new Error("This test starts no program.");
  }

  async fetch(request: Request | string | URL): Promise<never> {
    this.servers.push(String(request instanceof Request ? request.url : request));
    throw new TypeError("This test reaches no server.");
  }
}

let folder: string;
let acme: string;
let profile: ProfileEnvironment;
let reached: Reached;
let machine: ConnectorMachine;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-cli-trust-attacks-"));
  acme = join(folder, "acme");
  await cp(acmeExample, acme, { recursive: true });
  profile = { ...nodeProfileEnvironment(), variables: { HALONIC_HOME: join(folder, "profile") } };
  reached = new Reached();
  // The trust records in `folder/trust`, where `testRunSetup` keeps them too.
  machine = {
    ...testRunSetup(folder, profile).trust(),
    factories: cliConnectorFactories(reached, { PATH: "/usr/bin" }),
    http: { fetch: (request) => reached.fetch(request) },
    tokens: new MemoryTokenStore(),
  };
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

/** Writes `connectors` as Acme's connector files, in place of the ones it has. */
async function writeConnectors(connectors: readonly Connector[]): Promise<void> {
  const library = join(acme, "library", "connectors");
  await rm(library, { recursive: true, force: true });
  await mkdir(library, { recursive: true });
  for (const { id, version: _version, ...file } of connectors) {
    // JSON is YAML, and writes every value as it is, `${HOME}` and a Cyrillic host included.
    await writeFile(join(library, `${id}.connector.yaml`), `${JSON.stringify(file, null, 2)}\n`);
  }
}

/** Acme with `before` trusted as a person trusts it: with the fingerprint the check showed. */
async function trustAcme({ before }: FingerprintCase): Promise<void> {
  await writeConnectors(before);
  const dir = await openWorkspaceDir({ positionals: [], options: {} }, { cwd: acme });
  const { subject } = await readWorkspaceTrust(dir, noCommands);
  const service = cliTrustService(machine.trustStore, machine.clock);
  const shown = await service.check(subject);
  expect((await service.grant(subject, shown.fingerprint, "cli")).ok).toBe(true);
}

/** Reads every connector's tool listing as `halonic tools` does; the error of each, if any. */
async function readEveryListing(): Promise<unknown[]> {
  const dir = await openWorkspaceDir({ positionals: [], options: {} }, { cwd: acme });
  const workspace = await loadWorkspace(dir.store);
  const errors: unknown[] = [];
  for (const { value: connector } of filesOf(workspace, "connector")) {
    const target = { dir, typedDir: undefined, connector, workspace };
    await readSourceListing(target, machine, secrets(), runMessages.nothingRan()).then(
      () => errors.push(undefined),
      (error: unknown) => errors.push(error),
    );
  }
  return errors;
}

/** `halonic run support-reply` on Acme as it is now, and the runs its log holds after. */
async function runSupportReply() {
  const io = captureIo(acme);
  const command = runCommandWith(testRunSetup(folder, profile));
  const code = await runCli(["run", "support-reply", ...samsEmail], io, [command]);
  const runs = await new RunHistory(await openWorkspaceRuns(acme, profile)).listRuns();
  return { code, stdout: io.stdout, runs: runs.total };
}

verifies("cli.trust-attacks", () => {
  describe("after an attacker edits a trusted workspace", () => {
    for (const [attack, edited] of Object.entries(fingerprintAttacks)) {
      it(`starts no connector, logs no run and exits 3 when an attacker ${attack} (${edited.item})`, {
        timeout: heavyTestTimeout,
      }, async () => {
        await trustAcme(edited);
        await writeConnectors(edited.after);

        const errors = await readEveryListing();
        expect(errors).toHaveLength(edited.after.length);
        for (const error of errors) {
          expect(error).toBeInstanceOf(NotTrustedError);
          expect(exitCodeOfError(error)).toBe(exitCode.notTrusted);
        }
        expect(reached.programs).toEqual([]);
        expect(reached.servers).toEqual([]);

        const run = await runSupportReply();
        expect(run.code).toBe(exitCode.notTrusted);
        expect(run.stdout.at(-1)).toMatch(/^hfp1:[0-9a-f]{64}$/);
        expect(run.runs).toBe(0);
      });
    }
  });

  // So the attack cases can't pass by a check that refuses everything.
  describe("after a harmless rewrite of a trusted workspace", () => {
    for (const [control, edited] of Object.entries(fingerprintControls)) {
      it(`still starts the connectors and runs when the workspace ${control}`, {
        timeout: heavyTestTimeout,
      }, async () => {
        await trustAcme(edited);
        await writeConnectors(edited.after);

        const errors = await readEveryListing();
        expect(errors.filter((error) => error instanceof NotTrustedError)).toEqual([]);
        expect(reached.programs.length + reached.servers.length).toBe(edited.after.length);

        const run = await runSupportReply();
        expect(run.code).toBe(exitCode.ok);
        expect(run.runs).toBe(1);
      });
    }
  });
});
