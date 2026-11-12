import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { GitRunner, GitVcs } from "@halonicjs/adapter-git";
import { testGit } from "@halonicjs/adapter-git/testing";
import { WorkflowRuns } from "@halonicjs/app";
import type { Harness, SandboxSession } from "@halonicjs/ports";
import { type ProfileEnvironment, profileFolder } from "@halonicjs/profile";
import { verifies } from "@halonicjs/testing-spec";
import { loadWorkspace } from "@halonicjs/workspace";
import { afterEach, beforeEach, expect, it } from "vitest";
import { type LocalEngine, openLocalEngine } from "../src/local-engine-host.ts";
import { nodeProfileEnvironment } from "../src/workspace-runs.ts";

// A harness run in the real srt sandbox (HAL-7811), before HAL-6477 turns
// harness runs on. The program is a stand-in that runs `sh` in the session,
// not Claude Code or Codex; the sandbox, the profile builder, git and the
// bridge are this computer's. The other tests of this host fake the sandbox
// and can't see what the fence really lets a program do.
//
// Like the other tests against the real fence, it lives outside `src` and runs
// with `pnpm test:fence` in the sandbox CI jobs. It never skips: the test
// hygiene reporter fails a run with a skipped test, and on a machine where the
// sandbox can't start this one fails, on purpose, so it never looks like a pass.

const acmeExample = fileURLToPath(new URL("../../../examples/acme", import.meta.url));
const agentFile = "files/agents/coder/change.txt";
const runTimeout = 120_000;

let folder: string;
let acme: string;
let profile: ProfileEnvironment;
let reported: unknown[];
const opened: LocalEngine[] = [];

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-cli-harness-sandbox-"));
  acme = join(folder, "acme");
  await cp(acmeExample, acme, { recursive: true });
  profile = { ...nodeProfileEnvironment(), variables: { HALONIC_HOME: join(folder, "profile") } };
  reported = [];
  await addLab();
});

afterEach(async () => {
  await Promise.all(opened.splice(0).map((engine) => engine.close()));
  await rm(folder, { recursive: true, force: true });
});

/** A hub whose coder runs in Claude Code, and a workflow of one step that runs it. */
async function addLab(): Promise<void> {
  const files: Record<string, string> = {
    // Harness agents send their work to a cloud model, which a local-only workspace refuses.
    "workspace.yaml":
      "id: acme\nname: Acme\ndescription: An invented shop.\nprivacy:\n  localOnly: false\ndefaults:\n  model: default\n",
    "hubs/lab/hub.yaml": "id: lab\nname: Lab\ndescription: Where the coder changes a file.\n",
    "hubs/lab/agents/coder.agent.yaml":
      "id: coder\nname: Coder\nharness: claude-code\ninstructions: Write the change.\n",
    "hubs/lab/workflows/change.workflow.yaml": [
      "id: change",
      "name: Change",
      "initial: code",
      "start: { label: Ask for a change, field: note }",
      "states:",
      "  code:",
      "    description: Write the file",
      "    agent: coder",
      "    input: Write the change.",
      "    output: change",
      "    on:",
      "      - to: done",
      "  done:",
      "    type: final",
      "    description: Done",
      "",
    ].join("\n"),
  };
  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(acme, path)), { recursive: true });
    await writeFile(join(acme, path), text);
  }
}

/** Puts the workspace in git with one commit, so a run can have its worktree. */
async function commitWorkspace(): Promise<string> {
  const runner = await GitRunner.create({ git: await testGit() });
  try {
    const vcs = new GitVcs(acme, {
      runner,
      author: { name: "Test", email: "test@example.com" },
    });
    await vcs.init();
    await vcs.stage(await new FolderDefinitionStore(acme).list());
    return await vcs.commit("First version");
  } finally {
    await runner.close();
  }
}

/** Runs `script` in the session with `argument` as `$1`, and gives its exit code. */
async function shell(session: SandboxSession, script: string, argument: string): Promise<number> {
  const started = await session.start({ program: "sh", args: ["-c", script, "sh", argument] });
  const exit = await started.exited;
  return exit.code ?? -1;
}

