import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { codingToolsCommand, HarnessProfiles } from "@halonicjs/adapter-harness-kit";
import { SrtSandbox } from "@halonicjs/adapter-sandbox-srt";
import type { HarnessAgent } from "@halonicjs/engine";
import type { SandboxProcess } from "@halonicjs/ports";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executableName } from "../src/build/build-sea.ts";
import { agentHostCodingToolsServer } from "../src/coding-tools-mode.ts";

// The packed agent host's coding tools mode in the real fence (HAL-17226,
// after HAL-17183). The executable `pnpm build:sea` wrote unpacks its
// payload into a profile, and the harness profile builder gets the server
// from `agentHostCodingToolsServer`, as the host does. The server starts in
// a real srt session with `codingToolsCommand`, the way Claude Code and
// Codex are told to, so it runs from a payload inside Halonic's denied data
// folder that the profile opens again read-only. The test speaks MCP to it:
// it reads a file of the working folder, is refused one in the profile, and
// a `run_tests` command reads the working folder but can't read the profile. The CLI's mode has
// the same test in `apps/cli/fence/coding-tools-server.starts.test.ts`.
// Runs with `pnpm test:fence` after `pnpm build:sea` in the sandbox CI jobs
// on Linux and macOS, and never skips.

const executable = join(import.meta.dirname, "..", "dist", executableName(process.platform));
/** How long one step with the server may take before the test says where it stopped. */
const stepLimitMs = 20_000;

let top: string;
let workspace: string;
let profileRoot: string;

beforeEach(async () => {
  // A short place: srt's proxy sockets must stay under macOS's path limit.
  top = await realpath(await mkdtemp(join("/tmp", "hctm-")));
  workspace = join(top, "acme");
  profileRoot = join(top, "profile");
  for (const folder of [workspace, join(top, "home"), join(profileRoot, "tmp", "run_1")]) {
    await mkdir(folder, { recursive: true });
  }
  await writeFile(join(profileRoot, "private.txt"), "not for the program");
});

afterEach(async () => {
  await rm(top, { recursive: true, force: true });
});

/** Unpacks the executable's payload into the profile, as its first launch does, and returns its folder. */
async function unpackedPayload(): Promise<string> {
  if (!existsSync(executable)) {
    throw new Error(`No agent host executable at ${executable}: run \`pnpm build:sea\` first.`);
  }
  const unpacked = spawnSync(executable, ["--profile-folder", profileRoot, "--version"], {
    encoding: "utf8",
  });
  if (unpacked.status !== 0) {
    throw new Error(`The executable exited with ${unpacked.status}: ${unpacked.stderr}`);
  }
  const [folder] = await readdir(join(profileRoot, "agent-host"));
  if (folder === undefined) throw new Error("The executable unpacked no payload.");
  return join(profileRoot, "agent-host", folder);
}

/** A Claude Code agent that reads the workspace and writes nothing. */
const coder: HarnessAgent = {
  runId: "run_1",
  hubId: "lab",
  agentId: "coder",
  harness: "claude-code",
  version: null,
  filesFolder: null,
  file: {
    version: 1,
    id: "coder",
    name: "Coder",
    params: {},
    instructions: "",
    skills: [],
    knowledge: [],
    connectors: [],
    runLogs: false,
    collections: [],
    subagents: [],
    methods: {},
    output: { type: "text" },
    maxSteps: 6,
    harness: "claude-code",
  },
};

