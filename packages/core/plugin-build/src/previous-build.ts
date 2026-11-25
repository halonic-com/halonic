// Reading the previous build for `--since`. Both files come from a folder
// the user names, so both are untrusted. In order (Liam's conditions on
// HAL-17985): read the release file strictly, check the archive's sha-256
// against it before reading a single header, read only
// `package/snapshot.json` with a size cap, and check that snapshot as data.

import { type Issue, parse } from "@halonicjs/schema-kit";
import { decodeUtf8, err, ok, type Result, type Sha256 } from "@halonicjs/std";
import { archiveSha256, snapshotPath } from "./plugin-archive.ts";
import { parseReleaseFile, type ReleaseFile, type ReleaseFileProblem } from "./release-file.ts";
import type { PluginSnapshot } from "./snapshot.ts";
import { untrustedSnapshot } from "./snapshot.ts";
import { readTarFile, type TarReadProblem } from "./tar-read.ts";

/** The largest archive a build reads back; a plugin package is far smaller. */
export const maxPreviousArchiveBytes = 32 * 1024 * 1024;

/** The largest snapshot a build reads back out of a previous archive. */
export const maxPreviousSnapshotBytes = 4 * 1024 * 1024;

/** The previous build, read and checked. */
export interface PreviousBuild {
  /** Its release file. */
  readonly release: ReleaseFile;
  /** The snapshot inside its archive. */
  readonly snapshot: PluginSnapshot;
}

/** Why the previous build couldn't be read. */
export type PreviousBuildProblem =
  | { readonly code: "release-file"; readonly problem: ReleaseFileProblem }
  | { readonly code: "archive-too-large"; readonly maxBytes: number }
  | { readonly code: "sha256-mismatch"; readonly expected: string; readonly actual: string }
  | { readonly code: "archive"; readonly problem: TarReadProblem }
  | { readonly code: "snapshot-not-json" }
  | { readonly code: "snapshot-invalid"; readonly issues: readonly Issue[] };

/** The previous build's two files, as the caller read them from disk. */
export interface PreviousBuildFiles {
  /** The release file's text. */
  readonly releaseFile: string;
  /** The bytes of the archive the release file names. */
  readonly archive: Uint8Array;
}

/**
 * Reads the previous build's snapshot, checking each step before the next.
 * The archive is hashed before any of it is read, so a file that isn't the
 * one the release file names is refused whole.
 *
 * @param files - the release file's text and the archive's bytes
 * @param digest - hashes the archive (the `Digest` port)
 * @returns the release file and snapshot, or the first problem found
 */
export async function readPreviousBuild(
  files: PreviousBuildFiles,
  digest: Sha256,
): Promise<Result<PreviousBuild, PreviousBuildProblem>> {
  const release = parseReleaseFile(files.releaseFile);
  if (!release.ok) {
    return err({ code: "release-file", problem: release.error });
  }
  if (files.archive.length > maxPreviousArchiveBytes) {
    return err({ code: "archive-too-large", maxBytes: maxPreviousArchiveBytes });
  }
  const actual = await archiveSha256(files.archive, digest);
  if (actual !== release.value.sha256) {
    return err({ code: "sha256-mismatch", expected: release.value.sha256, actual });
  }
  const bytes = readTarFile(files.archive, snapshotPath, maxPreviousSnapshotBytes);
  if (!bytes.ok) {
    return err({ code: "archive", problem: bytes.error });
  }
  const snapshot = readSnapshot(bytes.value);
  if (!snapshot.ok) {
    return snapshot;
  }
  return ok({ release: release.value, snapshot: snapshot.value });
}

function readSnapshot(bytes: Uint8Array): Result<PluginSnapshot, PreviousBuildProblem> {
  let data: unknown;
  try {
    data = JSON.parse(decodeUtf8(bytes));
  } catch {
    // The parser's message can quote the input; the code is all a caller needs.
    return err({ code: "snapshot-not-json" });
  }
  const checked = parse(untrustedSnapshot, data);
  if (!checked.ok) {
    return err({ code: "snapshot-invalid", issues: checked.error });
  }
  return ok(checked.value);
}
