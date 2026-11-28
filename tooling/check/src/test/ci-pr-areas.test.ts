import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, test } from "vitest";

const workflow = readFileSync(
  new URL("../../../../.github/workflows/ci.yml", import.meta.url),
  "utf8",
);

/** The shell script of the `changes` job's "Find changed areas" step. */
function findAreasScript(text: string): string {
  const start = text.indexOf("        name: Find changed areas\n");
  const lines = text.slice(start).split("\n");
  const body = lines.slice(lines.indexOf("        run: |") + 1);
  const end = body.findIndex((line) => line !== "" && !line.startsWith("          "));
  return body
    .slice(0, end)
    .map((line) => line.slice(10))
    .join("\n");
}

/** A job's `if:` line in ci.yml. */
function jobCondition(job: string): string {
  const block = workflow.slice(workflow.indexOf(`\n  ${job}:\n`) + 1);
  return /^ {4}if: (.+)$/m.exec(block)?.[1] ?? "";
}

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

function git(root: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function commit(root: string, files: readonly string[], message: string): string {
  for (const file of files) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), `${message}\n`);
  }
  git(root, "add", "--all");
  git(root, "commit", "--quiet", "--message", message);
  return git(root, "rev-parse", "HEAD");
}

/**
 * Runs the step as a pull request run does: the checkout is GitHub's merge of
 * the pull request into the newest main, and BASE is main when the pull
 * request was last pushed. Returns the step's outputs.
 */
function areasOf(
  prFiles: readonly string[],
  mainFilesSince: readonly string[],
): Map<string, string> {
  const root = mkdtempSync(join(tmpdir(), "ci-pr-areas-"));
  folders.push(root);
  git(root, "init", "--quiet", "--initial-branch", "main");
  git(root, "config", "user.email", "test@example.invalid");
  git(root, "config", "user.name", "test");
  const base = commit(root, ["README.md"], "base");
  git(root, "switch", "--quiet", "--create", "pr");
  commit(root, prFiles, "pull request");
  git(root, "switch", "--quiet", "main");
  if (mainFilesSince.length > 0) commit(root, mainFilesSince, "merged since");
  git(root, "merge", "--quiet", "--no-ff", "--message", "merge", "pr");
  const output = join(root, "output.txt");
  execFileSync("bash", ["-e", "-o", "pipefail", "-c", findAreasScript(workflow)], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      EVENT: "pull_request",
      BASE: base,
      DRAFT: "false",
      GITHUB_OUTPUT: output,
    },
  });
  const outputs = readFileSync(output, "utf8").trim().split("\n");
  return new Map(
    outputs.map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
  );
}

verifies("check.ci-pr-areas", () => {
  describe("ci.yml picks a pull request's area jobs from its own changes", () => {
    test("what main merged after the pull request's base doesn't count as its change", () => {
      const areas = areasOf(
        ["packages/studio/features/files/vitest.config.ts"],
        ["apps/agent-host/src/routes.ts", "apps/studio/src-tauri/windows/installer.nsi"],
      );
      expect(areas.get("studio")).toBe("true");
      expect(areas.get("agent_host")).toBe("false");
      expect(areas.get("tauri")).toBe("false");
      expect(areas.get("installer")).toBe("false");
    });

    // One test per file: each builds its own git repo, and ten of them in one
    // test went past the 30 s limit on a busy CI shard (HAL-17655).
    test.each([
      "apps/studio/src-tauri/windows/installer.nsi",
      "apps/studio/src-tauri/src/updates_check.rs",
      "apps/studio/src-tauri/tauri.installer.conf.json",
      "apps/studio/src-tauri/crates/app-frame/src/frame.rs",
      "apps/agent-host/scripts/build.ts",
      "infra/wsl-image/runtime-archive.sh",
      ".github/workflows/ci.yml",
    ])(
      "the installer area includes the installer's build, the updater and the workflow: %s",
      (file) => {
        expect(areasOf([file], []).get("installer")).toBe("true");
      },
    );

    test.each([
      "apps/agent-host/src/routes.ts",
      "apps/studio/src-tauri/src/engine.rs",
      "apps/studio/src-tauri/crates/keychain/src/lib.rs",
      "pnpm-lock.yaml",
    ])("the installer area leaves out the rest of the shell and the lockfile: %s", (file) => {
      expect(areasOf([file], []).get("installer")).toBe("false");
    });

    test("the Windows installer, Windows update and WSL runtime jobs run on the installer area", () => {
      for (const job of ["wsl-runtime", "installer-windows", "update-windows"]) {
        expect(jobCondition(job), job).toMatch(/^needs\.changes\.outputs\.installer == 'true' && /);
      }
    });
  });
});
