import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { rulesHit } from "./fixture-repo.ts";

// Built from parts so this test file reads like any other.
const windowsHome = ["C:", "Users", "someone", "notes.md"].join("\\");
const linuxHome = `/${"home"}/someone/repo/file.ts`;
const agentMachine = `/${"paperclip"}/instances/x`;

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
});

verifies("check.absolute-paths-inline-allow", () => {
  it("allows a line with the leak guard's inline marker, and only that line", () => {
    const marked = `${linuxHome} # leak-guard: allow absolute-path inside-the-image\n`;
    expect(rulesHit([], { extraFiles: { "infra/f.sh": marked } })).toEqual([]);
    expect(rulesHit([], { extraFiles: { "infra/g.sh": `${marked}${linuxHome}\n` } })).toEqual([
      "absolute-paths",
    ]);
  });
});
