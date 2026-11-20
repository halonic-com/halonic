import type { DefinitionStore } from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";

/** The line that keeps Halonic's own data out of the history. */
const studioIgnoreLine = ".studio/";

/**
 * Adds `.studio/` to the folder's `.gitignore` unless it is listed already, for Turn on history.
 *
 * @throws when `.gitignore` appeared while it was being written
 */
export async function ignoreStudioFolder(
  files: Pick<DefinitionStore, "read" | "write">,
): Promise<void> {
  const current = await files.read(".gitignore");
  if (current !== null && ignoresStudio(current)) return;
  const separator = current === null || current === "" || current.endsWith("\n") ? "" : "\n";
  const text = `${current ?? ""}${separator}${studioIgnoreLine}\n`;
  // A file that is there is added to without a check: the line is only added, and git ignores
  // a repeated one. A new file must not appear in between.
  const result =
    current === null
      ? await files.write(".gitignore", text, { expected: "absent" })
      : await files.write(".gitignore", text);
  if (result.status === "changed-on-disk") {
    throw new KindedError(
      "conflict",
      ".gitignore changed while Halonic was changing it. Try again.",
    );
  }
}

/** Whether a `.gitignore` already lists the `.studio` folder. */
function ignoresStudio(text: string): boolean {
  return text
    .split("\n")
    .some((line) => [".studio", ".studio/", "/.studio", "/.studio/"].includes(line.trim()));
}
