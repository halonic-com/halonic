import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";

// Vitest runs each package's tests from the package folder.
const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const workflow = () => read("../../.github/workflows/studio-preview.yml");

/** The lines of one top-level job, from its id to the next job. */
function jobOf(text: string, id: string): string {
  const start = text.indexOf(`\n  ${id}:\n`);
  if (start === -1) throw new Error(`No job ${id}`);
  const next = text.slice(start + 1).search(/\n {2}[\w-]+:\n/);
  return next === -1 ? text.slice(start) : text.slice(start, start + 1 + next);
}

/** The key id a minisign public key (base64 of the .pub file) carries, as hex. */
function keyIdOf(pubkey: string): string {
  const lines = Buffer.from(pubkey, "base64").toString("utf8").split("\n");
  const key = Buffer.from(lines[1] ?? "", "base64");
  return [...key.subarray(2, 10)]
    .reverse()
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

verifies("studio.preview-publish", () => {
  describe("the preview workflow's publish job", () => {
    it("runs only on main, after the installer built, updated and started", () => {
      const job = jobOf(workflow(), "publish");
      expect(job).toContain("needs: installer");
      expect(job).toContain("if: github.ref == 'refs/heads/main'");
      expect(job).not.toMatch(/always\(\)|failure\(\)|continue-on-error/);
      expect(job).toContain("environment: preview-publish");
    });

    it("publishes a signed pre-release to halonic-preview, labelled as a preview", () => {
      const job = jobOf(workflow(), "publish");
      expect(job).toContain("PREVIEW_REPO: halonic-com/halonic-preview");
      expect(job).toContain("key: preview");
      expect(job).toContain("repo: halonic-com/halonic-preview");
      expect(job).toContain('gh release create "v$VERSION" --repo "$PREVIEW_REPO"');
      expect(job).toContain("--prerelease --latest=false");
      expect(job).toContain('--title "Halonic $VERSION (Preview, not for general use)"');
      expect(job).toContain(
        '"dist/$INSTALLER" "dist/$INSTALLER.sig" dist/latest.json dist/SHA256SUMS',
      );
    });

    it("is the only job that holds a secret", () => {
      const text = workflow();
      const publish = jobOf(text, "publish");
      const rest = text.replace(publish, "");
      expect(rest).not.toMatch(/secrets\./);
    });
  });

  it("checks the Preview signature against a key that isn't the release key", () => {
    const keys = JSON.parse(read("src-tauri/updater-keys.json")) as {
      preview: { keyId: string; pubkey: string };
    };
    const config = JSON.parse(read("src-tauri/tauri.conf.json")) as {
      plugins: { updater: { pubkey: string } };
    };
    expect(keyIdOf(keys.preview.pubkey)).toBe(keys.preview.keyId);
    expect(keyIdOf(config.plugins.updater.pubkey)).not.toBe(keys.preview.keyId);
    expect(read("../../.github/actions/updater-manifest/action.yml")).toContain(
      "apps/studio/src-tauri/updater-keys.json",
    );
  });
});
