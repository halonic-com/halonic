import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { FileInstructionTrustStore, FileTrustStore } from "@halonicjs/adapter-fs-node";
import { GitRunner, GitVcs } from "@halonicjs/adapter-git";
import { testGit } from "@halonicjs/adapter-git/testing";
import { instructionFilesOf, pinInstructions } from "@halonicjs/adapter-harness-kit";
import { InstructionTrustService } from "@halonicjs/app";
import type { HarnessAgent } from "@halonicjs/engine";
import { instructionTrustKey } from "@halonicjs/ports";
import { fixedClock } from "@halonicjs/std";
import { skillTextOf } from "@halonicjs/target-node-harness";
import { verifies } from "@halonicjs/testing-spec";
import { filesOf } from "@halonicjs/workspace";
import { afterEach, beforeEach, expect, it } from "vitest";
import { exitCode } from "../../exit-code.ts";
import { runCli } from "../../run-cli.ts";
import {
  loadRunWorkspace,
  type OpenWorkspaceHistory,
  openGitHistory,
} from "../../run-workspace.ts";
import { captureIo } from "../../test/capture-io.ts";
import { removeTestFolder } from "../../test/remove-folder.ts";
import { CommandRunFiles } from "../../version-files.ts";
import { openWorkspaceDir } from "../../workspace-dir.ts";
import { createTrustCommand } from "./command.ts";
import { createTrustInstructionsCommand } from "./instructions.ts";

/** Each test runs git itself, which is slow on a busy runner, as in the git adapter's own tests. */
const gitTimeout = 30_000;
const clock = fixedClock(Date.UTC(2026, 10, 23, 12));
const skillPath = "hubs/lab/library/skills/review/SKILL.md";

/** The workspace's history through git itself, as the CLI opens it. */
const history: OpenWorkspaceHistory = async (root) =>
  openGitHistory(root, { git: await testGit() });

let folder: string;
let runner: GitRunner;
let instructionStore: FileInstructionTrustStore;

beforeEach(async () => {
  folder = mkdtempSync(join(tmpdir(), "halonic-cli-instructions-run-version-"));
  runner = await GitRunner.create({ git: await testGit() });
  instructionStore = new FileInstructionTrustStore(join(folder, "profile", "instruction-trust"));
  writeFiles({
    "workspace.yaml": "id: acme\nname: Acme\n",
    "hubs/lab/hub.yaml": "id: lab\nname: Lab\n",
    "hubs/lab/agents/coder.agent.yaml":
      "id: coder\nname: Coder\nharness: claude-code\ninstructions: Write the change.\nskills: [review]\n",
    "hubs/lab/agents/writer.agent.yaml": "id: writer\nname: Writer\ninstructions: Write.\n",
    [skillPath]: skill("Review the change."),
  });
});

afterEach(async () => {
  await runner.close();
  await removeTestFolder(folder);
});

const acme = () => join(folder, "acme");

/** A skill's file, with the front matter a skill needs. */
function skill(body: string): string {
  return `---\nname: Review\ndescription: Reviews a change.\n---\n${body}\n`;
}

