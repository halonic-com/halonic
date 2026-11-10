import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { SandboxOpenedView } from "./sandbox-opened.ts";
import { readSandboxOpened } from "./sandbox-opened-read.ts";

const view: SandboxOpenedView = {
  strength: "os",
  workingFolder: "~/work/site",
  readOnlyPaths: ["~/work/site/.halonic"],
  deniedGroups: ["ssh-keys", "halonic-data"],
  deniedPaths: ["~/Documents/tax"],
  allowedSites: ["registry.npmjs.org"],
  timeLimitMs: 600_000,
};

verifies("events.sandbox-opened", () => {
  it("reads a view as the log stored it", () => {
    expect(readSandboxOpened(JSON.parse(JSON.stringify(view)))).toEqual(view);
  });

  it("gives null for a value that isn't a view, without throwing", () => {
    for (const damaged of [undefined, null, "damaged", 7, [], [view]]) {
      expect(readSandboxOpened(damaged)).toBeNull();
    }
  });

  it("gives null when a field is missing or has the wrong kind of value", () => {
    const broken: Record<string, unknown>[] = [
      { ...view, strength: "container" },
      { ...view, workingFolder: undefined },
      { ...view, readOnlyPaths: "~/work" },
      { ...view, deniedPaths: [1] },
      { ...view, allowedSites: null },
      { ...view, deniedGroups: ["ssh-keys", "someone-elses-group"] },
      { ...view, timeLimitMs: "600000" },
      { ...view, timeLimitMs: -1 },
      { ...view, timeLimitMs: Number.POSITIVE_INFINITY },
    ];
    for (const value of broken) {
      expect(readSandboxOpened(value)).toBeNull();
    }
  });

  it("copies only the view's fields, so extra fields in a damaged log never reach a screen", () => {
    const withExtra = { ...view, env: { API_TOKEN: "not-for-the-screen" }, tempFolder: "/tmp/x" }; // leak-guard: allow absolute-path a made-up temp folder for the test
    const read = readSandboxOpened(withExtra);
    expect(read).toEqual(view);
    expect(JSON.stringify(read)).not.toContain("not-for-the-screen");
  });

  it("returns lists the caller can't change through the stored value", () => {
    const stored = JSON.parse(JSON.stringify(view));
    const read = readSandboxOpened(stored);
    expect(read?.deniedGroups).not.toBe(stored.deniedGroups);
    expect(read?.allowedSites).not.toBe(stored.allowedSites);
  });
});
