import { readdirSync, readFileSync } from "node:fs";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";

const folder = new URL("../../../../.github/workflows/", import.meta.url);
const read = (name: string) => readFileSync(new URL(name, folder), "utf8");
const ci = read("ci.yml");
const label = read("fast-track-label.yml");

/** A workflow's triggers: the lines from `on:` to `jobs:`. */
function triggers(text: string): string {
  return text.slice(text.indexOf("\non:\n"), text.indexOf("\njobs:\n"));
}

/** The one shell script of fast-track-label.yml's job. */
const script = label.slice(label.indexOf("        run: |\n"));

verifies("check.ci-label-keeps-ci-ok", () => {
  describe("a label never hides ci-ok (HAL-17992)", () => {
    test("ci.yml starts on no label or text change", () => {
      expect(triggers(ci)).toContain(
        "  pull_request:\n    types: [opened, synchronize, reopened, ready_for_review]\n",
      );
      expect(ci).not.toMatch(/github\.event\.action == 'labeled'|github\.event\.label\./);
      expect(ci).not.toMatch(/^run-name:/m);
      expect(ci).toContain(
        "    name: ${{ github.event.pull_request.draft && 'ci-ok (draft, light run)' || 'ci-ok' }}\n",
      );
    });

    test("no other workflow has a job named ci-ok", () => {
      for (const name of readdirSync(folder).filter((file) => file.endsWith(".yml"))) {
        if (name === "ci.yml") continue;
        expect(read(name), name).not.toMatch(/^ {4}name: .*ci-ok/m);
      }
    });

    test("fast-track-label.yml runs on a label alone, and only for fast-track on a person's pull request from our own branch", () => {
      expect(triggers(label)).toBe(
        "\non:\n  pull_request:\n    types: [labeled]\n\npermissions: {}\n\nconcurrency:\n  group: fast-track-label-${{ github.event.pull_request.number }}\n  cancel-in-progress: true\n",
      );
      const condition = /^ {4}if: \$\{\{ (.+) \}\}$/m.exec(label)?.[1] ?? "";
      expect(condition.split(" && ")).toEqual([
        "github.event.label.name == 'fast-track'",
        "github.event.pull_request.head.repo.full_name == github.repository",
        "github.event.pull_request.user.type == 'User'",
        "!endsWith(github.event.pull_request.user.login, '[bot]')",
        "github.event.pull_request.user.login != 'dependabot'",
        "github.event.pull_request.user.login != 'renovate'",
        "github.event.pull_request.user.login != 'renovate-bot'",
      ]);
      // It runs nothing of the pull request, and may only cancel and re-run runs.
      expect(label).not.toContain("actions/checkout");
      expect(label).toContain(
        "    permissions:\n      actions: write # to cancel and re-run the pull request's CI run\n    env:",
      );
    });

    test("it cancels a going run, waits for it to stop, and re-runs every job unless the run passed", () => {
      expect(script).toContain(
        `gh api "repos/$GH_REPO/actions/workflows/ci.yml/runs?head_sha=$SHA&event=pull_request&per_page=20"`,
      );
      const passed = script.indexOf(
        'if [ "$status" = completed ] && [ "$conclusion" = success ]; then',
      );
      const cancel = script.indexOf('gh run cancel "$run"');
      const stopped = script.indexOf('[ "$status" = completed ] && break');
      const rerun = script.indexOf('gh api --method POST "repos/$GH_REPO/actions/runs/$run/rerun"');
      for (const step of [passed, cancel, stopped, rerun]) expect(step).toBeGreaterThan(0);
      expect(passed).toBeLessThan(cancel);
      expect(cancel).toBeLessThan(stopped);
      expect(stopped).toBeLessThan(rerun);
      // Not "rerun-failed-jobs": that keeps pick-runner's old answer.
      expect(script).not.toContain("rerun-failed-jobs");
    });
  });
});
