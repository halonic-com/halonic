import type { GitHubGet } from "../pr-watcher/github.ts";
import type { ManifestChange, RoutedPull } from "../reviewer-paths.ts";
import { sensitiveOrigin, writtenByTeam } from "../reviewer-paths-routine.ts";
import type { PullDetails } from "./pr-status.ts";

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

/**
 * The old path of each renamed file, by its new path; null when GitHub
 * didn't name it, which routes the pull request to the code reviewer
 * (`RoutedPull.previousPaths`, HAL-19283).
 */
export function previousPathsOf(files: readonly ChangedFile[]): Record<string, string | null> {
  return Object.fromEntries(
    files.flatMap((file) =>
      file.status === "renamed" ? [[file.filename, file.previous_filename ?? null]] : [],
    ),
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

/**
 * The pull request as the reviewer path list reads it, from GitHub's REST
 * answers: the files with renamed files' old paths, the lines, the manifests,
 * who wrote it and whether its branch or labels make it a security or release
 * pull request (HAL-19283). `pr_status` and the PR watcher both build it here.
 */
export function routedFromRest(
  pull: PullDetails,
  repo: string,
  files: readonly ChangedFile[],
  manifests: Readonly<Record<string, ManifestChange>>,
): RoutedPull {
  const origin = {
    branch: pull.head.ref,
    crossRepository: pull.head.repo?.full_name.toLowerCase() !== repo.toLowerCase(),
    labels: (pull.labels ?? []).map((label) => label.name),
    author: pull.user?.login ?? null,
  };
  return {
    files: files.map((file) => file.filename),
    changedLines: (pull.additions ?? 0) + (pull.deletions ?? 0),
    sensitive: sensitiveOrigin(origin),
    manifests,
    fileLines: linesByFile(files),
    previousPaths: previousPathsOf(files),
    ours: writtenByTeam(origin),
  };
}
