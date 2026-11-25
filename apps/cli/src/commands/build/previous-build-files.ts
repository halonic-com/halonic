// Reads the previous build `--since` names: its release file, then the
// archive that file names, from the same folder. Both are untrusted, so each
// is size-checked before it is read; the build service then checks the
// archive's sha-256 before it reads a byte of it.

import { open } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { PluginBuildProblem } from "@halonicjs/app";
import {
  maxPreviousArchiveBytes,
  maxReleaseFileBytes,
  type PreviousBuildFiles,
  parseReleaseFile,
} from "@halonicjs/plugin-build";
import { decodeUtf8 } from "@halonicjs/std";
import { DetailedError } from "../../command.ts";
import { buildMessages } from "../../messages/build.ts";

/**
 * The release file at `path` and the archive next to it.
 *
 * @param path - the release file, resolved
 * @param shown - the path as the user gave it, for the messages
 * @throws DetailedError `not_found` when either file is missing, and
 *   `invalid_input` when either is too large or the release file isn't one Halonic wrote
 */
export async function previousBuildFiles(path: string, shown: string): Promise<PreviousBuildFiles> {
  const releaseFile = decodeUtf8(await readUpTo(path, maxReleaseFileBytes, shown));
  const release = parseReleaseFile(releaseFile);
  if (!release.ok) {
    throw new DetailedError(
      "invalid_input",
      buildMessages.previousNotHalonic(shown),
      buildMessages.previousFix(),
    );
  }
  // The name passed the release file's strict schema, so it is a plain file name.
  const archive = await readUpTo(
    join(dirname(path), release.value.archive),
    maxPreviousArchiveBytes,
    shown,
  );
  return { releaseFile, archive };
}

/**
 * Why the build service refused the previous build, in the CLI's words.
 *
 * @param problem - a `previous-build` or `other-plugin` problem
 * @param shown - the release file's path as the user gave it
 */
export function previousBuildRefusal(
  problem: Extract<PluginBuildProblem, { code: "previous-build" | "other-plugin" }>,
  shown: string,
): DetailedError {
  if (problem.code === "other-plugin") {
    return new DetailedError(
      "invalid_input",
      buildMessages.otherPlugin(problem.previousPluginId, problem.pluginId),
      buildMessages.previousFix(),
    );
  }
  const reason =
    problem.problem.code === "sha256-mismatch"
      ? buildMessages.previousChanged(shown)
      : buildMessages.previousNotHalonic(shown);
  return new DetailedError("invalid_input", reason, buildMessages.previousFix());
}

/** A file's bytes, refused when it is missing or larger than `limit`, before it is read. */
async function readUpTo(path: string, limit: number, shown: string): Promise<Uint8Array> {
  const file = await open(path, "r").catch(() => {
    throw new DetailedError(
      "not_found",
      buildMessages.noPrevious(shown),
      buildMessages.previousFix(),
    );
  });
  const tooLarge = () =>
    new DetailedError(
      "invalid_input",
      buildMessages.previousNotHalonic(shown),
      buildMessages.previousFix(),
    );
  try {
    const { size } = await file.stat();
    if (size > limit) throw tooLarge();
    // Never more than the size seen plus one byte, so a file that grows meanwhile is refused too.
    const bytes = new Uint8Array(size + 1);
    let read = 0;
    for (;;) {
      const { bytesRead } = await file.read(bytes, read, bytes.length - read, read);
      if (bytesRead === 0) break;
      read += bytesRead;
      if (read > size) throw tooLarge();
    }
    return bytes.subarray(0, read);
  } finally {
    await file.close();
  }
}
