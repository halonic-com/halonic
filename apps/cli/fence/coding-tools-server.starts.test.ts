import { cp, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { GitRunner, GitVcs } from "@halonicjs/adapter-git";
import { testGit } from "@halonicjs/adapter-git/testing";
import { codingToolsCommand } from "@halonicjs/adapter-harness-kit";
import type { LocalEngine } from "@halonicjs/adapter-workspace-engine-node";
import { WorkflowRuns } from "@halonicjs/app";
import { type Harness, noKeyOrigins, type SandboxProcess } from "@halonicjs/ports";
import { type ProfileEnvironment, profileFolder } from "@halonicjs/profile";
import { verifies } from "@halonicjs/testing-spec";
import { loadWorkspace } from "@halonicjs/workspace";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openLocalEngine } from "../src/cli-local-engine.ts";
import { removeTestFolder } from "../src/test/remove-folder.ts";
import { trustInstructions } from "../src/test/trust-instructions.ts";
import { nodeProfileEnvironment } from "../src/workspace-runs.ts";

// The coding tools server in the real fence (HAL-17183): the CLI's harness
// host names `halonic coding-tools`, and a stand-in harness starts it in its
// real srt session with `codingToolsCommand`, the way Claude Code and Codex
// are told to. The test then speaks MCP to it as the program would: it reads
// a file of the working folder, is refused one outside it, and runs `node -e`
// through `run_tests`, whose commands can't read Halonic's profile either.
// Like the other tests against the real fence, it runs with
// `pnpm test:fence` in the sandbox CI jobs and never skips.

const acmeExample = fileURLToPath(new URL("../../../examples/acme", import.meta.url));
const runTimeout = 120_000;

let folder: string;
let acme: string;
let profile: ProfileEnvironment;
const opened: LocalEngine[] = [];

beforeEach(async () => {
  // A short place: the bridge's socket path must stay under macOS's limit.
  folder = await mkdtemp(join(process.platform === "win32" ? tmpdir() : "/tmp", "hct-"));
  acme = join(folder, "acme");
  await cp(acmeExample, acme, { recursive: true });
  profile = { ...nodeProfileEnvironment(), variables: { HALONIC_HOME: join(folder, "profile") } };
  await addLab();
  await trustInstructions({ profile, workspace: acme, hub: "lab", agent: "coder", text: "Code." });
});

afterEach(async () => {
  await Promise.all(opened.splice(0).map((engine) => engine.close()));
  await removeTestFolder(folder);
});

/** A hub whose coder runs in Claude Code, and a workflow of one step that runs it. */
async function addLab(): Promise<void> {
  const files: Record<string, string> = {
    "workspace.yaml":
      "id: acme\nname: Acme\ndescription: An invented shop.\nprivacy:\n  localOnly: false\ndefaults:\n  model: default\n",
    "hubs/lab/hub.yaml": "id: lab\nname: Lab\ndescription: Where the coder reads code.\n",
    "hubs/lab/agents/coder.agent.yaml":
      "id: coder\nname: Coder\nharness: claude-code\ninstructions: Code.\n",
    "hubs/lab/workflows/code.workflow.yaml": [
      "id: code",
      "name: Code",
      "initial: code",
      "start: { label: Ask, field: note }",
      "states:",
      "  code:",
      "    description: Read the code",
      "    agent: coder",
      "    input: Read the code.",
      "    output: notes",
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

async function commitWorkspace(): Promise<string> {
  const runner = await GitRunner.create({ git: await testGit() });
  try {
    const vcs = new GitVcs(acme, { runner, author: { name: "Test", email: "test@example.com" } });
    await vcs.init();
    await vcs.stage(await new FolderDefinitionStore(acme).list());
    return await vcs.commit("First version");
  } finally {
    await runner.close();
  }
}

/** An MCP client on a started server's standard input and output, one line per message. */
function mcpClient(server: SandboxProcess) {
  const writer = server.stdin.getWriter();
  const output = server.stdout.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  let nextId = 1;
  const readLine = async (): Promise<string> => {
    while (!buffered.includes("\n")) {
      const { value, done } = await output.read();
      if (done) throw new Error(`The server ended its output. It had written: ${buffered}`);
      buffered += decoder.decode(value, { stream: true });
    }
    const at = buffered.indexOf("\n");
    const line = buffered.slice(0, at);
    buffered = buffered.slice(at + 1);
    return line;
  };
  const send = (message: unknown) =>
    writer.write(new TextEncoder().encode(`${JSON.stringify(message)}\n`));
  return {
    async request(method: string, params: Record<string, unknown> = {}) {
      const id = nextId++;
      await send({ jsonrpc: "2.0", id, method, params });
      for (;;) {
        const reply = JSON.parse(await readLine()) as { id?: number; result?: unknown };
        if (reply.id === id) return reply.result as Record<string, unknown>;
      }
    },
    notify: (method: string) => send({ jsonrpc: "2.0", method }),
    close: () => writer.close(),
  };
}

/** The text of a tool call's answer, and whether it is an error. */
interface ToolAnswer {
  readonly text: string;
  readonly isError: boolean;
}

/** What the stand-in program saw through the server. */
interface Seen {
  tools: string[];
  readFile: ToolAnswer | null;
  readOutside: ToolAnswer | null;
  runNode: ToolAnswer | null;
  readProfileFromTest: ToolAnswer | null;
  stderr: string;
}

function answerOf(result: Record<string, unknown>): ToolAnswer {
  const content = (result["content"] ?? []) as { text?: string }[];
  return {
    text: content.map((part) => part.text ?? "").join(""),
    isError: result["isError"] === true,
  };
}

/** How long one step with the server may take before the test says where it stopped. */
const stepLimitMs = 20_000;

/** Reads the server's standard error as it comes, so a step that stops can show it. */
function collectStderr(server: SandboxProcess, seen: Seen): Promise<void> {
  const decoder = new TextDecoder();
  return server.stderr.pipeTo(
    new WritableStream({
      write(chunk) {
        seen.stderr += decoder.decode(chunk, { stream: true });
      },
    }),
  );
}

/** Speaks MCP to the started server as a harness program would, one step at a time. */
async function talkTo(server: SandboxProcess, root: string, seen: Seen): Promise<void> {
  const stderr = collectStderr(server, seen);
  let exit = "still running";
  void server.exited.then((ended) => {
    exit = `ended with ${ended.code ?? ended.signal} (${ended.reason})`;
  });
  const step = async <T>(name: string, work: Promise<T>): Promise<T> => {
    let timer: NodeJS.Timeout | undefined;
    const stopped = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new Error(
              `The server didn't finish "${name}" in ${stepLimitMs} ms; it is ${exit}. Its standard error: ${seen.stderr}`,
            ),
          ),
        stepLimitMs,
      );
    });
    try {
      return await Promise.race([work, stopped]);
    } finally {
      clearTimeout(timer);
    }
  };
  const client = mcpClient(server);
  await step("initialize", client.request("initialize", { protocolVersion: "2025-11-25" }));
  await step("initialized", client.notify("notifications/initialized"));
  const listed = await step("tools/list", client.request("tools/list"));
  seen.tools = ((listed["tools"] ?? []) as { name: string }[]).map((tool) => tool.name);
  const call = async (name: string, args: Record<string, unknown>) =>
    answerOf(await step(name, client.request("tools/call", { name, arguments: args })));
  seen.readFile = await call("read_ranges", { files: [{ path: "hello.txt" }] });
  seen.readOutside = await call("read_ranges", { files: [{ path: join(root, "private.txt") }] });
  const node = JSON.stringify(process.execPath);
  seen.runNode = await call("run_tests", {
    command: `${node} -e "console.log('ran ' + (6 * 7))"`,
  });
  seen.readProfileFromTest = await call("run_tests", {
    command: `cat ${JSON.stringify(join(root, "private.txt"))}`,
  });
  await step("close", client.close());
  await step("exit", server.exited);
  await step("standard error", stderr);
}

