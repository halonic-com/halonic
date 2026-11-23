import { randomUUID } from "node:crypto";
import { mkdir, realpath } from "node:fs/promises";
import { join } from "node:path";
import { McpToolServer } from "@halonicjs/adapter-mcp/server";
import { type CodingToolChoice, CodingToolSet } from "../coding-tool-set.ts";
import { secretValues, testEnvironment } from "../run-tests/run-tests.ts";
import { refuseChangeableCode, type WriteProbe } from "./own-code-check.ts";
import { type StdioChannel, serveOverStdio } from "./serve-stdio.ts";

/** What the server is started with, besides its channel. */
export interface CodingToolsStart {
  /** The arguments after the runtime's `coding-tools` mode: see {@link readServerArguments}. */
  readonly args: readonly string[];
  /** The folder the harness program started the server in: the agent's working folder. */
  readonly cwd: string;
  /** The server's environment, as the harness program passed it on. */
  readonly env: Readonly<Record<string, string | undefined>>;
  /** The runtime and the files and folders of the server's code, none of which may be writable. */
  readonly codePaths: readonly string[];
  /** Hears of a failure inside the server, which the client only gets an internal error for. */
  reportError(error: unknown): void;
  /** How to tell whether a path can be changed; this computer's by default. */
  readonly probe?: WriteProbe;
}

/** The server's command-line arguments, read. */
export interface ServerArguments {
  /** The session's temp folder, where the server makes its own folder for test logs. */
  readonly tempFolder: string;
  readonly choice: CodingToolChoice;
  /** The longest a test run may take, in seconds, or `undefined` for the tool's own limit. */
  readonly maxTestSeconds: number | undefined;
}

/**
 * Reads `--temp-folder <path>` (required), `--read-only` and
 * `--max-test-seconds <n>` (requirement `coding-tools.read-only-choice`).
 *
 * @throws Error for an argument it doesn't know or a missing value
 */
export function readServerArguments(args: readonly string[]): ServerArguments {
  let tempFolder: string | undefined;
  let choice: CodingToolChoice = "all";
  let maxTestSeconds: number | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index];
    if (name === "--read-only") {
      choice = "read-only";
      continue;
    }
    const value = args[index + 1];
    if (value === undefined)
      throw new Error(`The coding tools server needs a value after ${name}.`);
    index += 1;
    if (name === "--temp-folder") tempFolder = value;
    else if (name === "--max-test-seconds") maxTestSeconds = wholeSeconds(value);
    else throw new Error(`The coding tools server doesn't know the argument ${name}.`);
  }
  if (tempFolder === undefined) throw new Error("The coding tools server needs --temp-folder.");
  return { tempFolder, choice, maxTestSeconds };
}

/**
 * Starts the coding tools server and serves it on the channel until its
 * input ends (requirement `coding-tools.stdio`). It first refuses to start
 * when its own code can be changed from here. Test logs go to a new folder
 * of its own in the session's temp folder, so the one exception to
 * `read_ranges`' working folder holds nothing but them.
 *
 * @throws Error for wrong arguments, a temp folder that isn't there, or changeable code
 */
export async function runCodingToolsServer(
  start: CodingToolsStart,
  channel: StdioChannel,
): Promise<void> {
  const args = readServerArguments(start.args);
  await refuseChangeableCode(start.codePaths, start.probe);
  const workingFolder = await realpath(start.cwd);
  const testLogFolder = join(await realpath(args.tempFolder), `coding-tools-${randomUUID()}`);
  await mkdir(testLogFolder);
  const tools = new CodingToolSet({
    folders: { workingFolder, testLogFolder },
    choice: args.choice,
    testEnvironment: testEnvironment(start.env),
    secrets: secretValues(start.env),
    ...(args.maxTestSeconds === undefined ? {} : { maxTestSeconds: args.maxTestSeconds }),
  });
  const server = new McpToolServer(tools, { reportError: start.reportError });
  await serveOverStdio(server, channel, start.reportError);
}

function wholeSeconds(value: string): number {
  const seconds = Number(value);
  if (!Number.isInteger(seconds) || seconds < 10) {
    throw new Error(
      `--max-test-seconds needs a whole number of seconds, at least 10, not ${value}.`,
    );
  }
  return seconds;
}
