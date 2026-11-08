import { execFileSync } from "node:child_process";
import { findRepoRoot, listWorkspacePackages } from "@halonicjs/tooling-check";
import {
  type OpenPullRequest,
  type PackageFolder,
  resolvePackage,
  touchesByPackage,
} from "../who-touches.ts";

/**
 * pnpm who-touches [<package>]
 *
 * Asks GitHub which files each open pull request changes and maps them to
 * packages, so an agent sees who else is working on a package before it
 * starts (plan 6.2). Without a package it lists every package with open
 * pull requests. Needs the GitHub CLI (`gh`), signed in.
 */

function openPullRequests(root: string): OpenPullRequest[] {
  const output = execFileSync(
    "gh",
    ["pr", "list", "--state", "open", "--limit", "200", "--json", "number,title,headRefName,files"],
    { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  return JSON.parse(output) as OpenPullRequest[];
}

function describe(pullRequest: OpenPullRequest): string {
  return `  #${pullRequest.number}  ${pullRequest.headRefName}  ${pullRequest.title}`;
}

function main(argv: readonly string[]): number {
  const root = findRepoRoot();
  const packages: PackageFolder[] = listWorkspacePackages(root).map((pkg) => ({
    name: pkg.manifest.name ?? pkg.directory,
    directory: pkg.directory,
  }));
  const query = argv.find((argument) => !argument.startsWith("-"));
  const target = query === undefined ? undefined : resolvePackage(query, packages);
  if (query !== undefined && target === undefined) {
    console.error(
      `No package matches "${query}". Use its name, its folder or its folder's last part.`,
    );
    return 2;
  }
  let pullRequests: OpenPullRequest[];
  try {
    pullRequests = openPullRequests(root);
  } catch {
    console.error(
      "who-touches: couldn't ask GitHub. Install the GitHub CLI and run `gh auth login`.",
    );
    return 1;
  }
  const touches = touchesByPackage(pullRequests, packages);
  if (target !== undefined) {
    const list = touches.get(target.name) ?? [];
    console.log(
      list.length === 0
        ? `No open pull request changes ${target.name}.`
        : `${list.length} open pull request(s) change ${target.name}:\n${list.map(describe).join("\n")}`,
    );
    return 0;
  }
  if (touches.size === 0) {
    console.log("No open pull requests.");
  }
  for (const [name, list] of [...touches].sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`${name}\n${list.map(describe).join("\n")}`);
  }
  return 0;
}

process.exitCode = main(process.argv.slice(2));
