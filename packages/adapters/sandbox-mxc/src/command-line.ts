// The Windows command line MXC's `spawn` takes: one string, with the program
// and its arguments quoted so that Windows reads them back as they were given.

import { win32 } from "node:path";

/**
 * The two Node flags that stop Node from asking for every parent folder of a
 * script, the drive root included, which the box can't read (HAL-2444). Node
 * programs get them as arguments and, for the Node programs they start,
 * through `NODE_OPTIONS` (HAL-3503, rule 3).
 */
export const symlinkFlags = ["--preserve-symlinks", "--preserve-symlinks-main"] as const;

/** The program is Node itself: `node` or `node.exe`, by name or path. */
const isNode = /^node(\.exe)?$/i;

/** A batch file: `cmd.exe` reads its arguments by rules no quoting can make safe. */
const isBatchFile = /\.(bat|cmd)\s*$/i;

/** An argument that needs no quotes. */
const plainArgument = /^[^\s"]+$/;

/**
 * The command line for `program` and `args`. A Node program gets the two
 * symlink flags first.
 *
 * @example
 * windowsCommandLine("C:\\acme\\node.exe", ["my script.js"]); // leak-guard: allow absolute-path made-up example path
 * // C:\acme\node.exe --preserve-symlinks --preserve-symlinks-main "my script.js" // leak-guard: allow absolute-path made-up example path
 *
 * @throws when the program is empty, is a batch file, or when anything has a NUL character
 */
export function windowsCommandLine(program: string, args: readonly string[]): string {
  if (program.trim() === "") throw new Error("MXC needs a program to start.");
  if (isBatchFile.test(program)) {
    throw new Error(
      `MXC doesn't start batch files, and "${program}" is one: cmd.exe reads their arguments by rules that no quoting makes safe.`,
    );
  }
  if ([program, ...args].some((part) => part.includes("\0"))) {
    throw new Error("A program and its arguments can't hold a NUL character.");
  }
  const flags = isNode.test(win32.basename(program)) ? symlinkFlags : [];
  return [program, ...flags, ...args].map(quote).join(" ");
}

/**
 * One argument, quoted by the rules `CommandLineToArgvW` and the C runtime
 * read back: backslashes only count before a quote, so a run of them before a
 * quote (or the closing quote) is doubled and the quote itself is escaped.
 */
function quote(argument: string): string {
  if (plainArgument.test(argument)) return argument;
  let quoted = '"';
  let backslashes = 0;
  for (const char of argument) {
    if (char === "\\") {
      backslashes += 1;
      continue;
    }
    quoted +=
      char === '"' ? `${"\\".repeat(backslashes * 2 + 1)}"` : `${"\\".repeat(backslashes)}${char}`;
    backslashes = 0;
  }
  return `${quoted}${"\\".repeat(backslashes * 2)}"`;
}
