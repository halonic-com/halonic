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
 *
 * `--only <folder>` (repeatable, with --full) narrows the Turbo run to those
 * package folders and everything that depends on them, plus `--also <name>`
 * packages (repeatable) and their dependents, and scopes the trace check to the
 * folders. CI uses it to check the packages `pnpm new` generates; the `turbo`
 * job runs every other package.
 */
interface Step {
  readonly label: string;
  readonly command: string;
  readonly args: readonly string[];
}

/** The values of every `flag value` pair in the arguments. */
function valuesOf(argv: readonly string[], flag: string): string[] {
  return argv.flatMap((argument, index) => {
    const value = argv[index + 1];
    return argument === flag && value !== undefined ? [value] : [];
  });
}

/** The Turbo arguments that choose which packages run. */
function scopeFilters(full: boolean, only: readonly string[], also: readonly string[]): string[] {
  if (only.length > 0) {
    return [
      ...only.map((folder) => `--filter=...{./${folder}}`),
      ...also.map((name) => `--filter=...${name}`),
    ];
  }
  return full ? [] : ["--affected"];
}

function main(argv: readonly string[]): number {
  const full = argv.includes("--full");
  const only = valuesOf(argv, "--only");
  const also = valuesOf(argv, "--also");
  if (only.length > 0 && !full) {
    console.error("verify: --only goes with --full.");
    return 2;
  }
  const turboScope = scopeFilters(full, only, also);
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
      args: [
        "run",
        "--silent",
        "check",
        "trace",
        "--report",
        ...only.flatMap((folder) => ["--package", folder]),
      ],
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
