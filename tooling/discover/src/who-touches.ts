/** An open pull request and the files it changes. */
export interface OpenPullRequest {
  readonly number: number;
  readonly title: string;
  readonly headRefName: string;
  readonly files: readonly { readonly path: string }[];
}

/** A package and its folder, relative to the repo root. */
export interface PackageFolder {
  readonly name: string;
  readonly directory: string;
}

/**
 * The package a file belongs to: the one with the longest folder that
 * contains it. Files outside every package belong to the repo root.
 */
export function packageOfFile(file: string, packages: readonly PackageFolder[]): string {
  let best: PackageFolder | undefined;
  for (const pkg of packages) {
    if (pkg.directory !== "" && (file === pkg.directory || file.startsWith(`${pkg.directory}/`))) {
      if (best === undefined || pkg.directory.length > best.directory.length) {
        best = pkg;
      }
    }
  }
  return best?.name ?? "(repo root)";
}

/** For each package, the open pull requests that change it. */
export function touchesByPackage(
  pullRequests: readonly OpenPullRequest[],
  packages: readonly PackageFolder[],
): Map<string, OpenPullRequest[]> {
  const result = new Map<string, OpenPullRequest[]>();
  for (const pullRequest of pullRequests) {
    const touched = new Set(pullRequest.files.map((file) => packageOfFile(file.path, packages)));
    for (const name of touched) {
      const list = result.get(name) ?? [];
      list.push(pullRequest);
      result.set(name, list);
    }
  }
  return result;
}

/**
 * Finds the package a person means: its full name, its folder, or the last
 * part of either (`engine` finds `@halonicjs/engine` in `packages/core/engine`).
 */
export function resolvePackage(
  query: string,
  packages: readonly PackageFolder[],
): PackageFolder | undefined {
  const trimmed = query.replace(/\/+$/, "");
  return (
    packages.find((pkg) => pkg.name === trimmed || pkg.directory === trimmed) ??
    packages.find(
      (pkg) =>
        pkg.directory.split("/").at(-1) === trimmed || pkg.name.split("/").at(-1) === trimmed,
    )
  );
}
