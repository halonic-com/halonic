import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { buildWorkerFile, type WorkerFile } from "../esbuild.config.ts";
import { acmeSnapshot } from "./fake-host.test-helper.ts";
import { acmeManifest } from "./sdk-host.test-helper.ts";

// The `worker.js` the plugin builder copies into every plugin, built and run
// as Paperclip runs it: `node worker.js`, with `snapshot.json` next to it.

let folder: string;
let worker: WorkerFile;

beforeAll(async () => {
  folder = await mkdtemp(join(tmpdir(), "paperclip-worker-"));
  worker = await buildWorkerFile(join(folder, "worker.js"));
  await writeFile(worker.path, worker.text);
  await writeFile(join(folder, "snapshot.json"), JSON.stringify(acmeSnapshot()));
}, 60_000);

afterAll(async () => {
  await rm(folder, { recursive: true, force: true });
});

/** What a minimal Paperclip answers the worker's calls back with: no settings and no state. */
function hostAnswer(method: string): unknown {
  return method === "config.get" ? {} : null;
}

/** Runs the built worker, sends Paperclip's requests one by one, and collects the answers and the exit code. */
async function runWorker(requests: readonly { method: string; params: unknown }[]) {
  const child = spawn(process.execPath, [worker.path], { stdio: ["pipe", "pipe", "inherit"] });
  const answers: unknown[] = [];
  let buffered = "";
  let next = 0;
  const sendNext = () => {
    const request = requests[next];
    if (request !== undefined)
      child.stdin.write(
        `${JSON.stringify({ jsonrpc: "2.0", id: `host-${next++}`, ...request })}\n`,
      );
  };
  child.stdout.on("data", (chunk: Buffer) => {
    buffered += chunk.toString("utf8");
    for (let end = buffered.indexOf("\n"); end !== -1; end = buffered.indexOf("\n")) {
      const message = JSON.parse(buffered.slice(0, end)) as { id: unknown; method?: string };
      buffered = buffered.slice(end + 1);
      if (message.method === undefined) {
        answers.push(message);
        sendNext();
      } else {
        const answer = { jsonrpc: "2.0", id: message.id, result: hostAnswer(message.method) };
        child.stdin.write(`${JSON.stringify(answer)}\n`);
      }
    }
  });
  const exitCode = new Promise<number | null>((resolve) => child.on("exit", resolve));
  sendNext();
  return { answers, exitCode: await exitCode };
}

verifies("runtime.worker-protocol", () => {
  describe("the built worker.js", () => {
    test("holds no Paperclip code and imports nothing but its snapshot.json", () => {
      expect(worker.inputs.filter((input) => input.includes("@paperclipai"))).toEqual([]);
      expect(worker.text).not.toContain("@paperclipai");
      expect(worker.text).not.toMatch(/\bfrom\s*["']node:|\brequire\(\s*["']/);
    });

    test("answers initialize, a tool call from its snapshot.json, health and shutdown, then exits", async () => {
      const manifest = acmeManifest([
        "agent.tools.register",
        "plugin.state.read",
        "plugin.state.write",
      ]);
      const declaration = {
        displayName: "PR status",
        description: "Acme's pr_status.",
        parametersSchema: {},
      };
      const tools = [{ name: "pr_status", ...declaration }];
      const runContext = {
        agentId: "agent-mateo",
        runId: "run-1",
        companyId: "acme",
        projectId: "",
      };
      const instanceInfo = { instanceId: "acme-instance", hostVersion: "2026.1117.0" };

      const { answers, exitCode } = await runWorker([
        {
          method: "initialize",
          params: { manifest: { ...manifest, tools }, config: {}, instanceInfo, apiVersion: 1 },
        },
        { method: "executeTool", params: { toolName: "pr_status", parameters: {}, runContext } },
        { method: "health", params: {} },
        { method: "shutdown", params: {} },
      ]);

      expect(answers).toEqual([
        { jsonrpc: "2.0", id: "host-0", result: { ok: true, supportedMethods: [] } },
        {
          jsonrpc: "2.0",
          id: "host-1",
          result: {
            error: "pr_status is off: this plugin runtime can't run github.pull-request yet.",
          },
        },
        { jsonrpc: "2.0", id: "host-2", result: { status: "ok" } },
        { jsonrpc: "2.0", id: "host-3", result: null },
      ]);
      expect(exitCode).toBe(0);
    }, 30_000);
  });
});
