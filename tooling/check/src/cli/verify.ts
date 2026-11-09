import { spawnSync } from "node:child_process";
import { findRepoRoot } from "../lib/workspace.ts";

/**
 * pnpm verify
 *
 * The agent's local check before asking for review: our own
 * checks, formatting, the feature list, then typecheck, lint and test for
 * the packages the change affects, and last the trace check, which reads
 * the test result files. CI runs every task through the cache. Pass --full
 * to run every package, as CI does.
 */
interface Step {
  readonly label: string;
  readonly command: string;
  readonly args: readonly string[];
}

function main(argv: readonly string[]): number {
  const full = argv.includes("--full");
  const turboScope = full ? [] : ["--affected"];
  const steps: Step[] = [
    {
      label: "repo checks",
      command: "pnpm",
      // Plain check leaves out trace, which runs last, after the tests.
      args: ["run", "--silent", "check"],
    },
    { label: "leak guard", command: "pnpm", args: ["run", "--silent", "check:leaks"] },
    { label: "licences", command: "pnpm", args: ["run", "--silent", "check:licences"] },
    {
      label: "formatting",
      command: "pnpm",
      args: ["exec", "biome", "ci", "--linter-enabled=false", "."],
    },
    {
      label: "feature list and generated files",
      command: "pnpm",
      args: ["run", "--silent", "discover", "--check"],
    },
    {
      label: "typecheck, lint, test, build",
      command: "pnpm",
      args: [
        "exec",
        "turbo",
        "run",
        "typecheck",
        "lint",
        "test",
        "build",
        ...turboScope,
        "--output-logs=errors-only",
      ],
    },
  ];
  if (!full) {
    // The trace check needs every package's result file. Unaffected
    // packages come from Turbo's cache, so this is quick after the first run.
    steps.push({
      label: "test results of the other packages",
      command: "pnpm",
      args: ["exec", "turbo", "run", "test", "--output-logs=errors-only"],
    });
  }
  steps.push({
    label: "requirements and their tests (trace)",
    command: "pnpm",
    args: ["run", "--silent", "check", "trace", "--report"],
  });
  const root = findRepoRoot();
  const started = performance.now();
  for (const step of steps) {
    console.log(`\n▶ ${step.label}`);
    const result = spawnSync(step.command, step.args, { cwd: root, stdio: "inherit" });
    if (result.status !== 0) {
      console.error(`\n✗ verify failed at: ${step.label}. Fix it and run pnpm verify again.`);
      return result.status ?? 1;
    }
  }
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  console.log(`\n✓ verify passed in ${seconds}s.`);
  return 0;
}

process.exitCode = main(process.argv.slice(2));
