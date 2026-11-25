import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { GitHardeningIgnoredError, GitRunner, GitVcs } from "@halonicjs/adapter-git";
import { testGit } from "@halonicjs/adapter-git/testing";
import { createDeployService } from "@halonicjs/app";
import type { DeployRequest, DeployTarget } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DeploySetup } from "../../deploy-host.ts";
import { exitCode } from "../../exit-code.ts";
import { runCli } from "../../run-cli.ts";
import type { OpenWorkspaceHistory } from "../../run-workspace.ts";
import { captureIo } from "../../test/capture-io.ts";
import { deployCommandWith } from "./command.ts";
import { openDeployHistory } from "./history.ts";

// HAL-18200: a workspace in a folder of a repository deploys that folder from
// the last commit, and a git that drops the hardening says so with its fix.

const account = { id: "9a7806061c88ada191ed06f989cc3dac", name: "sam@example.com's Account" };

const deploymentsYaml = [
  "deployments:",
  "  web:",
  "    name: Web",
  "    host: cloudflare",
  "    stage: production",
  "    cloudflare:",
  `      account: ${account.id}`,
  "      worker: acme",
  "",
].join("\n");

let folder: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-deploy-history-"));
});

afterEach(() => rm(folder, { recursive: true, force: true }));

async function write(files: Record<string, string>): Promise<void> {
  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(folder, path)), { recursive: true });
    await writeFile(join(folder, path), text);
  }
}

/** A repository at `folder` with one commit of `files`. */
async function commitRepository(files: Record<string, string>): Promise<void> {
  await write(files);
  const runner = await GitRunner.create({ git: await testGit() });
  try {
    const vcs = new GitVcs(folder, { runner, author: { name: "Sam", email: "sam@example.com" } });
    await vcs.init();
    await vcs.stage(Object.keys(files));
    await vcs.commit("Add the app");
  } finally {
    await runner.close();
  }
}

/** A deploy whose target plans the files the deploy hands it, and deploys nothing. */
function setupWith(openHistory: OpenWorkspaceHistory): DeploySetup {
  const target = {
    accounts: async () => [account],
    plan: async (request: DeployRequest) => ({
      account,
      url: "https://acme.sam-example.workers.dev",
      creates: [],
      adopts: [],
      databaseChanges: [],
      deletesData: false,
      live: undefined,
      liveReaches: undefined,
      lockedBy: undefined,
      unchanged: false,
      files: await request.snapshot.files.list(),
    }),
  } as Partial<DeployTarget> as DeployTarget;
  const clock = { now: () => new Date("2026-11-25T10:00:00Z") };
  return {
    deploys: createDeployService({ loadTarget: async () => target, clock }),
    clock,
    timeZone: "UTC",
    openHistory,
  };
}

async function deploy(setup: DeploySetup, args: readonly string[]) {
  const io = captureIo(folder);
  const code = await runCli(["deploy", ...args], io, [deployCommandWith(setup)]);
  return { code, io };
}

verifies("cli.commands.deploy.run", () => {
  describe("halonic deploy, a workspace in a folder of a repository", () => {
    it("shows the plan with that folder's files from the last commit", async () => {
      await commitRepository({
        "README.md": "# The app\n",
        "src/main.ts": "export {};\n",
        "studio/workspace.yaml": "id: acme\nname: Acme\n",
        "studio/deployments.yaml": deploymentsYaml,
        "studio/providers/claude.yaml": "id: claude\ntype: anthropic\nsecret: anthropic-key\n",
      });
      // Not committed, but outside the folder, so no change of the workspace's: production still deploys.
      await write({ "README.md": "# The app, edited\n", "notes.txt": "later\n" });
      const history: OpenWorkspaceHistory = async (root) =>
        openDeployHistory(root, { git: await testGit() });

      const { code, io } = await deploy(setupWith(history), ["web", "--plan", "--dir", "studio"]);

      expect(io.stderr.join("\n")).not.toContain("isn't in a git repository");
      expect(code).toBe(exitCode.ok);
      expect(io.stdout[0]).toBe("Deploy Acme to Cloudflare?");
      expect(io.stdout.filter((line) => line.startsWith("    "))).toEqual([
        "    deployments.yaml",
        "    providers/claude.yaml",
        "    workspace.yaml",
      ]);
    });

    it("counts only the folder's uncommitted changes", async () => {
      await commitRepository({
        "README.md": "# The app\n",
        "studio/workspace.yaml": "id: acme\nname: Acme\n",
        "studio/deployments.yaml": deploymentsYaml,
      });
      await write({ "README.md": "# The app, edited\n", "studio/notes.md": "later\n" });
      const history: OpenWorkspaceHistory = async (root) =>
        openDeployHistory(root, { git: await testGit() });

      const { code, io } = await deploy(setupWith(history), ["web", "--plan", "--dir", "studio"]);

      expect(code).toBe(exitCode.conflict);
      expect(io.stderr[0]).toContain("1 file has changes that aren't committed.");
    });

    it("still refuses a workspace outside any repository", async () => {
      await write({
        "workspace.yaml": "id: acme\nname: Acme\n",
        "deployments.yaml": deploymentsYaml,
      });
      const history: OpenWorkspaceHistory = async (root) =>
        openDeployHistory(root, { git: await testGit() });

      const { code, io } = await deploy(setupWith(history), ["web", "--plan"]);

      expect(code).toBe(exitCode.usage);
      expect(io.stderr[0]).toBe(
        "✕ Couldn't deploy web: Acme isn't in a git repository, and a deploy takes its files from a commit.",
      );
    });
  });

  describe("halonic deploy, a git that drops Halonic's git settings", () => {
    it("says so on the ✕ lines with its fix", async () => {
      await write({
        "workspace.yaml": "id: acme\nname: Acme\n",
        "deployments.yaml": deploymentsYaml,
      });
      const shim = () => Promise.reject(new GitHardeningIgnoredError("/opt/shims/git"));

      const { code, io } = await deploy(setupWith(shim), ["web", "--plan"]);

      expect(code).toBe(exitCode.unavailable);
      const said = io.stderr.join("\n");
      expect(said).toContain(
        "the git at /opt/shims/git doesn't pass Halonic's git settings on to git",
      );
      expect(said).toContain("Put git 2.31 or later itself first on your PATH, then try again.");
      expect(said).not.toContain("can't explain yet");
    });
  });
});
