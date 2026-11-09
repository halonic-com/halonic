import { spawnSync } from "node:child_process";
import { findRepoRoot } from "../lib/workspace.ts";

/**
 * pnpm verify
 *
 * The agent's local check before asking for review: our own
 * checks, formatting, the feature list, then typecheck, lint and test for
 * the packages the change affects. Outside CI the Turbo steps run at most
 * two tasks at once, so several runs don't overload the machine (set
 * `CI` to lift that). Pass --full to run every package and finish with the
 * trace check, which reads every package's test result files, as CI does.
 * Plain verify leaves trace out: in a fresh worktree it would run every
 * package's tests.
 */
interface Step {
  readonly label: string;
  readonly command: string;
  readonly args: readonly string[];
}

function main(argv: readonly string[]): number {
  const full = argv.includes("--full");
  const turboScope = full ? [] : ["--affected"];
  const turboLimit = process.env["CI"] ? [] : ["--concurrency=2"];
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
        ...turboLimit,
        "--output-logs=errors-only",
      ],
    },
  ];
  if (full) {
    steps.push({
      label: "requirements and their tests (trace)",
      command: "pnpm",
      args: ["run", "--silent", "check", "trace", "--report"],
    });
  }
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
