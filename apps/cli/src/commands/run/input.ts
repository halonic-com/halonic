// `halonic run --input <file or JSON>`: the run's input, from a JSON file or
// from the JSON itself. Text that starts with `{` or `[` is JSON; anything
// else names a file, relative to the folder the command runs in.

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { KindedError } from "@halonicjs/std";
import type { Message } from "../../messages/define.ts";
import { plainText } from "../../messages/phrase.ts";
import { runMessages } from "../../messages/run.ts";

/**
 * `--input` couldn't be read as a JSON object (`invalid_input`, exit 2).
 * Its message is the reason after "Couldn't run support-reply:", and its
 * fix says what to do about that reason.
 */
export class RunInputError extends KindedError {
  constructor(reason: Message, fix: Message, cause?: unknown) {
    super("invalid_input", plainText(reason.phrase), {
      fix: plainText(fix.phrase),
      ...(cause === undefined ? {} : { cause }),
    });
  }
}

/**
 * The run's input from `--input`: `{}` without one.
 *
 * @param given - the option's value as typed
 * @param cwd - the folder a file is found from
 * @throws RunInputError when the file doesn't exist, the file or the text
 *   isn't JSON, or the JSON isn't an object
 *
 * @example
 * await runInputOf("examples/refund-question.json", "/work/acme");
 * // { mail: "Hi, my order #1042 arrived damaged. …" }
 * await runInputOf('{"mail": "Hi"}', "/work/acme"); // { mail: "Hi" }
 */
export async function runInputOf(
  given: string | undefined,
  cwd: string,
): Promise<Record<string, unknown>> {
  if (given === undefined) {
    return {};
  }
  const looksLikeJson = /^\s*[{[]/.test(given);
  const text = looksLikeJson ? given : await inputFile(given, cwd);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new RunInputError(
      runMessages.inputNotJson(looksLikeJson ? undefined : given),
      runMessages.inputFix(),
      error,
    );
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new RunInputError(runMessages.inputNotAnObject(), runMessages.inputFix());
  }
  return value as Record<string, unknown>;
}

/** The text of the input file; a file that isn't there is the user's typo, not a crash. */
async function inputFile(path: string, cwd: string): Promise<string> {
  try {
    return await readFile(resolve(cwd, path), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new RunInputError(runMessages.noInputFile(path), runMessages.noInputFileFix(), error);
    }
    throw error;
  }
}
