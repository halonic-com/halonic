import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FileTrustStore } from "@halonicjs/adapter-fs-node";
import type { ConnectorStartReason, RunEvent } from "@halonicjs/events";
import { fixedClock } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { ConnectorPlugin } from "../../connector-plugin.ts";
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
import { connectorWarnings, type WarnedConnectors } from "./connector-warnings.ts";

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
  await writerWith(`stdio:\n    command: ${missingProgram}`);
}

/**
 * Gives Acme's Writer the `handbook` connector, which uses the plugin
 * `plugin`, and trusts Acme. Acme stops being local only, since a plugin
 * that isn't added has no manifest to say its hosts are local (HAL-14300).
 */
async function writerWithPlugin(plugin: string): Promise<void> {
  const workspace = join(acme, "workspace.yaml");
  const yaml = await readFile(workspace, "utf8");
  await writeFile(workspace, yaml.replace("localOnly: true", "localOnly: false"));
  await writerWith(`plugin:\n    id: ${plugin}`);
}

/** Gives Acme's Writer the `handbook` connector with `transport` and the `more` lines, and trusts Acme. */
async function writerWith(transport: string, more = ""): Promise<void> {
  await mkdir(join(acme, "library/connectors"), { recursive: true });
  await writeFile(
    join(acme, "library/connectors/handbook.connector.yaml"),
    `name: Handbook\ntransport:\n  ${transport}\n${more}`,
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

/** Connectors with no file in the workspace, as from the hub. */
const noFiles: WarnedConnectors = { fileOf: () => undefined, isIntegration: () => false };

/** The warning lines for `event`, with `connectors` as the workspace has them. */
function warningFor(event: RunEvent, connectors: WarnedConnectors): string[] {
  const lines: string[] = [];
  connectorWarnings({ warn: (line) => lines.push(plainText(line)) }, undefined, connectors)(event);
  return lines;
}

/** `handbook` uses the plugin `acme-orders`, which stands as `state`. */
function usesPlugin(state: ConnectorPlugin): WarnedConnectors {
  return { ...noFiles, pluginOf: () => ({ id: "acme-orders", state }) };
}

/** A `connector.listing-failed` event of the Writer, at `seq`. */
function listingFailed(seq: number, cause: { why: ConnectorStartReason; name?: string }): RunEvent {
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
      noFiles,
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
      noFiles,
    );

    warn(listingFailed(4, { why: "secret-not-set", name: "handbook-token" }));
    warn(listingFailed(9, { why: "other" }));

    expect(lines).toEqual([
      "! handbook didn't start, so its tools are off in this run.",
      "  The secret handbook-token isn't set on this computer.",
      "  Save it with halonic secret set handbook-token, or set HALONIC_SECRET_HANDBOOK_TOKEN, then try again.",
    ]);

    const other: string[] = [];
    connectorWarnings({ warn: (line) => other.push(plainText(line)) }, "acme", {
      fileOf: () => "library/connectors/handbook.connector.yaml",
      isIntegration: () => false,
    })(listingFailed(4, { why: "other" }));
    expect(other).toEqual([
      "! handbook couldn't list its tools, so they are off in this run.",
      "  To see why, run halonic tools review --dir acme handbook",
    ]);
  });

  it("points an integration's connector to halonic doctor, not tools review", () => {
    const lines: string[] = [];
    connectorWarnings({ warn: (line) => lines.push(plainText(line)) }, "acme", {
      fileOf: () => "library/connectors/handbook.connector.yaml",
      isIntegration: (connector) => connector === "handbook",
    })(listingFailed(4, { why: "other" }));

    expect(lines).toEqual([
      "! handbook couldn't list its tools, so they are off in this run.",
      "  Its integration needs the sandbox and a trusted workspace to start. To check both, run halonic doctor --dir acme",
    ]);
  });

  it("says a plugin isn't trusted yet, or changed since, with halonic trust --plugin as the fix", () => {
    const lines: string[] = [];
    const warnings = (dir: string | undefined) =>
      connectorWarnings({ warn: (line) => lines.push(plainText(line)) }, dir, noFiles);

    warnings("acme")(listingFailed(4, { why: "plugin-not-trusted", name: "files" }));
    warnings(undefined)(listingFailed(4, { why: "plugin-changed", name: "files" }));

    expect(lines).toEqual([
      "! handbook didn't start, so its tools are off in this run.",
      "  The plugin files isn't trusted yet.",
      "  Review and trust it with halonic trust --plugin files.",
      "! handbook didn't start, so its tools are off in this run.",
      "  The plugin files changed since you trusted it.",
      "  Review what changed and trust it again with halonic trust --plugin files.",
    ]);
  });

  it("says a plugin's sandbox didn't work when it started, by the plugin's name, and that the next run tries again", () => {
    const lines: string[] = [];
    const warn = connectorWarnings(
      { warn: (line) => lines.push(plainText(line)) },
      undefined,
      noFiles,
    );

    warn(listingFailed(4, { why: "plugin-stopped", name: "Weather" }));

    expect(lines).toEqual([
      "! handbook didn't start, so its tools are off in this run.",
      "  The sandbox didn't work when the plugin Weather started, so none of it ran.",
      "  Halonic tries Weather in the sandbox again the next time a run uses it.",
    ]);
  });

  it("doesn't warn about the listing of a connector whose parts already said why", () => {
    const lines: string[] = [];
    const warn = connectorWarnings(
      { warn: (line) => lines.push(plainText(line)) },
      undefined,
      noFiles,
    );

    warn({
      seq: 3,
      at: "2026-11-10T14:01:00.000Z",
      runId: "run_1",
      type: "connector.part-off",
      agent: "writer",
      connector: "handbook",
      part: "local:lister",
      reason: "sandbox-unavailable",
    });
    warn(listingFailed(4, { why: "other" }));

    expect(lines).toEqual([]);
  });
});

