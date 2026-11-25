import type { GitHubGet } from "../pr-watcher/github.ts";
import type { ManifestChange } from "../reviewer-paths.ts";

/**
 * Reads each changed package `package.json` at the pull request's merge base
 * and head, so the reviewer path list compares parsed fields instead of
 * guessing from diff lines (HAL-14809).
 */

/** A changed file as GitHub's pull request file list gives it. */
export interface ChangedFile {
  readonly filename: string;
  /** `added`, `removed`, `modified`, `renamed`, … */
  readonly status?: string;
  /** The old path of a renamed file. */
  readonly previous_filename?: string;
  /** Additions plus deletions. */
  readonly changes?: number;
}

/** Changed lines per file, for `reviewerFor`'s line limits; a file without a count is left out. */
export function linesByFile(files: readonly ChangedFile[]): Record<string, number> {
  return Object.fromEntries(
    files.flatMap((file) => (file.changes === undefined ? [] : [[file.filename, file.changes]])),
  );
}

/** The refs to compare: undefined `base` when the merge base isn't known. */
export interface ManifestRefs {
  readonly base: string | undefined;
  readonly head: string;
}

/**
 * Each changed package manifest at base and head, by path. A manifest that
 * can't be read gets no entry, and routing counts a missing entry as Liam's.
 */
export async function readManifests(
  get: GitHubGet,
  repo: string,
  files: readonly ChangedFile[],
  refs: ManifestRefs,
): Promise<Record<string, ManifestChange>> {
  const { base, head } = refs;
  if (base === undefined) {
    return {};
  }
  const manifests = files.filter((file) => file.filename.endsWith("/package.json"));
  const read = await Promise.all(
    manifests.map(async (file) => {
      const change = await readManifest(get, repo, file, { base, head });
      return [file.filename, change] as const;
    }),
  );
  return Object.fromEntries(
    read.flatMap(([path, change]) => (change === undefined ? [] : [[path, change] as const])),
  );
}

async function readManifest(
  get: GitHubGet,
  repo: string,
  file: ChangedFile,
  refs: { base: string; head: string },
): Promise<ManifestChange | undefined> {
  try {
    const before =
      file.status === "added"
        ? null
        : await fileAt(get, repo, file.previous_filename ?? file.filename, refs.base);
    const after =
      file.status === "removed" ? null : await fileAt(get, repo, file.filename, refs.head);
    return { before, after };
  } catch {
    // Unreadable (missing, too big, GitHub down): no entry, so it counts as
    // Liam's rather than failing the whole status read.
    return undefined;
  }
}

/** A file's text at a commit, from the contents API's base64 body. */
async function fileAt(get: GitHubGet, repo: string, path: string, ref: string): Promise<string> {
  // Each part encoded, like a branch name, so the path can't change the request.
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  const body = (await get(`/repos/${repo}/contents/${encoded}?ref=${encodeURIComponent(ref)}`)) as {
    content?: unknown;
    encoding?: unknown;
  } | null;
  if (body?.encoding !== "base64" || typeof body.content !== "string") {
    throw new Error(`GitHub: no file content for ${path} at ${ref}.`);
  }
  const binary = atob(body.content.replace(/\s/g, ""));
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}
