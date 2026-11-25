import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";

// Vitest runs each package's tests from the package folder.
const workflow = () =>
  readFileSync(resolve(process.cwd(), "../../.github/workflows/studio-preview.yml"), "utf8");

/** The lines of one top-level job, from its id to the next job. */
function jobOf(text: string, id: string): string {
  const start = text.indexOf(`\n  ${id}:\n`);
  if (start === -1) throw new Error(`No job ${id}`);
  const next = text.slice(start + 1).search(/\n {2}[\w-]+:\n/);
  return next === -1 ? text.slice(start) : text.slice(start, start + 1 + next);
}

/** The steps of a job, each from its `- ` line to the next. */
function stepsOf(job: string): string[] {
  return job.split(/\n {6}- /).slice(1);
}

verifies("studio.preview-installer-gate", () => {
  describe("the preview setup artifact", () => {
    it("is uploaded once, by the click-test job", () => {
      const text = workflow();
      expect(text.match(/name: halonic-studio-preview-windows\n/g)).toHaveLength(1);
      expect(jobOf(text, "click-test")).toContain("name: halonic-studio-preview-windows\n");
    });

    it("is uploaded right after the click test, only when every step before it passed", () => {
      const steps = stepsOf(jobOf(workflow(), "click-test"));
      const clickTest = steps.findIndex((step) =>
        step.startsWith("name: Click through the installed app\n"),
      );
      const upload = steps.findIndex((step) =>
        step.includes("name: halonic-studio-preview-windows\n"),
      );
      expect(clickTest).toBeGreaterThan(-1);
      expect(upload).toBe(clickTest + 1);
      // No if: means success(): a failed click test skips the upload, and nothing overrides that.
      expect(steps[upload]).not.toMatch(/\n\s+if:|continue-on-error/);
      expect(steps[clickTest]).not.toMatch(/continue-on-error/);
      expect(steps[clickTest]).toContain("if ($LASTEXITCODE -ne 0) { throw");
    });

    it("says so where the workflow is described", () => {
      expect(workflow()).toMatch(
        /No installer artifact unless the click\n# test passed on this build/,
      );
    });
  });
});
