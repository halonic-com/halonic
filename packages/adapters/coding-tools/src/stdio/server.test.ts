import { readdir } from "node:fs/promises";
import { McpToolServer } from "@halonicjs/adapter-mcp/server";
import { encodeUtf8 } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { removeTestFolders, testFolders } from "../folders.test-helper.ts";
import { serveOverStdio } from "./serve-stdio.ts";
import { readServerArguments, runCodingToolsServer } from "./server.ts";

afterEach(removeTestFolders);

/** An input the test writes lines to, and the lines the server wrote back. */
function testChannel() {
  let push: (line: string) => void = () => undefined;
  let end: () => void = () => undefined;
  const input = new ReadableStream<Uint8Array>({
    start(controller) {
      push = (line) => controller.enqueue(encodeUtf8(`${line}\n`));
      end = () => controller.close();
    },
  });
  const written: string[] = [];
  return {
    channel: { input, write: (line: string) => written.push(line) },
    send: (message: unknown) => push(JSON.stringify(message)),
    sendText: (text: string) => push(text),
    end: () => end(),
    replies: () => written.map((line) => JSON.parse(line) as Record<string, unknown>),
    written,
  };
}

const request = (id: number, method: string, params: Record<string, unknown> = {}) => ({
  jsonrpc: "2.0",
  id,
  method,
  params,
});

/** A server whose one tool waits until its call is cancelled. */
function waitingServer(cancelled: string[]) {
  return new McpToolServer(
    {
      list: async () => [],
      call: (name, _args, signal) =>
        new Promise((resolve) => {
          signal.addEventListener("abort", () => {
            cancelled.push(name);
            resolve({ text: "stopped", isError: false });
          });
        }),
    },
    { reportError: () => undefined },
  );
}

verifies("coding-tools.stdio", () => {
  describe("the server", () => {
    it("answers one reply per line, and nothing else", async () => {
      const folders = await testFolders();
      await folders.write("a.txt", "hello\n");
      const { channel, send, sendText, end, replies, written } = testChannel();
      const serving = runCodingToolsServer(
        {
          args: ["--temp-folder", folders.outside],
          cwd: folders.workingFolder,
          env: {},
          codePaths: [],
          reportError: (error) => {
            throw error;
          },
        },
        channel,
      );
      send(request(1, "initialize", { protocolVersion: "2025-11-25" }));
      send({ jsonrpc: "2.0", method: "notifications/initialized" });
      sendText("");
      send(request(2, "tools/list"));
      send(
        request(3, "tools/call", {
          name: "read_ranges",
          arguments: { files: [{ path: "a.txt" }] },
        }),
      );
      await expect.poll(() => written.length).toBe(3);
      end();
      await serving;
      expect(written).toHaveLength(3);
      expect(written.every((line) => !line.includes("\n"))).toBe(true);
      const [initialize, list, call] = replies();
      expect(initialize).toMatchObject({ id: 1, result: { protocolVersion: "2025-11-25" } });
      expect(list).toMatchObject({
        id: 2,
        result: {
          tools: [
            { name: "read_ranges" },
            { name: "search" },
            { name: "repo_map" },
            { name: "run_tests" },
          ],
        },
      });
      expect(call).toMatchObject({
        id: 3,
        result: {
          content: [{ type: "text", text: "=== a.txt (lines 1 of 1)\n1\thello" }],
          isError: false,
        },
      });
      expect(await readdir(folders.outside)).toEqual([expect.stringMatching(/^coding-tools-/)]);
    });

    it("refuses to start when its code can be changed, before it reads anything", async () => {
      const folders = await testFolders();
      const code = await folders.write("server.js", "");
      const { channel, send } = testChannel();
      send(request(1, "initialize"));
      const start = {
        args: ["--temp-folder", folders.outside],
        cwd: folders.workingFolder,
        env: {},
        codePaths: [code],
        reportError: () => undefined,
      };
      await expect(runCodingToolsServer(start, channel)).rejects.toThrow(
        /can be changed from inside the sandbox/,
      );
      expect(await readdir(folders.outside)).toEqual([]);
    });

    it.each([
      [[], "needs --temp-folder"],
      [["--temp-folder"], "needs a value after --temp-folder"],
      [["--temp-folder", "x", "--read-write", "y"], "doesn't know the argument --read-write"],
    ])("refuses the arguments %j", (args, message) => {
      expect(() => readServerArguments(args)).toThrow(message);
    });
  });

  describe("the transport", () => {
    it("answers a quick request while a slow one runs, and gives a cancelled call no reply", async () => {
      const cancelled: string[] = [];
      const { channel, send, end, replies } = testChannel();
      const serving = serveOverStdio(waitingServer(cancelled), channel, () => undefined);
      send(request(1, "tools/call", { name: "slow", arguments: {} }));
      send(request(2, "ping"));
      await expect.poll(() => replies().length).toBe(1);
      send({ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 1 } });
      await expect.poll(() => cancelled).toEqual(["slow"]);
      end();
      await serving;
      expect(replies()).toEqual([{ jsonrpc: "2.0", id: 2, result: {} }]);
    });

    it("cancels the calls still running when its input ends", async () => {
      const cancelled: string[] = [];
      const { channel, send, end, replies } = testChannel();
      const serving = serveOverStdio(waitingServer(cancelled), channel, () => undefined);
      send(request(7, "tools/call", { name: "slow", arguments: {} }));
      end();
      await serving;
      expect(cancelled).toEqual(["slow"]);
      expect(replies()).toEqual([]);
    });

    it("answers a line that isn't JSON with a parse error", async () => {
      const { channel, sendText, end, replies } = testChannel();
      const serving = serveOverStdio(waitingServer([]), channel, () => undefined);
      sendText("{not json");
      end();
      await serving;
      expect(replies()).toMatchObject([{ id: null, error: { code: -32700 } }]);
    });
  });
});

verifies("coding-tools.read-only-choice", () => {
  it("reads --read-only and --max-test-seconds", () => {
    expect(readServerArguments(["--temp-folder", "t"])).toEqual({
      tempFolder: "t",
      choice: "all",
      maxTestSeconds: undefined,
    });
    expect(
      readServerArguments(["--read-only", "--temp-folder", "t", "--max-test-seconds", "60"]),
    ).toEqual({
      tempFolder: "t",
      choice: "read-only",
      maxTestSeconds: 60,
    });
  });

  it.each(["9", "1.5", "soon"])("refuses --max-test-seconds %s", (value) => {
    expect(() => readServerArguments(["--temp-folder", "t", "--max-test-seconds", value])).toThrow(
      "--max-test-seconds needs a whole number",
    );
  });

  it("serves only the reading tools with --read-only", async () => {
    const folders = await testFolders();
    const { channel, send, end, replies } = testChannel();
    const start = {
      args: ["--temp-folder", folders.outside, "--read-only"],
      cwd: folders.workingFolder,
      env: {},
      codePaths: [],
      reportError: () => undefined,
    };
    const serving = runCodingToolsServer(start, channel);
    send(request(1, "tools/list"));
    await expect.poll(() => replies().length).toBe(1);
    end();
    await serving;
    expect(replies()[0]).toMatchObject({
      result: { tools: [{ name: "read_ranges" }, { name: "search" }, { name: "repo_map" }] },
    });
    expect(JSON.stringify(replies())).not.toContain("run_tests");
  });
});
