import type { Version } from "@halonicjs/studio-feature-source-control/api";

/**
 * The arguments of the `git log` whose output {@link versionsFromLog} reads: the newest `limit`
 * commits that touch the folder, each with its id, author, time and message, then its files.
 * Every call is on the shell's allow-list as it is.
 */
export function historyArgs(limit: number): readonly string[] {
  return [
    "log",
    "-z",
    "--name-only",
    `--max-count=${limit}`,
    "--format=%x01%H%x1f%an%x1f%at%x1f%B%x1f",
    "--",
    ".",
  ];
}

/**
 * Reads what {@link historyArgs} printed. Each commit starts with U+0001; its fields are
 * separated by U+001F, and its file names follow, each ended by NUL. A file `keep` refuses is
 * left out of the version.
 */
export function versionsFromLog(output: string, keep: (path: string) => boolean): Version[] {
  const versions: Version[] = [];
  for (const record of output.split("\u0001")) {
    const end = record.indexOf("\u001f\0");
    if (end === -1) continue;
    const [id = "", author = "", seconds = "", ...message] = record.slice(0, end).split("\u001f");
    const [name = "", ...rest] = message.join("\u001f").trim().split(/\r?\n/);
    const files = record
      .slice(end + 2)
      .split("\0")
      .map((path) => path.replace(/^\n/, ""))
      .filter((path) => path !== "" && keep(path));
    versions.push({
      id,
      name: name.trim(),
      notes: rest.join("\n").trim(),
      author,
      at: Number(seconds) * 1000,
      files,
    });
  }
  return versions;
}
