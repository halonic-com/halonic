import { parseArgs } from "node:util";
import { type CommandInput, type CommandPath, UsageError } from "./command.ts";
import { globalOptionFlags } from "./global-options.ts";
import { commandWords, lastOf } from "./help.ts";
import { usageMessages } from "./messages/general.ts";
import { nearMatch } from "./near-match.ts";
import { shellWord } from "./output/shell-word.ts";

type Token = NonNullable<ReturnType<typeof parseArgs>["tokens"]>[number];

/**
 * Reads the arguments after the command name against the options of the
 * path's last command. The global options are already taken out (`readGlobalOptions`).
 *
 * @throws UsageError for an unknown option (with "Did you mean" when one is
 *   close, or the command line with the folder first for `--dir` to a
 *   command that takes its folder as an argument), a string option without
 *   its value, or a value given to a switch
 */
export function readInput(path: CommandPath, args: readonly string[]): CommandInput {
  const command = lastOf(path);
  const options = Object.fromEntries(
    Object.entries(command.options).map(([name, option]) => [
      name,
      { type: option.type, multiple: option.multiple ?? false },
    ]),
  );
  // Not strict, so the problems come back as tokens we word ourselves:
  // node:util's own messages are a library's text, which never reaches the user.
  const parsed = parseArgs({
    args: [...args],
    options,
    allowPositionals: true,
    strict: false,
    tokens: true,
  });
  if (command.folderArgument === true) {
    const folderFirst = dirMovedToFront(path, args, parsed.tokens);
    if (folderFirst !== undefined) throw folderFirst;
  }
  for (const token of parsed.tokens) {
    if (token.kind === "option") {
      checkOption(path, token.name, token.rawName, givenValue(token));
    }
  }
  return { positionals: parsed.positionals, options: parsed.values };
}

/**
 * The option's value, or `undefined` when it has none. Not being strict,
 * `parseArgs` takes the next argument as the value even when it is another
 * option: in `--from --loud` that is no value, while `--from=--loud` is one.
 */
function givenValue(token: {
  value?: string | undefined;
  inlineValue?: boolean | undefined;
}): string | undefined {
  if (token.value === undefined) {
    return undefined;
  }
  return token.inlineValue !== true && token.value.startsWith("-") ? undefined : token.value;
}

function checkOption(
  path: CommandPath,
  name: string,
  rawName: string,
  value: string | undefined,
): void {
  const command = lastOf(path);
  const option = Object.hasOwn(command.options, name) ? command.options[name] : undefined;
  if (option === undefined) {
    // Long spellings only: a short one such as -h is one edit from any other.
    const known = [
      ...Object.keys(command.options).map((known) => `--${known}`),
      ...globalOptionFlags,
    ];
    const near = nearMatch(rawName, known);
    throw new UsageError(
      near === undefined
        ? usageMessages.unknownOption(rawName)
        : usageMessages.unknownOptionNear(rawName, near),
      // The whole path, so `plugin add` points at `halonic plugin add --help` (HAL-12983).
      usageMessages.seeCommandOptions(commandWords(path)),
    );
  }
  if (option.type === "string" && value === undefined) {
    throw new UsageError(usageMessages.missingValue(rawName, option.valueName ?? "value"));
  }
  if (option.type === "boolean" && value !== undefined) {
    throw new UsageError(usageMessages.noValueWanted(rawName, `${rawName}=${value}`));
  }
}

/**
 * `--dir <folder>` to a command that takes its folder as its first argument:
 * "There's no option --dir.", with the same command line, the folder first
 * and the other arguments as given, such as `halonic init x --example acme`
 * (HAL-14262). `undefined` without `--dir`, with no folder after it, or with
 * a folder argument as well, which the usual errors cover.
 */
function dirMovedToFront(
  path: CommandPath,
  args: readonly string[],
  tokens: readonly Token[],
): UsageError | undefined {
  const dir = tokens.find((token) => token.kind === "option" && token.rawName === "--dir");
  if (dir === undefined || dir.kind !== "option") {
    return undefined;
  }
  // Not strict, `parseArgs` reads an unknown `--dir x` as a switch and `x` as an argument.
  const folderIndex = dir.inlineValue === true ? dir.index : dir.index + 1;
  const folder = dir.inlineValue === true ? dir.value : args[folderIndex];
  const otherArgument = tokens.some(
    (token) => token.kind === "positional" && token.index !== folderIndex,
  );
  if (folder === undefined || folder.startsWith("-") || otherArgument) {
    return undefined;
  }
  const rest = args.filter((_, index) => index !== dir.index && index !== folderIndex);
  const words = [folder, ...rest].map((word) => shellWord(word));
  return new UsageError(
    usageMessages.unknownOption(dir.rawName),
    usageMessages.folderFirst(["halonic", commandWords(path), ...words].join(" ")),
  );
}
