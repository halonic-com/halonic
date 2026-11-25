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

verifies("studio.preview-auto-build", () => {
  describe("the preview workflow", () => {
    it("starts on a merge to main that changes the Studio, a package or the lockfile", () => {
      const text = workflow();
      expect(text).toMatch(/\n {2}push:\n {4}branches: \[main\]\n {4}paths:\n/);
      for (const path of ["apps/studio/**", "packages/**", "pnpm-lock.yaml"]) {
        expect(text).toContain(`      - ${path}\n`);
      }
      expect(text).toContain("\n  workflow_dispatch:\n");
    });

    it("never cancels a running build or publish", () => {
      const text = workflow();
      expect(text).not.toContain("cancel-in-progress: true");
      expect(jobOf(text, "publish")).toContain("group: studio-preview-publish");
    });

    it("saves the Rust cache only on main", () => {
      const installer = jobOf(workflow(), "installer");
      const saves = installer.match(/uses: actions\/cache\/save@/g) ?? [];
      expect(saves).toHaveLength(1);
      expect(installer).toContain(
        "if: ${{ !cancelled() && github.ref == 'refs/heads/main' && steps.rust-cache.outputs.cache-hit != 'true' }}",
      );
      expect(installer).not.toMatch(/uses: actions\/cache@/);
    });

    it("restores no cache in the publish job", () => {
      const publish = jobOf(workflow(), "publish");
      expect(publish).not.toMatch(/actions\/cache|rust-cache|Swatinem/);
      expect(publish).toContain("cache: false");
    });
  });
});
