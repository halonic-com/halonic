import { mkdtempSync } from "node:fs";
import { cp, mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { GitRunner, GitVcs } from "@halonicjs/adapter-git";
import { testGit } from "@halonicjs/adapter-git/testing";
import type { ProfileEnvironment } from "@halonicjs/profile";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { loadRunWorkspace, openGitHistory } from "./run-workspace.ts";
import { removeTestFolder } from "./test/remove-folder.ts";
import { openWorkspaceDir } from "./workspace-dir.ts";
import { nodeProfileEnvironment } from "./workspace-runs.ts";

/** The Acme example, which starts local only, on the test model. */
const acmeExample = fileURLToPath(new URL("../../../examples/acme", import.meta.url));
const sheetFile = "integrations/station/integration.yaml";
/** Each test runs git itself, which is slow on a busy runner, as in the git adapter's own tests. */
const gitTimeout = 30_000;

/** A connector to the local integration in `integrations/station` that says it runs on this computer. */
const stationConnector =
  "name: Station\nlocal: true\ntransport:\n  integration: { folder: station }\n";

/** The station integration's sheet, listing `hosts`. */
function stationSheet(hosts: string): string {
  return `id: station
version: 0.1.0
kit: 1
provides: [connector]
hosts: ${hosts}
tools:
  - { name: station-reading, description: The station's last reading., risk: read, untrusted: true }
`;
}

let folder: string;
let acme: string;
let profile: ProfileEnvironment;
let runner: GitRunner;
let vcs: GitVcs;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-cli-run-sheet-hosts-"));
  acme = join(folder, "acme");
  await cp(acmeExample, acme, { recursive: true });
  await save("library/connectors/station.connector.yaml", stationConnector);
  await save("integrations/station/index.js", "export default {};\n");
  profile = {
    ...nodeProfileEnvironment(),
    variables: { HALONIC_HOME: mkdtempSync(join(folder, "profile-")) },
  };
  runner = await GitRunner.create({ git: await testGit() });
  vcs = new GitVcs(acme, { runner, author: { name: "Test", email: "test@example.com" } });
});

afterEach(async () => {
  await runner.close();
  await removeTestFolder(folder);
});

async function save(path: string, text: string): Promise<void> {
  await mkdir(join(acme, path, ".."), { recursive: true });
  await writeFile(join(acme, path), text);
}

/** Commits every file in the workspace folder: the workspace's first version. */
async function makeLive(): Promise<void> {
  const entries = await readdir(acme, { recursive: true, withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(acme, join(entry.parentPath, entry.name)).replaceAll("\\", "/"));
  await vcs.init();
  await vcs.stage(files);
  await vcs.commit("First version");
}

/** The messages of the problems in the workspace `halonic run` would start. */
async function runProblems(): Promise<string[]> {
  const dir = await openWorkspaceDir({ positionals: [], options: {} }, { cwd: acme });
  const history = async (root: string) => openGitHistory(root, { git: await testGit() });
  const run = await loadRunWorkspace(dir, history, undefined, profile);
  if (run.found !== "loaded") throw new Error("Nothing is live.");
  return run.workspace.issues.map((issue) => issue.message);
}

verifies("workspace.local-only-sheet-hosts", () => {
  it(
    "counts the hosts of the live version's sheet, not of a saved change that isn't live",
    async () => {
      await save(sheetFile, stationSheet("[api.station.example]"));
      await makeLive();
      // Saved, not made live: the run still uses the sheet that reaches the outside host.
      await save(sheetFile, stationSheet("[]"));

      expect(await runProblems()).toContainEqual(
        expect.stringContaining(
          "The integration in integrations/station reaches api.station.example",
        ),
      );
    },
    gitTimeout,
  );

  it(
    "doesn't refuse the run for an outside host saved in a sheet that isn't live yet",
    async () => {
      await save(sheetFile, stationSheet("[]"));
      await makeLive();
      await save(sheetFile, stationSheet("[api.station.example]"));

      expect(await runProblems()).not.toContainEqual(
        expect.stringContaining("integrations/station"),
      );
    },
    gitTimeout,
  );
});
