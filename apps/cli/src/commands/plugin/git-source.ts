// A plugin from a git address, for `halonic plugin add <git address>[@commit]`:
// the address and commit split apart, and one commit exported, without
// `.git`, into a temporary folder outside every workspace, through the
// hardened git adapter. `plugin add` then adds from that folder as it does
// from any other.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkGitExport, exportCommit, type GitExport, GitRunner } from "@halonicjs/adapter-git";

/** A git address as `plugin add` was given it, with the commit after `@` apart. */
export interface GitSource {
  /** The address without the commit, such as `https://github.com/acme/weather`. */
  readonly address: string;
  /** The branch, tag or full commit id after `@`; `undefined` for the remote's default branch. */
  readonly commit: string | undefined;
}

/**
 * Exports one commit of a git repository into the empty folder
 * `destination`, refusing an unsafe address or commit before git reaches
 * the remote. The CLI's is {@link exportWithGit}; tests pass their own.
 */
export type GitExporter = (source: GitSource, destination: string) => Promise<GitExport>;

/**
 * What makes a source a git address rather than a folder: a scheme such as
 * `https://` or `ssh://`, a transport such as `ext::`, or git's short ssh
 * form `user@host:path`. Each is a git address even when the export will
 * refuse it, so the refusal says why instead of "isn't a folder".
 */
const gitAddressForms = [
  /^[A-Za-z][A-Za-z0-9+.-]*:\/\//u,
  /^[A-Za-z][A-Za-z0-9+.-]*::/u,
  /^[^/\\@]+@[^/\\:]+:/u,
];

/**
 * The git address in `source`, or `null` when `source` is a folder. The
 * commit is what follows the last `@` after the last `/` and `:`, so the
 * user in `ssh://git@example.com/acme/weather` or `git@example.com:weather`
 * stays part of the address. Unsafe
 * addresses are still git addresses here: the export refuses them.
 *
 * @example
 * gitSourceOf("https://github.com/acme/weather@v1.2.0");
 * // { address: "https://github.com/acme/weather", commit: "v1.2.0" }
 */
export function gitSourceOf(source: string): GitSource | null {
  if (!gitAddressForms.some((form) => form.test(source))) return null;
  const at = source.lastIndexOf("@");
  if (at < Math.max(source.lastIndexOf("/"), source.lastIndexOf(":"))) {
    return { address: source, commit: undefined };
  }
  return { address: source.slice(0, at), commit: source.slice(at + 1) };
}

/**
 * Refuses an unsafe address or commit, as the export would, without
 * starting anything. `plugin add` runs it before it shows the address on
 * the live line, so a refused address, which may hold a password, is never
 * printed.
 *
 * @throws Error saying what was refused, never echoing a password
 */
export function checkGitSource(source: GitSource): void {
  checkGitExport(source.address, source.commit);
}

/**
 * The CLI's {@link GitExporter}: the git on the `PATH`, hardened, closed
 * when done. An unsafe address or commit is refused before git is even
 * looked for.
 */
export const exportWithGit: GitExporter = async (source, destination) => {
  checkGitSource(source);
  const runner = await GitRunner.create();
  try {
    return await exportCommit(runner, source.address, destination, source.commit);
  } finally {
    await runner.close();
  }
};

/** A commit exported into a temporary folder, which {@link ExportedSource.remove} deletes. */
export interface ExportedSource extends GitExport {
  /** The folder the commit's files are in. */
  readonly folder: string;
  remove(): Promise<void>;
}

/**
 * Exports `source` with `exporter` into a new temporary folder. The folder
 * is deleted again when the export fails; otherwise the caller removes it.
 *
 * @throws what the exporter throws, such as a refused address
 */
export async function exportToTemporaryFolder(
  source: GitSource,
  exporter: GitExporter,
): Promise<ExportedSource> {
  const work = await mkdtemp(join(tmpdir(), "halonic-plugin-git-"));
  const remove = () => rm(work, { recursive: true, force: true });
  try {
    const folder = join(work, "plugin");
    const exported = await exporter(source, folder);
    return { ...exported, folder, remove };
  } catch (error) {
    await remove();
    throw error;
  }
}
