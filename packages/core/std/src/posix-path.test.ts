import { posix } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { posixPath } from "./posix-path.ts";
import { SeededRandom } from "./test/seeded-random.ts";

/** Paths built from the pieces that make normalizing hard. */
function generatedPaths(seed: number, count: number): string[] {
  const pieces = ["a", "bc", ".", "..", "", "x.yaml", "..."];
  const random = new SeededRandom(seed);
  const paths: string[] = [];
  for (let round = 0; round < count; round++) {
    const segments: string[] = [];
    const length = random.below(6);
    for (let index = 0; index < length; index++) {
      segments.push(pieces[random.below(pieces.length)] ?? "a");
    }
    const leading = random.below(3) === 0 ? "/" : "";
    const trailing = random.below(3) === 0 ? "/" : "";
    paths.push(`${leading}${segments.join("/")}${trailing}`);
  }
  return paths;
}

verifies("std.posix-path-normalize", () => {
  it.each([
    ["hubs//support/./agents/../skills/", "hubs/support/skills/"],
    ["", "."],
    ["a/..", "."],
    ["a/../", "./"],
    ["../a", "../a"],
    ["/../a", "/a"],
    ["/", "/"],
    ["//a//b", "/a/b"],
  ])("normalizes %j to %j", (path, expected) => {
    expect(posixPath.normalize(path)).toBe(expected);
  });

  it("matches node:path.posix.normalize on generated paths", () => {
    for (const path of generatedPaths(23, 3000)) {
      expect(posixPath.normalize(path), JSON.stringify(path)).toBe(posix.normalize(path));
    }
  });
});

verifies("std.posix-path-join", () => {
  it("joins segments and cleans the result", () => {
    expect(posixPath.join("hubs", "support/", "agents", "triage.agent.yaml")).toBe(
      "hubs/support/agents/triage.agent.yaml",
    );
    expect(posixPath.join("a", "", "b")).toBe("a/b");
    expect(posixPath.join("a", "../..", "b")).toBe("../b");
  });

  it("gives '.' with nothing to join", () => {
    expect(posixPath.join()).toBe(".");
    expect(posixPath.join("", "")).toBe(".");
  });

  it("matches node:path.posix.join on generated segments", () => {
    const paths = generatedPaths(29, 3000);
    for (let index = 0; index + 2 < paths.length; index += 3) {
      const segments = paths.slice(index, index + 3);
      expect(posixPath.join(...segments), JSON.stringify(segments)).toBe(posix.join(...segments));
    }
  });
});

verifies("std.posix-path-parts", () => {
  it.each([
    ["hubs/support/agents/triage.agent.yaml", "hubs/support/agents", "triage.agent.yaml"],
    ["triage.agent.yaml", ".", "triage.agent.yaml"],
    ["hubs/support/", "hubs", "support"],
    ["/hub.yaml", "/", "hub.yaml"],
    ["/", "/", ""],
    ["", ".", ""],
  ])("splits %j into folder %j and name %j", (path, folder, name) => {
    expect(posixPath.dirname(path)).toBe(folder);
    expect(posixPath.basename(path)).toBe(name);
  });

  it("matches node:path.posix on clean generated paths", () => {
    for (const raw of generatedPaths(31, 3000)) {
      const path = posix.normalize(raw);
      expect(posixPath.dirname(path), JSON.stringify(path)).toBe(posix.dirname(path));
      expect(posixPath.basename(path), JSON.stringify(path)).toBe(posix.basename(path));
    }
  });

  it("matches node:path.posix.basename on any generated path", () => {
    for (const path of generatedPaths(37, 3000)) {
      expect(posixPath.basename(path), JSON.stringify(path)).toBe(posix.basename(path));
    }
  });
});

verifies("std.posix-path-relative", () => {
  it.each([
    ["/workspace/hubs", "/workspace/hubs/support/agents"],
    ["/workspace/hubs", "/workspace/skills"],
    ["/a/b", "/a/bc"],
    ["/a/bc", "/a/b"],
    ["/a/b", "/a/b"],
    ["/a/b/", "/a/b"],
    ["//a//b", "/a/b/c/"],
    ["/a/./b/../c", "/a/c/d"],
    ["/", "/"],
    ["/", "/a/b"],
    ["/a/b", "/"],
    ["/..", "/a"],
  ])("gives the way from %j to %j as node:path.posix does", (from, to) => {
    expect(posixPath.relative(from, to)).toBe(posix.relative(from, to));
  });

  it("never puts a path that only shares a prefix inside the other", () => {
    expect(posixPath.relative("/a/b", "/a/bc")).toBe("../bc");
  });

  it.each([
    ["hubs", "/workspace"],
    ["/workspace", "hubs"],
    ["", "/workspace"],
    ["./a", "/a"],
  ])("refuses a relative path rather than resolve it against a cwd (%j, %j)", (from, to) => {
    expect(() => posixPath.relative(from, to)).toThrow(/only absolute paths/);
  });

  it("matches node:path.posix.relative on generated absolute paths", () => {
    const paths = generatedPaths(41, 3000).map((path) => `/${path}`);
    for (let index = 0; index + 1 < paths.length; index += 2) {
      const [from = "/", to = "/"] = paths.slice(index, index + 2);
      expect(posixPath.relative(from, to), JSON.stringify([from, to])).toBe(
        posix.relative(from, to),
      );
    }
  });

  it.each(["/", "/a", "//a", "a", "", ".", "./a", "../a", "a/b/"])(
    "tells whether %j is absolute as node:path.posix does",
    (path) => {
      expect(posixPath.isAbsolute(path)).toBe(posix.isAbsolute(path));
    },
  );

  it("uses / as its separator", () => {
    expect(posixPath.sep).toBe(posix.sep);
  });
});