function writeFiles(files: Record<string, string>): void {
  for (const [path, text] of Object.entries(files)) {
    const file = join(acme(), path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
}

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

/** `halonic trust instructions coder --dir acme` with no terminal, reading the history through `opener`. */
async function trustCoder(args: readonly string[] = [], opener: OpenWorkspaceHistory = history) {
  const io = captureIo(folder);
  const workspaceMachine = () => ({
    store: new FileTrustStore(join(folder, "profile", "trust")),
    clock,
    commandSearch: { path: undefined, endings: [] },
  });
  const instructions = createTrustInstructionsCommand(() => ({
    store: instructionStore,
    clock,
    history: opener,
  }));
  const code = await runCli(["trust", "instructions", "coder", "--dir", "acme", ...args], io, [
    createTrustCommand(workspaceMachine, {}, instructions),
  ]);
  return { code, io };
}

/**
 * The pin a run of the version `halonic run` starts checks for coder: its
 * skills' text read by the harness host from the run's files, as `halonic
 * run` gives them to it.
 */
async function runsPin() {
  const dir = await openWorkspaceDir({ positionals: [], options: {} }, { cwd: acme() });
  const loaded = await loadRunWorkspace(dir, history);
  if (loaded.found !== "loaded") throw new Error("Acme's version didn't load.");
  const skillText = skillTextOf({
    location: acme(),
    workspace: () => loaded.workspace,
    runFiles: new CommandRunFiles(dir, { version: loaded.version, loaded }, history),
  });
  const coder = filesOf(loaded.workspace, "agent").find((file) => file.value.id === "coder");
  if (coder === undefined) throw new Error("The version has no coder.");
  // The harness host's agent: only its run and hub are read here.
  const agent = { runId: "01jd8q", version: loaded.version, hubId: "lab" } as HarnessAgent;
  return await pinInstructions(await instructionFilesOf(coder.value, (id) => skillText(agent, id)));
}

const notCommittedLine = (files: string) =>
  `Uncommitted changes aren't checked, because runs don't use them: ${files}. Commit them, then run halonic trust instructions coder --dir acme again.`;

verifies("cli.commands.trust.instructions-run-version", () => {
  it(
    "trusts the committed skill, so a run's instruction check passes with a saved change not committed",
    async () => {
      await commitAcme();
      writeFiles({ [skillPath]: skill("Review it twice.") });
      const fingerprint = (await trustCoder()).io.stdout.at(-1) ?? "";

      const trusted = await trustCoder(["--yes", "--fingerprint", fingerprint]);

      expect(trusted.code).toBe(exitCode.ok);
      const pin = await runsPin();
      expect(pin.digest).toBe(fingerprint);
      const service = new InstructionTrustService({ store: instructionStore, clock });
      const key = instructionTrustKey(await realpath(acme()), "lab", "coder");
      expect((await service.check(key, pin)).kind).toBe("trusted");
    },
    gitTimeout,
  );

  it(
    "names the agent's own files not committed on one line before the fingerprint",
    async () => {
      await commitAcme();
      writeFiles({ [skillPath]: skill("Review it twice.") });

      const { code, io } = await trustCoder();

      expect(code).toBe(exitCode.notTrusted);
      // With no terminal to ask, the list goes to stderr and the fingerprint alone to stdout.
      const line = io.stderr.indexOf(notCommittedLine(skillPath));
      expect(line).toBeGreaterThan(0);
      expect(line).toBeLessThan(io.stderr.indexOf("Fingerprint"));
      expect(io.stdout).toHaveLength(1);
    },
    gitTimeout,
  );

  it(
    "names them after the ✓ line when the committed instructions are trusted already",
    async () => {
      await commitAcme();
      await trustCoder(["--yes", "--fingerprint", (await trustCoder()).io.stdout.at(-1) ?? ""]);
      writeFiles({ [skillPath]: skill("Review it twice.") });

      const { code, io } = await trustCoder();

      expect(code).toBe(exitCode.ok);
      expect(io.stdout).toEqual([
        "✓ coder's instructions are already trusted on this computer. Nothing changed.",
        notCommittedLine(skillPath),
      ]);
    },
    gitTimeout,
  );

  it(
    "says nothing about a saved change to another agent's file",
    async () => {
      await commitAcme();
      writeFiles({
        "hubs/lab/agents/writer.agent.yaml":
          "id: writer\nname: Writer\ninstructions: Write more.\n",
      });

      const { io } = await trustCoder();

      expect(io.stderr.join("\n")).not.toContain("Uncommitted changes");
    },
    gitTimeout,
  );

  it(
    "trusts nothing and exits 9 when the history can't be opened",
    async () => {
      await commitAcme();
      const noGit: OpenWorkspaceHistory = () => Promise.reject(new Error("git isn't installed"));

      const { code, io } = await trustCoder([], noGit);

      expect(code).toBe(9);
      expect(io.stderr.join("\n")).toContain("Nothing was trusted.");
      expect(
        await instructionStore.get(instructionTrustKey(await realpath(acme()), "lab", "coder")),
      ).toBeNull();
    },
    gitTimeout,
  );
});
