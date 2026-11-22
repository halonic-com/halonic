import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

/** A file from the repo's `.github/` folder. */
function read(path: string): string {
  return readFileSync(new URL(`../../../../.github/${path}`, import.meta.url), "utf8");
}

describe("the gitleaks action", () => {
  const action = read("actions/gitleaks/action.yml");

  test("reads its rules and ignore list from its own folder, never from the scanned checkout", () => {
    expect(action).toContain('-v "$GITHUB_ACTION_PATH:/action:ro"');
    expect(action).toContain(
      "--config /action/gitleaks.toml --gitleaks-ignore-path /action --ignore-gitleaks-allow)",
    );
  });

  test("removes the checkout's own ignore list before the scan, since gitleaks reads it anyway", () => {
    const remove = action.indexOf('rm -f "$GITHUB_WORKSPACE/.gitleaksignore"');
    expect(remove).toBeGreaterThan(-1);
    expect(remove).toBeLessThan(action.indexOf("docker run"));
  });

  test("ignores inline gitleaks:allow comments in the lockfile scan too", () => {
    expect(action).toMatch(/stdin [^\n]*--ignore-gitleaks-allow/);
  });

  test("uses gitleaks' default rules, with no allow list of its own", () => {
    const config = read("actions/gitleaks/gitleaks.toml");
    expect(config).toMatch(/^\[extend\]\nuseDefault = true$/m);
    expect(config).not.toMatch(/allowlist|\[\[rules\]\]/i);
  });
});

describe("the Android screen capture", () => {
  test("takes the newest APK only from a run of this repository, not from a fork's branch named main", () => {
    const workflow = read("workflows/android-screens.yml");
    expect(workflow).toContain('select(.workflow_run.head_branch == "main")');
    expect(workflow).toContain(
      "select(.workflow_run.head_repository_id == .workflow_run.repository_id)",
    );
  });
});
