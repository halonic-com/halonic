import { describe, expect, it } from "vitest";
import { lockedPackageProblem, readLockedPackages } from "./lockfile.ts";

const integrity = "sha512-AAAA";

function lockfile(packages: string): string {
  return `lockfileVersion: '9.0'\n\nimporters:\n\n  .: {}\n\npackages:\n\n${packages}\nsnapshots:\n\n  a@1.0.0: {}\n`;
}

function problems(packages: string): (string | undefined)[] {
  return readLockedPackages(lockfile(packages)).map(lockedPackageProblem);
}

describe("lockfile check", () => {
  it("accepts registry packages with a sha512 hash", () => {
    expect(problems(`  a@1.0.0:\n    resolution: {integrity: ${integrity}}\n`)).toEqual([
      undefined,
    ]);
  });

  it("reads nested fields without mistaking them for packages", () => {
    const entries = readLockedPackages(
      lockfile(
        `  b@1.0.0:\n    resolution: {integrity: ${integrity}}\n    peerDependencies:\n      c: '*'\n`,
      ),
    );
    expect(entries.map((entry) => entry.key)).toEqual(["b@1.0.0"]);
  });

  it("rejects tarball URLs, git and a missing hash", () => {
    const found = problems(
      [
        `  t@1.0.0:\n    resolution: {integrity: ${integrity}, tarball: https://example.com/t.tgz}\n`,
        "  g@1.0.0:\n    resolution: {type: git, repo: https://example.com/g.git, commit: abc}\n",
        "  n@1.0.0:\n    resolution: {integrity: sha1-AAAA}\n",
      ].join("\n"),
    );
    expect(found.every((problem) => problem !== undefined)).toBe(true);
  });

  it("accepts the Node runtime only from the Node.js release hosts", () => {
    const runtime = (url: string): string =>
      [
        "  node@runtime:26.13.0:",
        "    resolution:",
        "      type: variations",
        "      variants:",
        "        - resolution:",
        "            integrity: sha256-AAAA",
        "            type: binary",
        `            url: ${url}`,
        "",
      ].join("\n");
    expect(problems(runtime("https://nodejs.org/download/release/v26.13.0/node.tar.gz"))).toEqual([
      undefined,
    ]);
    expect(problems(runtime("https://example.com/v26.13.0/node.tar.gz"))[0]).toMatch(
      /somewhere other than/,
    );
  });
});
