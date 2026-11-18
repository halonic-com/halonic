import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { CliCommand } from "./command.ts";
import { exitCode } from "./exit-code.ts";
import { commands } from "./generated/commands.ts";
import { runCli } from "./run-cli.ts";
import { captureIo } from "./test/capture-io.ts";

const everyCommand = Object.values(commands);

/** Every command that runs, as the words that reach it, such as `["secret", "list"]`. */
function runnableCommands(
  list: readonly CliCommand[],
  above: readonly string[] = [],
): { readonly words: readonly string[]; readonly command: CliCommand }[] {
  return list.flatMap((command) => {
    const words = [...above, command.name];
    if (command.subcommands !== undefined) {
      return runnableCommands(command.subcommands, words);
    }
    return [{ words, command }];
  });
}

/** Runs the real CLI in a folder that holds no workspace, so a command that ignored the argument would fail differently. */
async function run(args: readonly string[]) {
  const io = captureIo("/nowhere");
  const code = await runCli(args, io, everyCommand);
  return { code, stderr: io.stderr };
}

verifies("cli.no-stray-arguments", () => {
  describe("an argument to a command that takes none", () => {
    it("refuses a folder given to validate, and points to --dir and to plugin add", async () => {
      const { code, stderr } = await run(["validate", "./lt"]);
      expect(code).toBe(exitCode.usage);
      expect(stderr).toEqual([
        "✕ halonic validate takes no arguments, and you gave ./lt.",
        "  To check the workspace in ./lt, run halonic validate --dir ./lt. For a plugin folder, run halonic plugin add ./lt.",
      ]);
    });

    it("points another command with --dir to it", async () => {
      const { code, stderr } = await run(["doctor", "./lt"]);
      expect(code).toBe(exitCode.usage);
      expect(stderr).toEqual([
        "✕ halonic doctor takes no arguments, and you gave ./lt.",
        "  To use the workspace in ./lt, run halonic doctor --dir ./lt.",
      ]);
    });

    it("shows the usage line for several arguments, as there's no one folder to suggest", async () => {
      const { code, stderr } = await run(["validate", "./lt", "./acme"]);
      expect(code).toBe(exitCode.usage);
      expect(stderr).toEqual([
        "✕ halonic validate takes no arguments, and you gave ./lt ./acme.",
        "  Usage: halonic validate [--dir <folder>] [--all] [--strict]",
      ]);
    });

    it("shows the usage line for a command without --dir", async () => {
      const { code, stderr } = await run(["secret", "list", "openai-key"]);
      expect(code).toBe(exitCode.usage);
      expect(stderr).toEqual([
        "✕ halonic secret list takes no arguments, and you gave openai-key.",
        "  Usage: halonic secret list",
      ]);
    });

    it("is refused by every command that takes none, before it runs", async () => {
      const takesNone = runnableCommands(everyCommand).filter(
        ({ command }) => command.takesArguments !== true,
      );
      expect(takesNone.map(({ words }) => words.join(" "))).toContain("validate");
      for (const { words } of takesNone) {
        const { code, stderr } = await run([...words, "stray"]);
        expect(code, words.join(" ")).toBe(exitCode.usage);
        expect(stderr[0]).toBe(
          `✕ halonic ${words.join(" ")} takes no arguments, and you gave stray.`,
        );
      }
    });
  });
});
