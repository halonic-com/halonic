import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { encodeUtf8 } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { maxAnswerCharacters } from "../answer-cap.ts";
import { removeTestFolders, testFolders } from "../folders.test-helper.ts";
import { runCodingToolsServer } from "../stdio/server.ts";
import { ToolRefusal } from "../tool-input.ts";
import { nodeCommand } from "./node-command.test-helper.ts";
import { runTestsTool, secretValues, testEnvironment } from "./run-tests.ts";

afterEach(removeTestFolders);

/** A token-shaped value the tests put in the server's environment. */
const runToken = "acme-run-token-0123456789";

async function testsTool(maxTimeoutSeconds?: number) {
  const folders = await testFolders();
  const serverEnv = { PATH: process.env["PATH"], HALONIC_RUN_TOKEN: runToken, CI_FLAG: "1" };
  const tool = runTestsTool({
    folders,
    environment: testEnvironment(serverEnv),
    secrets: secretValues(serverEnv),
    ...(maxTimeoutSeconds === undefined ? {} : { maxTimeoutSeconds }),
  });
  const runTests = (args: Record<string, unknown>, signal = new AbortController().signal) =>
    tool.run(args, signal);
  return { folders, tool, runTests };
}

async function refusal(promise: Promise<string>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ToolRefusal) return error.message;
    throw error;
  }
  throw new Error("The call was answered.");
}

verifies("coding-tools.run-tests", () => {
  describe("the environment", () => {
    it("is programEnvironment's variables and the plain-output flags, without the token", () => {
      const env = testEnvironment({
        PATH: "/usr/bin",
        HALONIC_RUN_TOKEN: runToken,
        HOME: "acme-home",
      });
      expect(env).toEqual({ PATH: "/usr/bin", CI: "1", NO_COLOR: "1", FORCE_COLOR: "0" });
    });

    it("takes the values of secret-named variables as the secrets, not short flags", () => {
      expect(
        secretValues({ HALONIC_RUN_TOKEN: runToken, ACME_API_KEY: "1", PATH: "/usr/bin" }),
      ).toEqual([runToken]);
    });
  });

  describe("the answer", () => {
    it("gives the exit code, the command, the log, the failures and the last lines", async () => {
      const { folders, runTests } = await testsTool();
      const script =
        "console.log('ok a'); console.log('FAIL src/a.test.ts'); console.log('  expected 1 to be 2'); console.log('Tests  1 failed | 3 passed'); process.exit(1)";
      const command = nodeCommand(script);
      const answer = await runTests({ command, timeoutSeconds: 60 });
      const [logName] = await readdir(folders.testLogFolder);
      const log = join(folders.testLogFolder, logName ?? "");
      expect(answer).toContain(
        `exit code: 1\ncommand: ${command}\nfull output: ${log} (4 lines; read more of it with read_ranges)`,
      );
      expect(answer).toContain(
        "--- failures and summary ---\nok a\nFAIL src/a.test.ts\n  expected 1 to be 2\nTests  1 failed | 3 passed",
      );
      expect(answer).toContain("--- last 15 lines ---\nok a\nFAIL");
      expect(await readFile(log, "utf8")).toContain("FAIL src/a.test.ts");
    });

    it("removes the server's secrets from what the command printed", async () => {
      const { runTests } = await testsTool();
      const leaked = nodeCommand(`console.log('Error: token ${runToken}')`);
      const answer = await runTests({ command: leaked });
      expect(answer.replace(leaked, "")).not.toContain(runToken);
      expect(answer).toContain("Error: token [secret removed]");
    });

    it("says when the command was stopped at its time limit", async () => {
      const { runTests } = await testsTool();
      const answer = await runTests({
        command: nodeCommand("setTimeout(() => {}, 60000)"),
        timeoutSeconds: 10,
      });
      expect(answer).toMatch(/^stopped: still running after 10 s/);
    }, 30_000);

    it("keeps a flood of output out of the answer", async () => {
      const { runTests } = await testsTool();
      const answer = await runTests({
        command: nodeCommand("for (let i = 0; i < 200000; i += 1) console.log('Error: line ' + i)"),
      });
      expect(answer.length).toBeLessThanOrEqual(maxAnswerCharacters);
      expect(answer).toContain("--- last 15 lines ---");
    });
  });

  describe("calls", () => {
    it("runs one command at a time", async () => {
      const { runTests } = await testsTool();
      const controller = new AbortController();
      const first = runTests(
        { command: nodeCommand("setTimeout(() => {}, 60000)") },
        controller.signal,
      );
      expect(await refusal(runTests({ command: nodeCommand("console.log(1)") }))).toContain(
        "still running",
      );
      controller.abort();
      expect(await first).toMatch(/^stopped: the call was cancelled/);
      expect(await runTests({ command: nodeCommand("console.log(1)") })).toMatch(/^exit code: 0/);
    });

    it.each([
      ["no command", {}],
      ["a NUL in the command", { command: "echo a\0b" }],
      ["a time limit under 10 s", { command: "echo", timeoutSeconds: 5 }],
      ["an unknown argument", { command: "echo", filter: "a" }],
    ])("refuses %s", async (_name, args) => {
      const { runTests } = await testsTool();
      expect(await refusal(runTests(args))).not.toBe("");
    });

    it("never allows more time than --max-test-seconds", async () => {
      const { tool, runTests } = await testsTool(60);
      expect(tool.definition.inputSchema).toMatchObject({
        properties: { timeoutSeconds: { maximum: 60 } },
      });
      expect(await refusal(runTests({ command: "echo", timeoutSeconds: 61 }))).toContain(
        "from 10 to 60",
      );
    });

    it("isn't marked as only reading", async () => {
      const { tool } = await testsTool();
      expect(tool.readOnly).toBe(false);
    });
  });

  it("never lets test output reach the server's own output", async () => {
    const folders = await testFolders();
    const written: string[] = [];
    let push: (line: string) => void = () => undefined;
    let end: () => void = () => undefined;
    const input = new ReadableStream<Uint8Array>({
      start(controller) {
        push = (line) => controller.enqueue(encodeUtf8(`${line}\n`));
        end = () => controller.close();
      },
    });
    const start = {
      args: ["--temp-folder", folders.outside],
      cwd: folders.workingFolder,
      env: { PATH: process.env["PATH"] },
      codePaths: [],
      reportError: () => undefined,
    };
    const serving = runCodingToolsServer(start, { input, write: (line) => written.push(line) });
    const command = nodeCommand("console.log('a reply for id 99'); console.error('to stderr')");
    push(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "run_tests", arguments: { command } },
      }),
    );
    await expect.poll(() => written.length, { timeout: 20_000 }).toBe(1);
    end();
    await serving;
    expect(written).toHaveLength(1);
    expect(JSON.parse(written[0] ?? "")).toMatchObject({ id: 1, result: { isError: false } });
  });
});
