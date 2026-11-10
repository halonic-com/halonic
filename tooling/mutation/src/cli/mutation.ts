import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { findRepoRoot } from "@halonicjs/tooling-check";
import {
  belowFloor,
  type MutationReport,
  mutationFloors,
  type PackageResult,
  scoreOf,
  summaryTable,
} from "../score.ts";
import { hasCode, mutationTargets, sandboxEnv, strykerConfig } from "../targets.ts";

/**
 * node tooling/mutation/src/cli/mutation.ts [<package folder> ...]
 *
 * Runs Stryker on each mutation target that has code and prints the score
 * per package, also into the GitHub job summary. A package with a floor
 * (see `mutationFloors`) fails the run when it scores under it, and so does
 * a Stryker run that breaks, so a broken or slipping nightly run is noticed.
 */

const require = createRequire(import.meta.url);

function strykerBin(): string {
  return join(dirname(require.resolve("@stryker-mutator/core/package.json")), "bin/stryker.js");
}

function mutate(root: string, target: string, workFolder: string): PackageResult {
  const name = target.split("/").at(-1) ?? target;
  const packageDirectory = join(root, target);
  if (!hasCode(packageDirectory)) {
    return { name, kind: "no-code" };
  }
  const floor = mutationFloors[target];
  const report = join(workFolder, `${name}.json`);
  const config = join(workFolder, `${name}.stryker.json`);
  const paths = {
    vitestRunner: require.resolve("@stryker-mutator/vitest-runner"),
    report,
    sandbox: join(workFolder, `${name}-sandbox`),
  };
  writeFileSync(config, JSON.stringify(strykerConfig(paths), null, 2));
  console.log(`mutation: running Stryker on ${target}.`);
  const run = spawnSync(process.execPath, [strykerBin(), "run", config], {
    cwd: packageDirectory,
    env: { ...process.env, ...sandboxEnv(root) },
    stdio: "inherit",
  });
  if (run.status !== 0 || !existsSync(report)) {
    return { name, kind: "failed", reason: `Stryker exited with ${run.status ?? run.signal}` };
  }
  return {
    name,
    kind: "scored",
    score: scoreOf(JSON.parse(readFileSync(report, "utf8")) as MutationReport),
    ...(floor === undefined ? {} : { floor }),
  };
}

function main(argv: readonly string[]): number {
  const root = findRepoRoot();
  const selected = argv.filter((argument) => !argument.startsWith("-"));
  const unknown = selected.filter((target) => !mutationTargets.includes(target));
  if (unknown.length > 0) {
    console.error(
      `Not a mutation target: ${unknown.join(", ")}. Targets: ${mutationTargets.join(", ")}.`,
    );
    return 2;
  }
  const workFolder = mkdtempSync(join(tmpdir(), "halonic-mutation-"));
  try {
    const targets = selected.length > 0 ? selected : mutationTargets;
    const results = targets.map((target) => mutate(root, target, workFolder));
    const summary = summaryTable(results);
    console.log(summary);
    const stepSummary = process.env["GITHUB_STEP_SUMMARY"];
    if (stepSummary !== undefined && stepSummary !== "") {
      appendFileSync(stepSummary, summary);
    }
    return results.some(
      (result) =>
        result.kind === "failed" ||
        (result.kind === "scored" && belowFloor(result.score, result.floor)),
    )
      ? 1
      : 0;
  } finally {
    rmSync(workFolder, { recursive: true, force: true });
  }
}

process.exitCode = main(process.argv.slice(2));
