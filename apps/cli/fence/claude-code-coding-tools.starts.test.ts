import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { GitRunner, GitVcs } from "@halonicjs/adapter-git";
import { testGit } from "@halonicjs/adapter-git/testing";
import type { LocalEngine } from "@halonicjs/adapter-workspace-engine-node";
import { WorkflowRuns } from "@halonicjs/app";
import { type HttpClient, noKeyOrigins } from "@halonicjs/ports";
import type { ProfileEnvironment } from "@halonicjs/profile";
import { verifies } from "@halonicjs/testing-spec";
import { loadWorkspace } from "@halonicjs/workspace";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openLocalEngine } from "../src/cli-local-engine.ts";
import { removeTestFolder } from "../src/test/remove-folder.ts";
import { trustInstructions } from "../src/test/trust-instructions.ts";
import { nodeProfileEnvironment } from "../src/workspace-runs.ts";

// The real Claude Code sees the coding tools server (HAL-17187): the CLI's
// local engine runs the coder through the real claude-code harness in the
// real srt fence, so the harness names `halonic-tools`. The model provider is
// fake: the bridge's outbound fetch records each Messages request and ends
// the turn at once. The first request must list the coding tools directly,
// none of them held back for Claude Code's tool search.
// Runs with `pnpm test:fence`, and skips only when `claude` isn't installed.

const acmeExample = fileURLToPath(new URL("../../../examples/acme", import.meta.url));
const runTimeout = 120_000;
const codingTools = [
  "mcp__halonic-tools__read_ranges",
  "mcp__halonic-tools__repo_map",
  "mcp__halonic-tools__run_tests",
  "mcp__halonic-tools__search",
];

/** Whether `claude` is on PATH: only the Linux sandbox fence CI job installs it. */
function claudeInstalled(): boolean {
  try {
    execFileSync("claude", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
const noClaude = !claudeInstalled();

let folder: string;
let acme: string;
let profile: ProfileEnvironment;
const opened: LocalEngine[] = [];

beforeEach(async () => {
  // A short place: the bridge's socket path must stay under macOS's limit.
  folder = await mkdtemp(join(process.platform === "win32" ? tmpdir() : "/tmp", "hcc-"));
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

/** An invented key, for the bridge to send the fake provider. */
const key = "halonic-test-key-not-real-5c1d";

/** A provider of Claude models, a hub whose coder runs in Claude Code on one, and a workflow of one step that runs it. */
async function addLab(): Promise<void> {
  const files: Record<string, string> = {
    "workspace.yaml":
      "id: acme\nname: Acme\ndescription: An invented shop.\nprivacy:\n  localOnly: false\ndefaults:\n  model: default\n",
    "providers/claude.yaml":
      "id: claude\ntype: anthropic\nsecret: anthropic-key\nbaseUrl: http://127.0.0.1:47013/anthropic\n",
    "hubs/lab/hub.yaml": "id: lab\nname: Lab\ndescription: Where the coder reads code.\n",
    "hubs/lab/agents/coder.agent.yaml":
      "id: coder\nname: Coder\nharness: claude-code\nmodel: claude/claude-sonnet-5-5\ninstructions: Code.\n",
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

/** A tool as Claude Code lists it in a Messages request. */
interface ListedTool {
  readonly name: string;
  readonly defer_loading?: unknown;
}

/** A Messages request body, as much of it as the test reads. */
interface MessagesRequest {
  readonly tools?: ListedTool[];
  readonly stream?: boolean;
  readonly model?: string;
}

/** A streamed reply of one text block that ends the turn. */
function endTurn(model: string): Response {
  const message = {
    id: "msg_01",
    type: "message",
    role: "assistant",
    model,
    content: [],
    stop_reason: null,
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  };
  const events: [string, unknown][] = [
    ["message_start", { type: "message_start", message }],
    [
      "content_block_start",
      { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    ],
    [
      "content_block_delta",
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "done" } },
    ],
    ["content_block_stop", { type: "content_block_stop", index: 0 }],
    [
      "message_delta",
      {
        type: "message_delta",
        delta: { stop_reason: "end_turn", stop_sequence: null },
        usage: { output_tokens: 1 },
      },
    ],
    ["message_stop", { type: "message_stop" }],
  ];
  const text = events
    .map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    .join("");
  return new Response(text, { headers: { "content-type": "text/event-stream" } });
}

/** A fake Anthropic provider that records each Messages request and ends every turn. */
function fakeProvider(): { requests: MessagesRequest[]; http: HttpClient } {
  const requests: MessagesRequest[] = [];
  const http: HttpClient = {
    fetch: async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (path.endsWith("/count_tokens")) return Response.json({ input_tokens: 1 });
      if (!path.endsWith("/messages")) return Response.json({}, { status: 404 });
      const body = JSON.parse(String(init?.body ?? "{}")) as MessagesRequest;
      requests.push(body);
      const model = body.model ?? "claude-sonnet-5-5";
      if (body.stream === true) return endTurn(model);
      return Response.json({
        id: "msg_01",
        type: "message",
        role: "assistant",
        model,
        content: [{ type: "text", text: "done" }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
      });
    },
  };
  return { requests, http };
}

verifies("cli.claude-code-coding-tools", () => {
  describe("the real Claude Code in the real srt sandbox", () => {
    it.skipIf(noClaude)(
      "[needs claude on PATH] lists the coding tools server's tools in its first model request, none deferred",
      async () => {
        const commit = await commitWorkspace();
        const provider = fakeProvider();
        const reported: unknown[] = [];
        const engine = await openLocalEngine({
          keyOrigins: noKeyOrigins,
          workspace: await loadWorkspace(new FolderDefinitionStore(acme, "./acme")),
          workspaceRoot: acme,
          trusted: true,
          secrets: { get: async (name) => (name === "anthropic-key" ? key : null) },
          http: provider.http,
          environment: profile,
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

        expect({ status: run.summary.status, error: run.summary.error }).toEqual({
          status: "completed",
          error: null,
        });
        const first = provider.requests[0];
        const listed = (first?.tools ?? []).filter((tool) => codingTools.includes(tool.name));
        expect(listed.map((tool) => tool.name).sort()).toEqual(codingTools);
        expect(listed.filter((tool) => "defer_loading" in tool)).toEqual([]);
        expect(reported).toEqual([]);
      },
      runTimeout,
    );
  });
});
