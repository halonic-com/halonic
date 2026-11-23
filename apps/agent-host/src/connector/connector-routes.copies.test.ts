import { symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { GitRunner, GitVcs } from "@halonicjs/adapter-git";
import { testGit } from "@halonicjs/adapter-git/testing";
import type { ProfilePlatform } from "@halonicjs/profile";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { webCryptoDigest } from "../harness/host-profiles.ts";
import { type HeldCopy, HostProgramCopies } from "../harness/host-program-copies.ts";
import { openBody, post, type Setup, startRoutes } from "./connector-routes.test-helper.ts";

/** Each test runs git itself, which is slow on a busy runner, as in the git adapter's own tests. */
const gitTimeout = 30_000;

/**
 * The host's copies, with a step that runs once, right after the next look
 * for a held copy and before the open that asked goes on: a `start` that
 * comes in between an open's check and its connector being added.
 */
class CopiesWithStep extends HostProgramCopies {
  afterNextCheck: (() => Promise<void>) | undefined;

  override async heldCopy(path: string): Promise<HeldCopy | undefined> {
    const held = await super.heldCopy(path);
    const step = this.afterNextCheck;
    this.afterNextCheck = undefined;
    await step?.();
    return held;
  }
}

let setup: Setup;
let copies: CopiesWithStep;
let copy: string;

beforeEach(async () => {
  const git = await testGit();
  setup = await startRoutes({
    programCopies: (table, folders) => {
      copies = new CopiesWithStep({
        profile: {
          platform: profilePlatformOf(process.platform),
          root: join(folders.base, "data"),
        },
        workspaceRoots: [folders.workspace],
        digest: webCryptoDigest,
        git: { git },
        stopConnectors: (workspace) => table.closeWorkspace(workspace),
        reportError: () => {},
      });
      return copies;
    },
  });
  const { workspace } = setup.folders;
  const runner = await GitRunner.create({ git });
  try {
    const vcs = new GitVcs(workspace, {
      runner,
      author: { name: "Test", email: "test@example.com" },
    });
    await vcs.init();
    await writeFile(join(workspace, "notes.js"), "live");
    await vcs.stage(["notes.js"]);
    const commit = await vcs.commit("First version");
    const opened = await copies.open(workspace, commit);
    if (opened === undefined || "refused" in opened) throw new Error("The test copy wasn't made.");
    copy = opened.path;
  } finally {
    await runner.close();
  }
}, gitTimeout);

afterEach(async () => {
  await setup.table.closeAll();
  await copies.close();
  await setup.close();
});

function profilePlatformOf(platform: NodeJS.Platform): ProfilePlatform {
  if (platform === "win32") return "windows";
  return platform === "darwin" ? "macos" : "linux";
}

/** An open request in the copy, with the workspace's own trust grant, as Studio's window sends it. */
function inCopy(change: Partial<Record<string, unknown>> = {}) {
  return openBody(setup.folders, { workspaceRoot: copy, workingFolders: [], ...change });
}

async function openInCopy(change: Partial<Record<string, unknown>> = {}): Promise<Response> {
  return await post(setup.url, "/v1/connectors/open", inCopy(change));
}

verifies("agent-host.connector-routes", () => {
  it("starts a connector in a copy the host holds, with the trust of the workspace it was made from", async () => {
    const response = await openInCopy();
    expect(response.status).toBe(200);
    const made = setup.made[0];
    expect(made?.context.workspaceRoot).toBe(copy);
    expect(made?.context.workingFolders).toEqual([join(copy, "files", "agents")]);
    expect(made?.context.trust).toEqual({
      location: setup.folders.workspace,
      fingerprint: "hfp1:test",
    });
  });

  it("checks the trust on the workspace's record, so a grant that names the copy is refused", async () => {
    const response = await openInCopy({ trust: { location: copy, fingerprint: "hfp1:test" } });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { kind: "workspace_not_trusted" } });
    expect(setup.made).toEqual([]);
  });

  it(
    "refuses a copy it released, and a path it never made, as a workspace it wasn't given",
    async () => {
      const { workspace } = setup.folders;
      expect(await copies.release(workspace, copy)).toBe("released");
      for (const root of [copy, join(setup.folders.base, "data", "made-up")]) {
        const response = await openInCopy({ workspaceRoot: root });
        expect(response.status).toBe(403);
        expect(await response.json()).toMatchObject({ error: { kind: "workspace_not_named" } });
      }
      expect(setup.made).toEqual([]);
    },
    gitTimeout,
  );

  it("refuses a working folder outside the copy, a link inside it that leads out included", async () => {
    const link = join(copy, "outside-link");
    await symlink(setup.folders.other, link, "junction");
    for (const folder of [link, setup.folders.agent, join(copy, "..", "elsewhere")]) {
      const response = await openInCopy({ workingFolders: [folder] });
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({
        error: { kind: "working_folder_outside_workspace" },
      });
    }
    expect(setup.made).toEqual([]);
  });

  it(
    "closes the workspace's connectors when its copies start again, before the sweep",
    async () => {
      expect((await openInCopy()).status).toBe(200);
      const connector = setup.made[0];
      expect(await copies.start(setup.folders.workspace)).toBe(true);
      expect(connector?.closeCount).toBe(1);
      expect((await openInCopy()).status).toBe(403);
    },
    gitTimeout,
  );

  it(
    "leaves no connector open in a copy that a start swept between the open's check and its add",
    async () => {
      copies.afterNextCheck = async () => {
        expect(await copies.start(setup.folders.workspace)).toBe(true);
      };
      const response = await openInCopy();
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ error: { kind: "workspace_not_named" } });
      expect(setup.made.filter((connector) => connector.closeCount === 0)).toEqual([]);
    },
    gitTimeout,
  );
});
