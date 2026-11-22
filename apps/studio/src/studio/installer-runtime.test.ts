import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";

// Vitest runs each package's tests from the package folder.
const shellFolder = join(process.cwd(), "src-tauri");

/** The files a Tauri config copies next to the app: source path to installed name. */
function resources(file: string): Record<string, string> {
  const config = JSON.parse(readFileSync(join(shellFolder, file), "utf8")) as {
    bundle?: { resources?: Record<string, string> };
  };
  return config.bundle?.resources ?? {};
}

/** A `pub const NAME: &str = "…";` from the shell's bundled runtime module. */
function shellName(name: string): string {
  const source = readFileSync(
    join(shellFolder, "crates/agent-host/src/bundled_runtime.rs"),
    "utf8",
  );
  const match = new RegExp(`pub const ${name}: &str = "([^"]+)";`).exec(source);
  if (match?.[1] === undefined) throw new Error(`bundled_runtime.rs has no ${name}`);
  return match[1];
}

verifies("studio.installer-wsl-runtime", () => {
  const script = () => readFileSync(join(shellFolder, "windows/build-installer.ps1"), "utf8");

  it("installs the archive and the manifest under the names the shell reads", () => {
    expect(resources("tauri.runtime.conf.json")).toEqual({
      "binaries/halonic-runtime.tar.gz": shellName("RUNTIME_ARCHIVE"),
      "binaries/halonic-runtime.json": shellName("RUNTIME_MANIFEST"),
    });
  });

  it("ships no runtime from the installer config alone", () => {
    const names = Object.values(resources("tauri.installer.conf.json"));
    expect(names).not.toContain(shellName("RUNTIME_ARCHIVE"));
    expect(names).not.toContain(shellName("RUNTIME_MANIFEST"));
  });

  it("checks the pinned SHA-256, then copies both files and adds the runtime config, only with -Runtime", () => {
    const text = script();
    expect(text).toContain("[string]$Runtime");
    const block = text.slice(text.indexOf("if ($Runtime) {"), text.indexOf("if ($Config) {"));
    const check = block.indexOf("if ($pinned -ne $actual) { throw");
    expect(check).toBeGreaterThan(-1);
    expect(block).toContain("Get-FileHash $runtimeArchive -Algorithm SHA256");
    expect(block.indexOf("Copy-Item $runtimeArchive, $runtimeManifest $bin")).toBeGreaterThan(
      check,
    );
    expect(block.indexOf("'--config', 'tauri.runtime.conf.json'")).toBeGreaterThan(check);
    expect(text.split("tauri.runtime.conf.json'").length).toBe(2);
  });

  it("keeps the copies out of git", () => {
    const ignored = readFileSync(resolve(process.cwd(), "../../.gitignore"), "utf8").split("\n");
    expect(ignored).toContain("apps/studio/src-tauri/binaries/");
  });
});
