// `halonic run` and `runs send` count Local only as on once it's saved on,
// before it's made live, as the Studio does (HAL-16406, `app.saved-local-only`).

import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { GitRunner, GitVcs } from "@halonicjs/adapter-git";
import { testGit } from "@halonicjs/adapter-git/testing";
import { verifies } from "@halonicjs/testing-spec";
import { filesOf, type LoadedWorkspace } from "@halonicjs/workspace";
import { afterEach, beforeEach, expect, it } from "vitest";
import { reviewedVersion } from "./commands/trust/reviewed-version.ts";
import {
  loadRunWorkspace,
  loadSendWorkspace,
  type OpenWorkspaceHistory,
  openGitHistory,
} from "./run-workspace.ts";
import { turnOffLocalOnly } from "./test/local-only.ts";
import { removeTestFolder } from "./test/remove-folder.ts";
import { type OpenWorkspaceDir, openWorkspaceDir } from "./workspace-dir.ts";

/** The Acme example, which starts local only, on the test model. */
const acmeExample = fileURLToPath(new URL("../../../examples/acme", import.meta.url));
/** Each test runs git itself, which is slow on a busy runner, as in the git adapter's own tests. */
const gitTimeout = 30_000;

let folder: string;
let acme: string;
let runner: GitRunner;
let openHistory: OpenWorkspaceHistory;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-cli-run-saved-local-only-"));
  acme = join(folder, "acme");
  await cp(acmeExample, acme, { recursive: true });
  const git = await testGit();
  runner = await GitRunner.create({ git });
  openHistory = (root) => openGitHistory(root, { git });
});

afterEach(async () => {
  await runner.close();
  await removeTestFolder(folder);
});

/** Commits Acme with `localOnly` as `live`, then saves `workspace.yaml` as `saved` without committing it. */
async function acmeLiveThenSaved(live: "on" | "off", saved: string): Promise<OpenWorkspaceDir> {
  if (live === "off") await turnOffLocalOnly(acme);
  const dir = await openWorkspaceDir({ positionals: [], options: {} }, { cwd: acme });
  const vcs = new GitVcs(acme, { runner, author: { name: "Test", email: "test@example.com" } });
  await vcs.init();
  await vcs.stage(await dir.store.list());
  await vcs.commit("First version");
  await writeFile(join(acme, "workspace.yaml"), saved);
  return dir;
}

/** Acme's `workspace.yaml` with `localOnly` set to `value`. */
async function workspaceYamlWith(value: boolean): Promise<string> {
  const text = await readFile(join(acmeExample, "workspace.yaml"), "utf8");
  return text.replace("localOnly: true", `localOnly: ${value}`);
}

/** Whether `workspace` is local only, as the engine reads it. */
function isLocalOnly(workspace: LoadedWorkspace): boolean {
  return filesOf(workspace, "workspace")[0]?.value.privacy.localOnly === true;
}

verifies("app.saved-local-only", () => {
  it("starts a run local only when Local only is saved on but not live yet", {
    timeout: gitTimeout,
  }, async () => {
    const dir = await acmeLiveThenSaved("off", await workspaceYamlWith(true));

    const run = await loadRunWorkspace(dir, openHistory);

    expect(run.found).toBe("loaded");
    if (run.found !== "loaded") return;
    expect(isLocalOnly(run.workspace)).toBe(true);
    expect(run.version.reads).toBe("live-version");
  });

  it("checks an answer on the same Local only", { timeout: gitTimeout }, async () => {
    const dir = await acmeLiveThenSaved("off", await workspaceYamlWith(true));

    const send = await loadSendWorkspace(dir, openHistory);

    expect(isLocalOnly(send.workspace)).toBe(true);
  });

  it("keeps Local only on until turning it off is made live", { timeout: gitTimeout }, async () => {
    const dir = await acmeLiveThenSaved("on", await workspaceYamlWith(false));

    const run = await loadRunWorkspace(dir, openHistory);

    expect(run.found === "loaded" && isLocalOnly(run.workspace)).toBe(true);
  });

  it("refuses a run while the saved workspace.yaml has an error and the live version is off", {
    timeout: gitTimeout,
  }, async () => {
    const dir = await acmeLiveThenSaved("off", "id: acme\nprivacy: [\n");

    await expect(loadRunWorkspace(dir, openHistory)).rejects.toMatchObject({
      kind: "invalid_input",
      message: expect.stringContaining("can't tell whether Local only is on."),
    });
  });

  it("reviews trust on the version as committed, even with a saved workspace.yaml that has an error", {
    timeout: gitTimeout,
  }, async () => {
    const dir = await acmeLiveThenSaved("off", "id: acme\nprivacy: [\n");

    const reviewed = await reviewedVersion(dir, openHistory);

    expect(isLocalOnly(reviewed.version.workspace)).toBe(false);
    expect(reviewed.notCommitted).toEqual(["workspace.yaml"]);
  });
});
