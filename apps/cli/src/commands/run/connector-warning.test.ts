import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FileTrustStore } from "@halonicjs/adapter-fs-node";
import type { RunEvent } from "@halonicjs/events";
import { fixedClock } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { plainText } from "../../messages/phrase.ts";
import { runCli } from "../../run-cli.ts";
import { captureIo } from "../../test/capture-io.ts";
import { heavyTestTimeout } from "../../test/golden.ts";
import { removeTestFolder } from "../../test/remove-folder.ts";
import { engineStart, testRunSetup } from "../../test/run-setup.ts";
import { openWorkspaceDir } from "../../workspace-dir.ts";
import { nodeProfileEnvironment } from "../../workspace-runs.ts";
import { assertTrustable, cliTrustService, readWorkspaceTrust } from "../../workspace-trust.ts";
import { runCommandWith } from "./command.ts";
import { connectorWarnings } from "./connector-warnings.ts";

/** The Acme example, on the test model: Support reply takes Sam's email down the refund path. */
const acmeExample = fileURLToPath(new URL("../../../../../examples/acme", import.meta.url));
/** A program no test computer has, so the real starter refuses it. */
const missingProgram = "halonic-test-no-such-program";

let folder: string;
let acme: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-cli-run-connector-"));
  acme = join(folder, "acme");
  await cp(acmeExample, acme, { recursive: true });
});

afterEach(async () => {
  await removeTestFolder(folder);
});

/** Gives Acme's Writer the `handbook` connector, whose program isn't on this computer, and trusts Acme. */
async function writerWithMissingProgram(): Promise<void> {
  await mkdir(join(acme, "library/connectors"), { recursive: true });
  await writeFile(
    join(acme, "library/connectors/handbook.connector.yaml"),
    `name: Handbook\ntransport:\n  stdio:\n    command: ${missingProgram}\n`,
  );
  const writer = join(acme, "hubs/support/agents/writer.agent.yaml");
  await writeFile(writer, `${await readFile(writer, "utf8")}connectors: [handbook]\n`);
  const dir = await openWorkspaceDir({ positionals: [], options: {} }, { cwd: acme });
  const read = await readWorkspaceTrust(dir, { path: undefined, endings: [] });
  const trust = cliTrustService(new FileTrustStore(join(folder, "trust")), fixedClock(engineStart));
  const check = await trust.check(read.subject);
  assertTrustable(check, read);
  expect((await trust.grant(read.subject, check.fingerprint, "cli")).ok).toBe(true);
}

/** A `connector.listing-failed` event of the Writer, at `seq`. */
function listingFailed(
  seq: number,
  cause: { why: "other" | "secret-not-set" | "program-missing"; name?: string },
): RunEvent {
  return {
    seq,
    at: "2026-11-10T14:01:00.000Z",
    runId: "run_1",
    type: "connector.listing-failed",
    agent: "writer",
    connector: "handbook",
    cause: { code: "connector-not-started", ...cause },
  };
}

verifies("cli.run-connector-warning", () => {
  it("warns once that the connector's program is missing, and the run goes on", {
    timeout: heavyTestTimeout,
  }, async () => {
    await writerWithMissingProgram();
    const home = await mkdtemp(join(folder, "profile-"));
    const profile = { ...nodeProfileEnvironment(), variables: { HALONIC_HOME: home } };
    const io = captureIo(acme);

    const code = await runCli(
      ["run", "support-reply", "--input", "examples/refund-question.json"],
      io,
      [runCommandWith(testRunSetup(folder, profile))],
    );

    expect(code).toBe(exitCode.ok);
    const warning = [
      "! handbook didn't start, so its tools are off in this run.",
      `  The program ${missingProgram} isn't on this computer.`,
      `  Install ${missingProgram}, or change the command in library/connectors/handbook.connector.yaml.`,
    ];
    const at = io.stderr.indexOf(warning[0] ?? "");
    expect(io.stderr.slice(at, at + 3)).toEqual(warning);
    expect(io.stderr.filter((line) => line === warning[0])).toHaveLength(1);
  });

  it("names the connector file without a path for a connector that has no file in the workspace", () => {
    const lines: string[] = [];
    connectorWarnings(
      { warn: (line) => lines.push(plainText(line)) },
      undefined,
      () => undefined,
    )(listingFailed(4, { why: "program-missing", name: "npx-nope" }));

    expect(lines).toEqual([
      "! handbook didn't start, so its tools are off in this run.",
      "  The program npx-nope isn't on this computer.",
      "  Install npx-nope, or change the command in the handbook connector file.",
    ]);
  });

  it("names a secret that isn't set, and points another cause to tools review", () => {
    const lines: string[] = [];
    const warn = connectorWarnings(
      { warn: (line) => lines.push(plainText(line)) },
      undefined,
      () => undefined,
    );

    warn(listingFailed(4, { why: "secret-not-set", name: "handbook-token" }));
    warn(listingFailed(9, { why: "other" }));

    expect(lines).toEqual([
      "! handbook didn't start, so its tools are off in this run.",
      "  The secret handbook-token isn't set on this computer.",
      "  Save it with halonic secret set handbook-token, or set HALONIC_SECRET_HANDBOOK_TOKEN, then try again.",
    ]);

    const other: string[] = [];
    connectorWarnings(
      { warn: (line) => other.push(plainText(line)) },
      "acme",
      () => "library/connectors/handbook.connector.yaml",
    )(listingFailed(4, { why: "other" }));
    expect(other).toEqual([
      "! handbook couldn't list its tools, so they are off in this run.",
      "  To see why, run halonic tools review --dir acme handbook",
    ]);
  });
});
