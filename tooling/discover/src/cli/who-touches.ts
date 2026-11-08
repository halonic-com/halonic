import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import { findRepoRoot, listWorkspacePackages, owningPackage } from "@halonicjs/tooling-check";
import {
  fetchOpenPullRequests,
  type OpenPullRequest,
  type PackageFolder,
  repoFromRemote,
  resolvePackage,
  touchesByPackage,
} from "../who-touches.ts";

/**
 * pnpm who-touches [<package>] [--repo <owner/name>]
 *
 * Asks GitHub which files each open pull request changes and maps them to
 * packages, so an agent sees who else is working on a package before it
 * starts. Without a package it lists every package with open
 * pull requests. Uses GitHub's public REST API, so it needs no sign-in;
 * set `GH_TOKEN` for the higher rate limit.
 */

const defaultRepo = "halonic-com/halonic";

function originRepo(root: string): string | undefined {
  try {
    const url = execFileSync("git", ["remote", "get-url", "origin"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return repoFromRemote(url);
  } catch {
    return undefined;
  }
}

function describe(pullRequest: OpenPullRequest): string {
  return `  #${pullRequest.number}  ${pullRequest.headRefName}  ${pullRequest.title}`;
}

async function main(argv: readonly string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: [...argv],
    options: { repo: { type: "string" } },
    allowPositionals: true,
  });
  const root = findRepoRoot();
  const workspace = listWorkspacePackages(root);
  const nameOf = (pkg: { directory: string; manifest: { name?: string } }): string =>
    pkg.manifest.name ?? pkg.directory;
  const packages: PackageFolder[] = workspace.map((pkg) => ({
    name: nameOf(pkg),
    directory: pkg.directory,
  }));
  const query = positionals[0];
  const matches = query === undefined ? [] : resolvePackage(query, packages);
  if (query !== undefined && matches.length !== 1) {
    console.error(
      matches.length === 0
        ? `No package matches "${query}". Use its name, its folder or its folder's last part.`
        : `"${query}" could be ${matches.map((pkg) => pkg.name).join(", ")}. Use the full name.`,
    );
    return 2;
  }
  const repo = values.repo ?? originRepo(root) ?? defaultRepo;
  let pullRequests: OpenPullRequest[];
  try {
    pullRequests = await fetchOpenPullRequests(repo, { token: process.env["GH_TOKEN"] });
  } catch (error) {
    console.error(`who-touches: couldn't read the open pull requests of ${repo}.`);
    console.error(`  ${(error as Error).message}`);
    console.error("  If GitHub's rate limit is the cause, set GH_TOKEN and try again.");
    return 1;
  }
  const touches = touchesByPackage(pullRequests, (file) => {
    const owner = owningPackage(file, workspace);
    return owner === undefined ? "(repo root)" : nameOf(owner);
  });
  const target = matches[0];
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

process.exitCode = await main(process.argv.slice(2));
