import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { programEnvironment } from "@halonicjs/adapter-harness-kit";
import { isSecretVariableName, SecretScrubber } from "@halonicjs/std";
import type { CodingTool } from "../coding-tool.ts";
import type { ToolFolders } from "../folders.ts";
import { maxReadBytes } from "../read/read-ranges.ts";
import {
  optionalInteger,
  refuseUnknownArguments,
  requiredText,
  ToolRefusal,
} from "../tool-input.ts";
import { runCommand } from "./start-command.ts";
import { testRunAnswer } from "./test-output.ts";

/** The test run's time limits, in seconds. */
const timeouts = { default: 300, min: 10, max: 900 } as const;

/** What `run_tests` needs besides its folders. */
export interface RunTestsOptions {
  readonly folders: ToolFolders;
  /** The command's whole environment: see {@link testEnvironment}. */
  readonly environment: Readonly<Record<string, string>>;
  /** Values removed from the answer wherever they appear: see {@link secretValues}. */
  readonly secrets: readonly string[];
  /** The longest a run may take, when the step's own time limit is shorter than 900 s. */
  readonly maxTimeoutSeconds?: number;
}

/**
 * The environment a test command gets: the same variables a harness
 * program gets from its starter (`programEnvironment`, where to find
 * programs and the locale, never a key), plus the flags that make test
 * runners print plainly. It is built from that list, never by copying the
 * server's own environment, which holds the run token (HAL-16748).
 */
export function testEnvironment(
  variables: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
  return { ...programEnvironment(variables), CI: "1", NO_COLOR: "1", FORCE_COLOR: "0" };
}

/**
 * The values of the variables whose names say they hold a secret, such as
 * `HALONIC_RUN_TOKEN` or `ANTHROPIC_API_KEY`, as std's
 * `isSecretVariableName` decides it. Values shorter than 4 characters are
 * flags such as `1`, not keys.
 */
export function secretValues(variables: Readonly<Record<string, string | undefined>>): string[] {
  return Object.entries(variables)
    .filter(
      ([name, value]) => isSecretVariableName(name) && value !== undefined && value.length >= 4,
    )
    .map(([, value]) => value ?? "");
}

const description =
  "Run a test command in the working folder and get back only what matters: the exit code, " +
  "the failing tests with their messages, the summary and the last lines. The full output goes to a log file " +
  "you can read on with read_ranges. One run at a time.";

/**
 * `run_tests` (requirement `coding-tools.run-tests`). It isn't read-only,
 * so it is never allowed without asking: each call reaches the person's
 * approval card with the command as written, as `Bash` does.
 */
export function runTestsTool(options: RunTestsOptions): CodingTool {
  const maxTimeout = Math.min(timeouts.max, options.maxTimeoutSeconds ?? timeouts.max);
  const scrubber = new SecretScrubber();
  for (const secret of options.secrets) scrubber.remember(secret);
  let running = false;
  let runs = 0;
  return {
    definition: {
      name: "run_tests",
      description,
      inputSchema: {
        type: "object",
        required: ["command"],
        additionalProperties: false,
        properties: {
          command: {
            type: "string",
            description: "The test command, as you would type it in the shell.",
          },
          timeoutSeconds: { type: "integer", minimum: timeouts.min, maximum: maxTimeout },
        },
      },
    },
    readOnly: false,
    async run(args, signal) {
      refuseUnknownArguments(args, ["command", "timeoutSeconds"]);
      const command = requiredText(args, "command", 2_000);
      if (command.includes("\0")) throw new ToolRefusal("'command' can't hold a NUL character.");
      const timeoutSeconds =
        optionalInteger(args, "timeoutSeconds", { min: timeouts.min, max: maxTimeout }) ??
        Math.min(timeouts.default, maxTimeout);
      if (running)
        throw new ToolRefusal("Another run_tests call is still running; wait for its answer.");
      running = true;
      try {
        runs += 1;
        const logFile = join(options.folders.testLogFolder, `run-${runs}-${Date.now()}.log`);
        const end = await runCommand({
          command,
          cwd: options.folders.workingFolder,
          env: options.environment,
          logFile,
          maxLogBytes: maxReadBytes,
          timeoutMs: timeoutSeconds * 1_000,
          signal,
        }).catch((error: unknown) => {
          throw new ToolRefusal(error instanceof Error ? error.message : String(error));
        });
        const output = await readFile(logFile, "utf8");
        return testRunAnswer({ command, end, timeoutSeconds, logFile, output }, scrubber);
      } finally {
        running = false;
      }
    },
  };
}
