import { readFileSync } from "node:fs";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { nodeFloor, nodeTooOldLines } from "../bin/node-floor.js";

verifies("cli.node-floor", () => {
  it("names the floor and the Node.js the user has, with a fix line", () => {
    expect(nodeTooOldLines("20.19.5")).toEqual([
      "✕ halonic needs Node.js 26.12 or newer. You have 20.19.5.",
      "  Install Node.js 26.12 or newer from https://nodejs.org, then run halonic again.",
    ]);
  });

  it.each(["22.21.0", "24.22.2", "26.11.0", "25.99.0"])("refuses %s", (version) => {
    expect(nodeTooOldLines(version)).toHaveLength(2);
  });

  it.each(["26.12.0", "26.13.1", "27.0.0", "100.0.0"])("runs on %s", (version) => {
    expect(nodeTooOldLines(version)).toEqual([]);
  });

  it("keeps the floor equal to devEngines.runtime in the root package.json", () => {
    const root = JSON.parse(
      readFileSync(new URL("../../../package.json", import.meta.url), "utf8"),
    );
    expect(root.devEngines.runtime.version).toBe(`^${nodeFloor.major}.${nodeFloor.minor}.0`);
  });
});
