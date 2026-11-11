/**
 * Runs on `pnpm install` (the root `prepare` script), after the git hooks:
 * writes the gitignored registration files under `src/generated/`, so a fresh
 * clone can run the CLI and the Studio straight after install, without a
 * manual `pnpm codegen` (HAL-4951). Turbo still runs codegen before every
 * typecheck, test and build, so a stale file is never trusted there.
 *
 * Never fails the install: a filtered install (`pnpm install --filter ...`)
 * may leave out the packages codegen needs. Then it says so and moves on.
 */
try {
  await import("./discover.ts");
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error);
  console.warn(`codegen: generated files NOT written (${reason}). Run "pnpm codegen".`);
  process.exitCode = 0;
}
