/**
 * Whether this CLI runs from the npm package's bundle rather than from the repository. The stager
 * (`tooling/publish`) replaces this file with `true` when it bundles the CLI, as it replaces
 * `version.ts`. In the package, a folder found by counting `../` from the repository's layout
 * lands in the folders around the package, which aren't ours, so code that looks for a repository
 * folder looks only inside the package when this is true.
 */
export const inNpmPackage: boolean = false;
