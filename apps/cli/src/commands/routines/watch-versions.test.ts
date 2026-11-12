import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { contractGrant } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { filesOf, type LoadedWorkspace } from "@halonicjs/workspace";
import { afterEach, beforeEach, expect, it } from "vitest";
import { openWorkspaceDir } from "../../workspace-dir.ts";
import { WatchedVersions } from "./watch-versions.ts";

// The version a run's connectors start from in `routines watch` (HAL-7500):
// the one the run read, checked for trust, with the grant of that check.

const acmeExample = fileURLToPath(new URL("../../../../../examples/acme", import.meta.url));

let folder: string;
let acme: string;
let versions: WatchedVersions | undefined;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-cli-watch-versions-"));
  acme = join(folder, "acme");
  await cp(acmeExample, acme, { recursive: true });
});

afterEach(async () => {
  await versions?.close();
  versions = undefined;
  await rm(folder, { recursive: true, force: true });
});

/** The watch's versions of Acme with history off: the saved files. */
async function watchAcme(): Promise<WatchedVersions> {
  const dir = await openWorkspaceDir({ positionals: [], options: {} }, { cwd: acme });
  versions = await WatchedVersions.open(dir, async () => null);
  return versions;
}

/** The ids of the workspace's provider files. */
function providersOf(workspace: LoadedWorkspace): string[] {
  return filesOf(workspace, "provider").map((file) => file.value.id);
}

verifies("cli.local-engine", () => {
  it("gives a run's version with the grant of its own trust check, not the one read last", async () => {
    const watched = await watchAcme();
    const checked: string[][] = [];
    watched.checkWith({
      trust: async (workspace) => {
        checked.push(providersOf(workspace));
        return contractGrant;
      },
      sandbox: async () => {},
    });
    await writeFile(
      join(acme, "providers", "ollama.yaml"),
      "id: ollama\ntype: ollama\nlocal: true\n",
    );

    const read = await watched.trustedVersionOf({ reads: "saved-files" });

    expect(checked).toEqual([["mock", "ollama"]]);
    expect(read.trust).toBe(contractGrant);
    expect(providersOf(read.workspace)).toEqual(["mock", "ollama"]);
    // Reading a run's version for its connectors starts no run from it.
    expect(providersOf(watched.latest())).toEqual(["mock"]);
  });

  it("gives no grant until the watch sets its checks", async () => {
    const watched = await watchAcme();

    const read = await watched.trustedVersionOf({ reads: "saved-files" });

    expect(read.trust).toBeNull();
  });

  it("refuses a run's version that turns local only off, before its trust check", async () => {
    const watched = await watchAcme();
    let checks = 0;
    watched.checkWith({
      trust: async () => {
        checks += 1;
        return contractGrant;
      },
      sandbox: async () => {},
    });
    const file = join(acme, "workspace.yaml");
    await writeFile(
      file,
      (await readFile(file, "utf8")).replace("localOnly: true", "localOnly: false"),
    );

    await expect(watched.trustedVersionOf({ reads: "saved-files" })).rejects.toThrow(
      "turns local only on or off",
    );
    expect(checks).toBe(0);
  });
});