/** The coder's harness profile, with the packed host's server, as the host builds it. */
async function coderProfile(payload: string) {
  const codingTools = agentHostCodingToolsServer(profileRoot, payload, executable);
  if (codingTools === undefined) throw new Error("The packed host names no coding tools server.");
  const profiles = new HarnessProfiles({
    workspace,
    halonicData: profileRoot,
    home: join(top, "home"),
    host: {
      agentFile: async () => ({
        workingFolder: null,
        allowedSites: [],
        install: { program: "claude", packageFolder: null },
      }),
      tempFolder: async () => join(profileRoot, "tmp", "run_1"),
      settingsFolder: async () => null,
    },
    env: { PATH: process.env["PATH"] ?? "/usr/bin:/bin" },
    timeLimitMs: 120_000,
    codingTools,
  });
  return await profiles.profileOf(coder, { url: "http://127.0.0.1:9", token: "run-token" }, null);
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

/** Reads a stream as it comes into `into.text`, so a step that stops can show it. */
function collect(stream: ReadableStream<Uint8Array>, into: { text: string }): Promise<void> {
  const decoder = new TextDecoder();
  return stream.pipeTo(
    new WritableStream({
      write(chunk) {
        into.text += decoder.decode(chunk, { stream: true });
      },
    }),
  );
}

/** Runs `work`, and fails with the server's standard error when it takes longer than a step may. */
async function step<T>(name: string, work: Promise<T>, stderr: { text: string }): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const stopped = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () =>
        reject(new Error(`The server didn't finish "${name}". Its standard error: ${stderr.text}`)),
      stepLimitMs,
    );
  });
  try {
    return await Promise.race([work, stopped]);
  } finally {
    clearTimeout(timer);
  }
}

/** The text of a tool call's answer. */
function textOf(result: Record<string, unknown>): string {
  const content = (result["content"] ?? []) as { text?: string }[];
  return content.map((part) => part.text ?? "").join("");
}

describe("the packed agent host's coding tools mode in the real srt sandbox", () => {
  it("starts from the payload in the profile, reads the working folder and keeps the profile hidden", async () => {
    const payload = await unpackedPayload();
    const built = await coderProfile(payload);
    expect(built.codingTools?.codePaths).toEqual([executable, payload]);
    // The agent's own folder in the workspace, which the builder resolves; the run doesn't write it.
    await mkdir(built.profile.workingFolder, { recursive: true });
    await writeFile(join(built.profile.workingFolder, "hello.txt"), "hello from acme\n");

    const session = await new SrtSandbox().open(built.profile);
    try {
      expect(session.fence?.state).toBe("fenced");
      const command = codingToolsCommand(built, session, "all");
      if (command === null) throw new Error("The fenced session names no coding tools server.");
      const server = await session.start({ program: command.command, args: [...command.args] });
      const stderr = { text: "" };
      const stderrRead = collect(server.stderr, stderr);
      try {
        const client = mcpClient(server);
        await step(
          "initialize",
          client.request("initialize", { protocolVersion: "2025-11-25" }),
          stderr,
        );
        await step("initialized", client.notify("notifications/initialized"), stderr);
        const listed = await step("tools/list", client.request("tools/list"), stderr);
        const call = async (name: string, args: Record<string, unknown>) =>
          textOf(await step(name, client.request("tools/call", { name, arguments: args }), stderr));
        const readFile = await call("read_ranges", { files: [{ path: "hello.txt" }] });
        const private_ = join(profileRoot, "private.txt");
        const readProfile = await call("read_ranges", { files: [{ path: private_ }] });
        // The control: `run_tests` does run commands in the fence, so a refused
        // `cat` of the profile below is the fence's doing, not the tool's.
        const catFile = await call("run_tests", { command: "cat hello.txt" });
        const catProfile = await call("run_tests", { command: `cat ${JSON.stringify(private_)}` });
        await step("close", client.close(), stderr);
        const exited = await step("exit", server.exited, stderr);
        await step("standard error", stderrRead, stderr);

        expect(
          ((listed["tools"] ?? []) as { name: string }[]).map((tool) => tool.name).sort(),
        ).toEqual(["read_ranges", "repo_map", "run_tests", "search"]);
        expect(readFile).toContain("hello from acme");
        expect(catFile).toContain("hello from acme");
        expect(readProfile).not.toContain("not for the program");
        expect(catProfile).not.toContain("not for the program");
        expect({ code: exited.code, stderr: stderr.text }).toEqual({ code: 0, stderr: "" });
      } finally {
        await server.kill();
      }
    } finally {
      await session.close();
    }
  });
});