/** A harness that starts the coding tools server in its session as Claude Code is told to, and calls it. */
function standIn(root: string, seen: Seen): Harness {
  return {
    id: "claude-code",
    name: "Stand-in program",
    signIn: { program: "sh", args: [], folderVariable: "STAND_IN_CONFIG_DIR" },
    detect: async () => ({ status: "ready", version: "1.0.0" }),
    environment: () => ({}),
    start: (task, session) => ({
      async *[Symbol.asyncIterator]() {
        yield { type: "agent.started", agent: "coder", prompt: "Read the code" };
        const command = codingToolsCommand(task, session, "all");
        if (command === null) throw new Error("The run names no coding tools server.");
        await writeFile(join(root, "private.txt"), "not for the program");
        const working = session.profile.workingFolder;
        const wrote = await session.start({
          program: "sh",
          args: ["-c", 'echo "hello from acme" > "$1"', "sh", join(working, "hello.txt")],
        });
        await wrote.exited;
        const server = await session.start({ program: command.command, args: [...command.args] });
        try {
          await talkTo(server, root, seen);
        } finally {
          await server.kill();
        }
        yield { type: "agent.finished", agent: "coder", output: "done" };
      },
      send: async () => {
        throw new Error("The stand-in program asks nothing.");
      },
      cancel: async () => {},
    }),
  };
}

verifies("cli.coding-tools-mode", () => {
  describe("the coding tools server in the real srt sandbox", () => {
    it(
      "starts as the harness names it, reads the working folder, refuses outside it and runs node -e",
      async () => {
        const commit = await commitWorkspace();
        const root = profileFolder(profile).root;
        const seen: Seen = {
          tools: [],
          readFile: null,
          readOutside: null,
          runNode: null,
          readProfileFromTest: null,
          stderr: "",
        };
        const reported: unknown[] = [];
        const engine = await openLocalEngine({
          keyOrigins: noKeyOrigins,
          workspace: await loadWorkspace(new FolderDefinitionStore(acme, "./acme")),
          workspaceRoot: acme,
          trusted: true,
          secrets: { get: async () => null },
          http: { fetch: () => Promise.reject(new TypeError("The run calls no server.")) },
          environment: profile,
          harnessParts: { harnesses: { "claude-code": standIn(root, seen) } },
          git: { git: await testGit() },
          reportError: (error) => reported.push(error),
        });
        opened.push(engine);

        const started = await engine.executor.start({
          hubId: "lab",
          workflowId: "code",
          input: { note: "Read the code" },
          version: { reads: "live-version", commit, versionDate: "2026-11-24T09:00:00.000Z" },
        });
        const run = await new WorkflowRuns(engine.executor).follow(started.id, {});
        await engine.close();

        expect({
          status: run.summary.status,
          error: run.summary.error,
          stderr: seen.stderr,
        }).toEqual({ status: "completed", error: null, stderr: "" });
        expect(seen.tools.sort()).toEqual(["read_ranges", "repo_map", "run_tests", "search"]);
        expect(seen.readFile).toMatchObject({ isError: false });
        expect(seen.readFile?.text).toContain("hello from acme");
        expect(seen.readOutside?.text).not.toContain("not for the program");
        expect(seen.runNode?.text).toContain("ran 42");
        expect(seen.readProfileFromTest?.text).not.toContain("not for the program");
        expect(reported).toEqual([]);
      },
      runTimeout,
    );
  });
});