verifies("cli.run-plugin-connector-warning", () => {
  it("names a plugin connector's plugin that isn't added, and the run goes on", {
    timeout: heavyTestTimeout,
  }, async () => {
    await writerWithPlugin("acme-orders");
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
      "  The plugin acme-orders isn't added, so it has no tools yet. Add it with halonic plugin add <folder or git address>.",
    ];
    const at = io.stderr.indexOf(warning[0] ?? "");
    expect(io.stderr.slice(at, at + 2)).toEqual(warning);
    expect(io.stderr.filter((line) => line === warning[0])).toHaveLength(1);
  });

  it("names the added plugin a typo is close to", () => {
    const facts = usesPlugin({ state: "not_added", near: "acme-order" });
    expect(warningFor(listingFailed(4, { why: "other" }), facts)).toEqual([
      "! handbook didn't start, so its tools are off in this run.",
      "  The plugin acme-orders isn't added, so it has no tools yet. Add it with halonic plugin add <folder or git address>.",
      "  Did you mean acme-order?",
    ]);
  });

  it("leaves a plugin that is off to the log's own cause, with one wording", () => {
    const changed = usesPlugin({ state: "off", why: "changed" });
    expect(
      warningFor(listingFailed(4, { why: "plugin-changed", name: "acme-orders" }), changed),
    ).toEqual(
      warningFor(listingFailed(4, { why: "plugin-changed", name: "acme-orders" }), noFiles),
    );
    expect(warningFor(listingFailed(4, { why: "other" }), changed)[0]).toBe(
      "! handbook couldn't list its tools, so they are off in this run.",
    );
  });

  it("says a plugin that can't be read is off", () => {
    expect(warningFor(listingFailed(4, { why: "other" }), usesPlugin({ state: "broken" }))).toEqual(
      [
        "! handbook didn't start, so its tools are off in this run.",
        "  acme-orders can't be read or checked, so it's off. Remove it with halonic plugin remove acme-orders, then add a version that works.",
      ],
    );
  });

  it("says the sandbox can't start, and keeps the plain line for a plugin that is on", () => {
    const on = usesPlugin({ state: "on" });
    expect(warningFor(listingFailed(4, { why: "sandbox-not-ready" }), on)).toEqual([
      "! handbook didn't start, so its tools are off in this run.",
      "  The sandbox its plugin runs in can't start on this computer.",
      "  See why with halonic doctor.",
    ]);
    expect(warningFor(listingFailed(4, { why: "other" }), on)).toEqual([
      "! handbook couldn't list its tools, so they are off in this run.",
      "  To see why, run halonic tools review handbook",
    ]);
  });
});