/** What the stand-in program saw: the exit code of each thing it tried. */
interface Attempts {
  readonly readProfileRoot: number;
  readonly writeProfileRoot: number;
  readonly writeWorkspace: number;
  readonly writeWorking: number;
  readonly writeTemp: number;
  readonly writeSettings: number;
}

/** A harness whose program tries the profile root and each folder of its own, once, in the real session. */
function standIn(root: string, seen: { attempts: Attempts | null }): Harness {
  return {
    id: "claude-code",
    name: "Stand-in program",
    detect: async () => ({ status: "ready", version: "1.0.0" }),
    // Its own settings and temp folders are in the profile already; the program needs nothing more.
    environment: () => ({}),
    start: (_task, session) => ({
      async *[Symbol.asyncIterator]() {
        const { profile: given } = session;
        if (given.settingsFolder === null) throw new Error("The run has no settings folder.");
        // Written from outside the fence, as the person's own file the fence must hide.
        await writeFile(join(root, "private.txt"), "not for the program");
        const write = 'echo "the program" > "$1"';
        seen.attempts = {
          readProfileRoot: await shell(session, 'cat "$1"', join(root, "private.txt")),
          writeProfileRoot: await shell(session, write, join(root, "intruder.txt")),
          writeWorkspace: await shell(session, write, join(acme, "intruder.txt")),
          writeWorking: await shell(session, write, join(given.workingFolder, "change.txt")),
          writeTemp: await shell(session, write, join(given.tempFolder, "scratch.txt")),
          writeSettings: await shell(session, write, join(given.settingsFolder, "settings.txt")),
        };
        yield { type: "agent.finished", agent: "coder", output: "done" };
      },
      send: async () => {
        throw new Error("The stand-in program asks nothing.");
      },
      cancel: async () => {},
    }),
  };
}

verifies("cli.local-harness-host", () => {
  it(
    "runs a harness program in the real srt sandbox: the profile root denied, only its own folders written, its file in the proposal",
    async () => {
      const commit = await commitWorkspace();
      const root = profileFolder(profile).root;
      const seen: { attempts: Attempts | null } = { attempts: null };
      const engine = await openLocalEngine({
        workspace: await loadWorkspace(new FolderDefinitionStore(acme, "./acme")),
        workspaceRoot: acme,
        secrets: { get: async () => null },
        http: { fetch: () => Promise.reject(new TypeError("The run calls no server.")) },
        environment: profile,
        // The real sandbox and bridge: only the program is replaced.
        harnessParts: { harnesses: { "claude-code": standIn(root, seen) } },
        git: { git: await testGit() },
        reportError: (error) => reported.push(error),
      });
      opened.push(engine);

      const started = await engine.executor.start({
        hubId: "lab",
        workflowId: "change",
        input: { note: "Write change.txt" },
        version: { reads: "live-version", commit, versionDate: "2026-11-12T09:00:00.000Z" },
      });
      const run = await new WorkflowRuns(engine.executor).follow(started.id, {});
      // The run's folders end just after its last event: closing waits for them.
      await engine.close();

      expect(run.summary).toMatchObject({ status: "completed" });
      // Not 0 means the fence refused it; only the program's own three folders let it write.
      const attempts = seen.attempts;
      expect(attempts).not.toBeNull();
      expect(attempts?.readProfileRoot).not.toBe(0);
      expect(attempts?.writeProfileRoot).not.toBe(0);
      expect(attempts?.writeWorkspace).not.toBe(0);
      expect(attempts?.writeWorking).toBe(0);
      expect(attempts?.writeTemp).toBe(0);
      expect(attempts?.writeSettings).toBe(0);
      expect(await readdir(acme)).not.toContain("intruder.txt");
      expect(await readdir(root)).not.toContain("intruder.txt");
      const [workspaceKey] = await readdir(join(root, "workspaces"));
      const proposals = join(root, "workspaces", workspaceKey ?? "", "proposals");
      const [record] = await readdir(proposals);
      expect(await readFile(join(proposals, record ?? ""), "utf8")).toContain(agentFile);
      expect(reported).toEqual([]);
    },
    runTimeout,
  );
});
