import { gitHubReader } from "../pr-watcher/github.ts";
import { reviewerAnswer } from "../pr-watcher/route.ts";

/**
 * GH_TOKEN=… pnpm exec node tooling/paperclip/src/cli/reviewer.ts halonic-com/halonic 6511
 *
 * Prints who reviews one pull request as JSON (`ReviewerAnswer`), decided by
 * the same code as `pr_status` and the PR watcher (HAL-19639). The server's
 * watcher runs this instead of keeping its own reviewer list. Reads GitHub
 * with GET requests only; the token comes from `GH_TOKEN` (never an
 * argument), and without one it reads as an anonymous caller.
 */

const usage = "usage: reviewer.ts <owner/name> <pull request number>";

function parseArgs(args: readonly string[]): { repo: string; number: number } | string {
  const [repo, number] = args;
  if (repo === undefined || number === undefined || args.length !== 2) {
    return usage;
  }
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    return `"${repo}" isn't owner/name.`;
  }
  if (!/^[1-9]\d*$/.test(number)) {
    return `"${number}" isn't a pull request number.`;
  }
  return { repo, number: Number(number) };
}

const parsed = parseArgs(process.argv.slice(2));
if (typeof parsed === "string") {
  console.error(`reviewer: ${parsed}`);
  process.exitCode = 2;
} else {
  const get = gitHubReader({ fetch, token: process.env["GH_TOKEN"] });
  try {
    const answer = await reviewerAnswer(get, parsed.repo, parsed.number);
    console.log(JSON.stringify(answer));
  } catch (error) {
    console.error(`reviewer: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
