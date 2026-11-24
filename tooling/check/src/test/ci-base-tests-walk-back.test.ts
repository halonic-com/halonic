import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, test } from "vitest";

const ci = readFileSync(new URL("../../../../.github/workflows/ci.yml", import.meta.url), "utf8");
const stepName = "Walk back first if the merge base's push CI run failed";

/** The shell script of the first step with this name, from its `run: |` block. */
function stepScript(text: string, name: string): string {
  const start = text.indexOf(`name: ${name}\n`);
  const lines = text.slice(start).split("\n");
  const body = lines.slice(lines.indexOf("        run: |") + 1);
  const end = body.findIndex((line) => line !== "" && !line.startsWith("          "));
  return body
    .slice(0, end)
    .map((line) => line.slice(10))
    .join("\n");
}

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

/** Writes an executable stand-in for `name` into `folder`. */
function stub(folder: string, name: string, lines: readonly string[]): void {
  writeFileSync(join(folder, name), ["#!/usr/bin/env bash", ...lines, ""].join("\n"));
  chmodSync(join(folder, name), 0o755);
}

interface StepRun {
  readonly status: number | null;
  readonly output: string;
  /** The commit the step switched to, or "" when it stayed on the merge base. */
  readonly checkedOut: string;
}

/**
 * Runs the step on merge base `m0`, whose first parents are `m1` … `m20`,
 * with a stand-in `gh` whose merge-base push run ended as `conclusion` and
 * where only the commits in `green` have a passing push run.
 */
function walkBackFirst(conclusion: string, green: readonly string[]): StepRun {
  const folder = mkdtempSync(join(tmpdir(), "ci-base-tests-"));
  folders.push(folder);
  const checkout = join(folder, "checkout.txt");
  writeFileSync(checkout, "");
  const parents = Array.from({ length: 20 }, (_, at) => `m${at + 1}`).join(" ");
  stub(folder, "git", [
    `if [ "$1" = rev-list ] && [ "$5" = "m0^" ]; then printf '%s\\n' ${parents}; exit 0; fi`,
    `if [ "$1" = checkout ]; then echo "$4" > "${checkout}"; exit 0; fi`,
    "exit 2",
  ]);
  stub(folder, "gh", [
    'case "$2" in',
    `  *"head_sha=m0") echo "${conclusion}" ;;`,
    ...green.map((sha) => `  *"head_sha=${sha}&status=success") echo 1 ;;`),
    '  *"&status=success") echo 0 ;;',
    "  *) exit 3 ;;",
    "esac",
  ]);
  const result = spawnSync("bash", ["-e", "-c", stepScript(ci, stepName)], {
    encoding: "utf8",
    env: {
      PATH: `${folder}:${process.env["PATH"] ?? ""}`,
      MERGE_BASE: "m0",
      REPO: "acme/halonic",
    },
  });
  return {
    status: result.status,
    output: `${result.stdout}${result.stderr}`,
    checkedOut: readFileSync(checkout, "utf8").trim(),
  };
}

verifies("check.base-tests-walk-back-first", () => {
  describe("the merge base's tests walk back before testing a red main", () => {
    test("a failed push run on the merge base switches to the newest green commit first", () => {
      const run = walkBackFirst("failure", ["m2", "m5"]);
      expect(run.status, run.output).toBe(0);
      expect(run.checkedOut).toBe("m2");
      expect(run.output).toContain("baseline-walked-back");
      expect(run.output).toContain("Using m2, 2 commit(s) back on main");
    });

    test("a merge base that isn't known to be red is tested as it is", () => {
      for (const conclusion of ["success", "none", "cancelled"]) {
        const run = walkBackFirst(conclusion, ["m1"]);
        expect(run.status, run.output).toBe(0);
        expect(run.checkedOut, conclusion).toBe("");
      }
    });

    test("with no green commit within 20 it fails at once", () => {
      const run = walkBackFirst("failure", []);
      expect(run.status).toBe(1);
      expect(run.output).toContain("docs/guides/broken-main.md");
      expect(run.checkedOut).toBe("");
    });

    test("it runs before pnpm and the install, and the tested commit then gets every package", () => {
      const job = ci.slice(ci.indexOf("  base-tests:\n"), ci.indexOf("  guard:\n"));
      const walk = job.indexOf(`name: ${stepName}`);
      expect(walk).toBeGreaterThan(job.indexOf("name: Switch to the merge base"));
      expect(walk).toBeLessThan(job.indexOf("uses: pnpm/action-setup"));
      expect(walk).toBeLessThan(job.indexOf("name: Install the merge base's dependencies"));
      expect(job).toMatch(/if \[ "\$INSTALLED" != "\$MERGE_BASE" \]; then\n.*\n\s+echo "all=true"/);
    });
  });
});
