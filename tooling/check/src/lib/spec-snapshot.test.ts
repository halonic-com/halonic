import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import type { ReadFile } from "./app-version-sync.ts";
import { compareVersions } from "./semver.ts";
import {
  isCurrentSpecFile,
  releasedSpecPath,
  releasedVersions,
  snapshotChangedSpecs,
} from "./spec-snapshot.ts";

const agentSpec = "packages/core/acme/spec/agent.schema.json";
const released = (version: string): string =>
  `packages/core/acme/spec/released/${version}/agent.schema.json`;

/** An in-memory repo: the file list and a reader over the same texts. */
function repo(texts: Record<string, string>): { files: string[]; read: ReadFile } {
  return { files: Object.keys(texts).sort(), read: (file) => texts[file] };
}

/** Snapshots the repo's specs, all released under `version`. */
function snapshot(texts: Record<string, string>, version: string): Map<string, string> {
  const { files, read } = repo(texts);
  return snapshotChangedSpecs(files, read, () => version);
}

verifies("check.spec-snapshot", () => {
  test("copies a spec that has no released copy yet", () => {
    const snapshots = snapshot({ [agentSpec]: '{"a":1}\n' }, "0.1.0");
    expect([...snapshots]).toEqual([[released("0.1.0"), '{"a":1}\n']]);
  });

  test("writes nothing for a spec equal to its newest released copy", () => {
    const texts = { [agentSpec]: '{"a":1}\n', [released("0.1.0")]: '{"a":1}\n' };
    expect(snapshot(texts, "0.2.0").size).toBe(0);
  });

  test("copies a spec that differs from its newest released copy", () => {
    const texts = { [agentSpec]: '{"a":2}\n', [released("0.1.0")]: '{"a":1}\n' };
    expect([...snapshot(texts, "0.2.0")]).toEqual([[released("0.2.0"), '{"a":2}\n']]);
  });

  test("compares with the newest copy, not an older one with the same text", () => {
    const texts = {
      [agentSpec]: '{"a":1}\n',
      [released("0.1.0")]: '{"a":1}\n',
      [released("0.10.0")]: '{"a":2}\n',
      [released("0.9.0")]: '{"a":1}\n',
    };
    expect([...snapshot(texts, "0.11.0").keys()]).toEqual([released("0.11.0")]);
  });

  test("orders versions by semver, a pre-release before its release", () => {
    const files = [
      released("0.2.0"),
      released("0.10.0"),
      released("0.2.0-rc.1"),
      released("0.9.0"),
    ];
    expect(releasedVersions(agentSpec, files)).toEqual(["0.10.0", "0.9.0", "0.2.0", "0.2.0-rc.1"]);
    expect(compareVersions("0.2.0-rc.1", "0.2.0-rc.2")).toBeLessThan(0);
    expect(compareVersions("1.0.0+build.5", "1.0.0")).toBe(0);
    expect(() => compareVersions("v1.0.0", "1.0.0")).toThrow(/not a version/);
  });

  test("fails and writes nothing when a released spec would change", () => {
    const texts = { [agentSpec]: '{"a":2}\n', [released("0.2.0")]: '{"a":1}\n' };
    expect(() => snapshot(texts, "0.2.0")).toThrow(/already released/);
  });

  test("treats only spec/<name>.schema.json as a current spec file", () => {
    expect(isCurrentSpecFile(agentSpec)).toBe(true);
    expect(isCurrentSpecFile(released("0.1.0"))).toBe(false);
    expect(isCurrentSpecFile("packages/core/acme/src/agent.schema.json")).toBe(false);
    expect(isCurrentSpecFile("packages/core/acme/spec/notes.json")).toBe(false);
    expect(() => releasedSpecPath("packages/core/acme/agent.json", "0.1.0")).toThrow(
      /not a spec file/,
    );
  });

  test("leaves another package's released copies out", () => {
    const other = "packages/core/other/spec/released/0.1.0/agent.schema.json";
    const texts = { [agentSpec]: '{"a":1}\n', [other]: '{"a":1}\n' };
    expect([...snapshot(texts, "0.1.0").keys()]).toEqual([released("0.1.0")]);
  });
});
