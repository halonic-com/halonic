import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, describe, expect, test } from "vitest";
import { refusedReleaseReason } from "../lib/release-version.ts";

const sources = fileURLToPath(new URL("..", import.meta.url));
const copies: string[] = [];

afterAll(() => {
  for (const copy of copies) {
    rmSync(copy, { recursive: true, force: true });
  }
});

/**
 * Runs the release workflow's first step the way release.yml does: from a
 * repo root with no `node_modules`, the app at `appVersion`.
 */
function releaseStep(tag: string, ref: string, appVersion: string) {
  const folder = mkdtempSync(join(tmpdir(), "release-version-"));
  copies.push(folder);
  cpSync(sources, join(folder, "tooling", "check", "src"), { recursive: true });
  writeFileSync(join(folder, "tooling", "check", "package.json"), '{ "type": "module" }\n');
  mkdirSync(join(folder, "apps", "studio"), { recursive: true });
  writeFileSync(
    join(folder, "apps", "studio", "package.json"),
    JSON.stringify({ version: appVersion }),
  );
  return spawnSync(process.execPath, ["tooling/check/src/cli/release-version.ts"], {
    cwd: folder,
    encoding: "utf8",
    env: { ...process.env, TAG: tag, REF_NAME: ref },
  });
}

verifies("check.release-refuses-1-0-0", () => {
  describe("the release workflow's first step", () => {
    test("refuses the tag v1.0.0 with a clear error", () => {
      const result = releaseStep("v1.0.0", "v1.0.0", "1.0.0");
      expect(result.status).toBe(1);
      expect(result.stdout).toContain("::error::The tag 'v1.0.0' names Halonic 1.0.0.");
      expect(result.stdout).toContain("Release 1.0.1 or 1.1.0 instead");
    });

    test("passes the tag v0.1.1 from main", () => {
      const result = releaseStep("v0.1.1", "main", "0.1.1");
      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
    });
  });

  test("refuses a release branch named for 1.0.0", () => {
    expect(
      refusedReleaseReason({ tag: "v0.1.2", ref: "release/halonic-1.0.0", appVersion: "0.1.2" }),
    ).toContain("The branch or tag 'release/halonic-1.0.0'");
  });

  test("refuses an app at 1.0.0 or a 1.0.0 pre-release, whatever the tag says", () => {
    expect(refusedReleaseReason({ tag: "v0.1.2", ref: "main", appVersion: "1.0.0" })).toContain(
      "apps/studio/package.json (version 1.0.0)",
    );
    expect(refusedReleaseReason({ tag: "v1.0.0-rc.1", ref: "main" })).toContain("v1.0.0-rc.1");
  });

  test("lets 0.1.x, 1.0.1, 1.1.0 and 11.0.0 through", () => {
    for (const tag of ["v0.1.0", "v0.1.1-test", "v1.0.1", "v1.1.0", "v11.0.0"]) {
      expect(refusedReleaseReason({ tag, ref: "main", appVersion: tag.slice(1) })).toBeUndefined();
    }
  });
});
