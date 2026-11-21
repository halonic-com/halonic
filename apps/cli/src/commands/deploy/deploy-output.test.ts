import type { DeployDone, DeployEvent, DeployedVersion } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { JsonFields } from "../../command.ts";
import { plainText } from "../../messages/phrase.ts";
import { deployLiveLines, deployResult } from "./deploy-output.ts";

function versionOf(number: number, commit: string, halonicVersion = "0.3.1"): DeployedVersion {
  return { number, id: `v${number}`, commit, halonicVersion, liveSince: undefined };
}

function deployOnLines() {
  const ahead: string[] = [];
  const doing: string[] = [];
  const warnings: string[] = [];
  const json: JsonFields[] = [];
  const waits: (string | undefined)[] = [];
  const lines = deployLiveLines({
    printAhead: (line) => ahead.push(plainText(line)),
    progress: (line) => {
      doing.push(plainText(line));
      return { waitingFor: (what) => waits.push(what), end: () => {} };
    },
    warn: (line) => warnings.push(plainText(line)),
    printJsonLine: (fields) => json.push(fields),
  });
  return { ahead, doing, warnings, json, waits, lines };
}

const firstDeploy: readonly DeployEvent[] = [
  { phase: "started", step: "create", resource: { kind: "service", name: "acme" } },
  { phase: "done", step: "create", resource: { kind: "service", name: "acme" } },
  { phase: "started", step: "create", resource: { kind: "database", name: "acme-data" } },
  { phase: "done", step: "create", resource: { kind: "database", name: "acme-data" } },
  { phase: "started", step: "create", resource: { kind: "bucket", name: "acme-blobs" } },
  { phase: "done", step: "create", resource: { kind: "bucket", name: "acme-blobs" } },
  { phase: "started", step: "database", changes: 3, first: true },
  { phase: "done", step: "database", changes: 3, first: true },
  { phase: "started", step: "upload", version: 1, files: 41, secrets: 2 },
  { phase: "done", step: "upload", version: 1, files: 41, secrets: 2 },
  { phase: "started", step: "self-test", version: 1 },
  { phase: "waiting", step: "self-test", seconds: 12 },
  { phase: "done", step: "self-test", version: 1 },
  { phase: "started", step: "switch", version: 1 },
  { phase: "done", step: "switch", version: 1 },
];

const live: DeployDone = {
  outcome: "deployed",
  url: "https://acme.sam-example.workers.dev",
  version: versionOf(2, "8d1a04b"),
  previous: versionOf(1, "3f9c2e1"),
  warnings: [],
};

const facts = { workspace: "Acme", deployment: "web", took: "38 s", stepLines: [] };

verifies("cli.commands.deploy.output", () => {
  it("prints each step's live line, then its ✓ line, with one line for everything created", () => {
    const { ahead, doing, waits, lines } = deployOnLines();
    for (const event of firstDeploy) lines.onEvent(event);
    lines.end();

    expect(doing).toEqual([
      "Creating the Worker acme",
      "Creating the D1 database acme-data",
      "Creating the R2 bucket acme-blobs",
      "Updating the database",
      "Uploading version 1 · 41 files",
      "Self-test of version 1",
      "Making version 1 live",
    ]);
    expect(waits).toEqual(["Cloudflare"]);
    expect(ahead).toEqual([
      "✓ Created the Worker acme, the D1 database acme-data and the R2 bucket acme-blobs.",
      "✓ Set up the database.",
      "✓ Uploaded version 1 with 2 secrets.",
      "✓ Self-test of version 1 passed.",
    ]);
    expect(lines.lines.map(plainText)).toEqual(ahead);
  });

  it("says how many changes a later database update made, and gives every event to --json", () => {
    const { ahead, json, lines } = deployOnLines();
    const events: DeployEvent[] = [
      { phase: "started", step: "database", changes: 1, first: false },
      { phase: "done", step: "database", changes: 1, first: false },
    ];
    for (const event of events) lines.onEvent(event);

    expect(ahead).toEqual(["✓ Updated the database: 1 change."]);
    expect(json).toEqual(events.map((event) => ({ event })));
  });

  it("shows a warning the target gives during the deploy as its own ! line", () => {
    const { warnings, lines } = deployOnLines();
    lines.onEvent({ phase: "warning", message: "The database change goes live without a trial." });

    expect(warnings).toEqual(["! The database change goes live without a trial."]);
  });

  it("ends with the address, the version and the one kept for a rollback", () => {
    const result = deployResult(live, facts);

    expect(result.exitCode).toBe(0);
    expect(result.lines.map(plainText)).toEqual([
      "✓ Acme is live on web: https://acme.sam-example.workers.dev",
      "  Deployed commit 8d1a04b as version 2 in 38 s. Version 1 is kept: halonic deploy rollback web",
    ]);
    expect(result.json).toEqual({
      deployment: "web",
      url: "https://acme.sam-example.workers.dev",
      version: 2,
      commit: "8d1a04b",
      halonicVersion: "0.3.1",
      unchanged: false,
      warnings: [],
    });
  });

  it("names a newer Halonic, and on a first deploy keeps no version", () => {
    const newer = deployResult(
      { ...live, version: versionOf(3, "8d1a04b"), previous: versionOf(2, "8d1a04b", "0.3.0") },
      facts,
    );
    const first = deployResult(
      { ...live, version: versionOf(1, "3f9c2e1"), previous: undefined },
      facts,
    );

    expect(plainText(newer.lines[1] ?? [])).toBe(
      "  Deployed commit 8d1a04b with Halonic 0.3.1 (was 0.3.0) as version 3 in 38 s. Version 2 is kept: halonic deploy rollback web",
    );
    expect(plainText(first.lines[1] ?? [])).toBe("  Deployed commit 3f9c2e1 as version 1 in 38 s.");
  });

  it("prints every warning after the switch, the lost lock included, on stderr and in --json", () => {
    const lostLock =
      "The lock was lost after version 2 went live, so another deploy may have started. Check what's live with halonic deploy status web.";
    const other = "The routine tick hasn't run yet on version 2.";
    const result = deployResult({ ...live, warnings: [lostLock, other, lostLock] }, facts);

    expect(result.exitCode).toBe(0);
    expect(result.warnings?.map(plainText)).toEqual([
      `! ${lostLock}`,
      `! ${other}`,
      `! ${lostLock}`,
    ]);
    expect(result.json["warnings"]).toEqual([lostLock, other, lostLock]);
  });

  it("says when nothing changed, with no step lines and no new version", () => {
    const result = deployResult(
      { outcome: "unchanged", url: live.url, version: versionOf(2, "8d1a04b") },
      facts,
    );

    expect(result.lines.map(plainText)).toEqual([
      "✓ web already runs commit 8d1a04b with Halonic 0.3.1. Nothing changed on Cloudflare.",
    ]);
    expect(result.json["unchanged"]).toBe(true);
  });
});
