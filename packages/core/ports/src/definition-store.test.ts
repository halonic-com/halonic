import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import golden from "./golden/workspace-paths.json" with { type: "json" };
import {
  checkPublicWorkspacePath,
  checkWorkspacePath,
  isPrivateWorkspacePath,
  segmentAsOpened,
} from "./index.ts";

// The contract suite runs these rules through every adapter; this checks the shared helpers on their own.
verifies("ports.workspace-path-checks", () => {
  it("refuses an unsafe path with a RangeError", () => {
    for (const path of [
      "hubs/../x.yaml",
      "/etc/passwd",
      "a\\b.yaml",
      "a\u0000b",
      "",
      "a//b",
      "./a",
    ]) {
      expect(() => checkWorkspacePath(path), path).toThrow(RangeError);
      expect(() => checkPublicWorkspacePath(path), path).toThrow(RangeError);
    }
  });

  it("refuses a private path only when asked for a public one", () => {
    for (const path of [".env.local", "hubs/.GIT/config", ".ſtudio/trust.json"]) {
      expect(() => checkWorkspacePath(path), path).not.toThrow();
      expect(() => checkPublicWorkspacePath(path), path).toThrow(RangeError);
    }
  });

  it("says whether a safe path has a private segment", () => {
    expect(isPrivateWorkspacePath("hubs/a/hub.yaml")).toBe(false);
    expect(isPrivateWorkspacePath(".environment/a.yaml")).toBe(false);
    expect(isPrivateWorkspacePath("GIT~1/config")).toBe(true);
    expect(isPrivateWorkspacePath(".env::$DATA")).toBe(true);
    expect(isPrivateWorkspacePath("hubs/.git. /config")).toBe(true);
  });

  // The desktop shell's Rust checks the same cases (crates/workspace-files), so both refuse the same paths.
  it("gives every golden path its verdict", () => {
    expect(golden.paths.length).toBeGreaterThanOrEqual(30);
    for (const { path, verdict } of golden.paths) {
      expect(["public", "private", "unsafe"], path).toContain(verdict);
      if (verdict === "unsafe") {
        expect(() => checkWorkspacePath(path), path).toThrow(RangeError);
      } else {
        expect(() => checkWorkspacePath(path), path).not.toThrow();
      }
      if (verdict === "public") {
        expect(() => checkPublicWorkspacePath(path), path).not.toThrow();
      } else {
        expect(() => checkPublicWorkspacePath(path), path).toThrow(RangeError);
      }
    }
  });
});

verifies("ports.segment-as-opened", () => {
  it("gives a segment the way the private rule compares it", () => {
    expect(segmentAsOpened(".Halonic")).toBe(".halonic");
    expect(segmentAsOpened(".halonic. .")).toBe(".halonic");
    expect(segmentAsOpened(".hal\u200Conic")).toBe(".halonic");
    expect(segmentAsOpened(".\u017Ftudio")).toBe(".studio");
    expect(segmentAsOpened("review")).toBe("review");
  });

  it("gives every golden segment as opened", () => {
    for (const { segment, opened } of golden.segments) {
      expect(segmentAsOpened(segment), segment).toBe(opened);
    }
  });
});
