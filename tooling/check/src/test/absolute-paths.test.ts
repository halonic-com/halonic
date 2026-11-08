import { describe, expect, it } from "vitest";
import { rulesHit } from "./fixture-repo.ts";

// Built from parts so this test file reads like any other.
const windowsHome = ["C:", "Users", "someone", "notes.md"].join("\\");
const linuxHome = `/${"home"}/someone/repo/file.ts`;
const agentMachine = `/${"paperclip"}/instances/x`;
const otherDrive = ["D:", "work", "halonic"].join("\\");
const forwardDrive = ["E:", "src", "x.ts"].join("/");

describe("tooling/check: absolute local paths", () => {
  it("fails on a home folder in docs and code", () => {
    expect(rulesHit([], { extraFiles: { "docs/a.md": `See ${windowsHome}.\n` } })).toEqual([
      "absolute-paths",
    ]);
    expect(rulesHit([], { extraFiles: { "docs/b.md": `Path: ${linuxHome}\n` } })).toEqual([
      "absolute-paths",
    ]);
    expect(rulesHit([], { extraFiles: { "docs/c.md": `${agentMachine}\n` } })).toEqual([
      "absolute-paths",
    ]);
  });

  it("allows URLs, home-relative paths and test files", () => {
    const fine = "https://example.com/home/page and ~/.config/halonic/deny-terms\n";
    expect(rulesHit([], { extraFiles: { "docs/d.md": fine } })).toEqual([]);
    expect(rulesHit([], { extraFiles: { "tooling/e.test.ts": `"${linuxHome}";\n` } })).toEqual([]);
  });

  it("fails on a folder on any Windows drive, with either slash", () => {
    expect(rulesHit([], { extraFiles: { "docs/f.md": `Open ${otherDrive}\n` } })).toEqual([
      "absolute-paths",
    ]);
    expect(rulesHit([], { extraFiles: { "docs/g.md": `"${forwardDrive}"\n` } })).toEqual([
      "absolute-paths",
    ]);
  });

  it("checks Rust, scripts, text, SVG and files without an extension", () => {
    for (const file of [
      "apps/studio/src-tauri/src/main.rs",
      "scripts/a.sh",
      "scripts/b.ps1",
      "docs/notes.txt",
      "docs/logo.svg",
      "Dockerfile",
      ".github/CODEOWNERS",
      ".gitignore",
    ]) {
      expect(rulesHit([], { extraFiles: { [file]: `${linuxHome}\n` } }), file).toEqual([
        "absolute-paths",
      ]);
    }
  });

  it("skips binary files and leaves URLs and drive-like text alone", () => {
    expect(rulesHit([], { extraFiles: { "docs/image": `\0${linuxHome}\n` } })).toEqual([]);
    const fine = "file://server/share, http://x, ratio 16:9 and a:b\n";
    expect(rulesHit([], { extraFiles: { "docs/h.md": fine } })).toEqual([]);
  });
});
