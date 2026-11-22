import { readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { workspaceIntegrations } from "@halonicjs/adapter-doctor-node";
import { GitRunner, GitVcs } from "@halonicjs/adapter-git";
import { testGit } from "@halonicjs/adapter-git/testing";
import { fixedClock } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { CliCommand } from "../../command.ts";
import { exitCode } from "../../exit-code.ts";
import { computerIntegrationMachine } from "../../local-integration-machine.ts";
import { runMessages } from "../../messages/run.ts";
import { runCli } from "../../run-cli.ts";
import {
  loadRunWorkspace,
  type OpenWorkspaceHistory,
  openGitHistory,
} from "../../run-workspace.ts";
import { captureIo } from "../../test/capture-io.ts";
import { fullFingerprint, trustedAt, trustKit } from "../../test/trust-kit.spec.ts";
import { openWorkspaceDir } from "../../workspace-dir.ts";
import { profilePlatformOf } from "../../workspace-runs.ts";
import { trustedGrant } from "../../workspace-trust.ts";
import { createTrustCommand } from "./command.ts";

/** Each test runs git itself, which is slow on a busy runner, as in the git adapter's own tests. */
const gitTimeout = 30_000;

const { folder, store, writeAcme } = trustKit();

/** The workspace's history through git itself, as the CLI opens it. */
const history: OpenWorkspaceHistory = async (root) =>
  openGitHistory(root, { git: await testGit() });

const noCommands = { path: undefined, endings: [] };

/** `halonic trust` on the kit's store, reading the history through {@link history}. */
const commands = (opener: OpenWorkspaceHistory = history): CliCommand[] => [
  createTrustCommand(() => ({
    store: store(),
    clock: fixedClock(trustedAt),
    commandSearch: noCommands,
    history: opener,
  })),
];

const mailWithAll =
  "name: Mail\ntransport:\n  stdio:\n    command: npx\n    args: ['@acme/mail-mcp', '--all']\ntools:\n  approve: []\n";

const notesSheet = `id: notes
version: 0.1.0
kit: 1
provides: [connector]
hosts: []
tools:
  - { name: find-note, description: Finds a note., risk: read, untrusted: true }
`;

let runner: GitRunner;

beforeEach(async () => {
  runner = await GitRunner.create({ git: await testGit() });
});

afterEach(async () => {
  await runner.close();
});

const acme = () => join(folder(), "acme");

/** Commits every file in Acme's folder as its first version. */
async function commitAcme(): Promise<void> {
  const vcs = new GitVcs(acme(), { runner, author: { name: "Test", email: "test@example.com" } });
  await vcs.init();
  const files = readdirSync(acme(), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(acme(), join(entry.parentPath, entry.name)).replaceAll("\\", "/"))
    .filter((path) => !path.startsWith(".git/"));
  await vcs.stage(files);
  await vcs.commit("First version");
}

/** `halonic trust --dir acme` with no terminal: the check, ending with the fingerprint. */
async function checkOfAcme(opener?: OpenWorkspaceHistory) {
  const io = captureIo(folder());
  const code = await runCli(["trust", "--dir", "acme"], io, commands(opener));
  return { code, io };
}

const notCommittedLine = (files: string) =>
  `These saved changes aren't committed, so runs don't use them and this check doesn't cover them: ${files}. Commit them, then run halonic trust again.`;

verifies("cli.commands.trust.run-version", () => {
  it(
    "trusts the committed version, so a run's trust check passes with a saved change not committed",
    async () => {
      writeAcme();
      await commitAcme();
      writeAcme({ "library/connectors/mail.connector.yaml": mailWithAll });
      const fingerprint = (await checkOfAcme()).io.stdout.at(-1) ?? "";
      const trust = ["trust", "--dir", "acme", "--yes", "--fingerprint", fingerprint];
      expect(await runCli(trust, captureIo(folder()), commands())).toBe(exitCode.ok);

      const dir = await openWorkspaceDir({ positionals: [], options: {} }, { cwd: acme() });
      const run = await loadRunWorkspace(dir, history);
      if (run.found !== "loaded") throw new Error("Acme's version didn't load.");
      const machine = {
        trustStore: store(),
        clock: fixedClock(trustedAt),
        commandSearch: noCommands,
      };
      const grant = await trustedGrant(dir, machine, undefined, runMessages.nothingRan(), run);
      expect(grant.fingerprint).toBe(fingerprint);
    },
    gitTimeout,
  );

  it(
    "names each covered file not committed on one line before the fingerprint",
    async () => {
      writeAcme();
      await commitAcme();
      writeAcme({ "library/connectors/mail.connector.yaml": mailWithAll });

      const { io } = await checkOfAcme();

      // With no terminal to ask, the check goes to stderr and the fingerprint alone to stdout.
      const line = io.stderr.indexOf(notCommittedLine("library/connectors/mail.connector.yaml"));
      expect(line).toBeGreaterThan(0);
      expect(line).toBeLessThan(io.stderr.indexOf("Fingerprint"));
      expect(io.stderr).toContain("  mail          npx @acme/mail-mcp");
      expect(io.stdout).toHaveLength(1);
      expect(io.stdout[0]).toMatch(fullFingerprint);
    },
    gitTimeout,
  );

  it(
    "hashes a local integration as committed, and names its saved change",
    async () => {
      writeAcme({
        "integrations/notes/integration.yaml": notesSheet,
        "integrations/notes/backend/index.js": "export default 1;\n",
      });
      await commitAcme();
      const [committed] = await workspaceIntegrations(acme(), acme());
      writeFileSync(join(acme(), "integrations/notes/backend/index.js"), "export default 2;\n");

      const dir = await openWorkspaceDir({ positionals: [], options: {} }, { cwd: acme() });
      const run = await loadRunWorkspace(dir, history);
      if (run.found !== "loaded") throw new Error("Acme's version didn't load.");
      const [saved] = await workspaceIntegrations(acme(), acme());

      expect(run.integrations.map((each) => each.code)).toEqual([committed?.code]);
      expect(saved?.code).not.toBe(committed?.code);
      expect(run.notCommitted).toEqual(["integrations/notes/backend/index.js"]);
    },
    gitTimeout,
  );

  it(
    "says nothing about saved changes when everything is committed",
    async () => {
      writeAcme();
      await commitAcme();

      const { io } = await checkOfAcme();

      expect(io.stderr.join("\n")).not.toContain("aren't committed");
    },
    gitTimeout,
  );

  it("trusts nothing and exits 9 when the history can't be opened", async () => {
    writeAcme();
    const noGit: OpenWorkspaceHistory = () => Promise.reject(new Error("git isn't installed"));

    const { code, io } = await checkOfAcme(noGit);

    expect(code).toBe(9);
    expect(io.stderr.join("\n")).toContain(
      "git can't start on this computer, so the live version can't be read. Nothing was trusted.",
    );
    expect(await store().list()).toHaveLength(0);
  });
});

verifies("cli.local-integration-runner-folder", () => {
  it(
    "starts an integration from the run's copy on the trust `halonic trust` gave, with a saved change not committed",
    async () => {
      writeAcme({
        "integrations/notes/integration.yaml": notesSheet,
        "integrations/notes/backend/index.js": "export default 1;\n",
      });
      await commitAcme();
      writeFileSync(join(acme(), "integrations/notes/backend/index.js"), "export default 2;\n");
      const fingerprint = (await checkOfAcme()).io.stdout.at(-1) ?? "";
      const trust = ["trust", "--dir", "acme", "--yes", "--fingerprint", fingerprint];
      expect(await runCli(trust, captureIo(folder()), commands())).toBe(exitCode.ok);

      const dir = await openWorkspaceDir({ positionals: [], options: {} }, { cwd: acme() });
      const run = await loadRunWorkspace(dir, history);
      if (run.found !== "loaded" || run.version.reads !== "live-version") {
        throw new Error("Acme's live version didn't load.");
      }
      // The copy a run starts its runner from, made as the engine makes it.
      const vcs = new GitVcs(acme(), {
        runner,
        author: { name: "Test", email: "test@example.com" },
        worktrees: join(folder(), "copies"),
      });
      const copy = await vcs.addWorktree(run.version.commit);
      const machine = computerIntegrationMachine({
        dir,
        workspace: run.workspace,
        trust: { trustStore: store(), clock: fixedClock(trustedAt), commandSearch: noCommands },
        environment: {
          platform: profilePlatformOf(process.platform),
          homeFolder: join(folder(), "home"),
          variables: { HALONIC_HOME: join(folder(), "profile") },
        },
      });
      try {
        const fromCopy = await machine.trustCheck({ workspaceRoot: copy.path } as never);
        const fromSaved = await machine.trustCheck({ workspaceRoot: acme() } as never);

        expect(fromCopy.status).toBe("trusted");
        expect(fromSaved.status).toBe("changed");
      } finally {
        await machine.dispose();
        await vcs.removeWorktree(copy.id);
      }
    },
    gitTimeout,
  );
});
