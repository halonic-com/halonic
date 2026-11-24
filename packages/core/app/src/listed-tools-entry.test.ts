import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { forbiddenImportsOf } from "./entry-imports.spec.ts";
import * as root from "./index.ts";
import * as listedTools from "./listed-tools.ts";

// Only value names are compared: type-only names don't exist at runtime.
verifies("ports.listed-tool-approval", () => {
  it("reaches no yaml, no package root and no workspace past trust-url", () => {
    expect(forbiddenImportsOf(join(import.meta.dirname, "listed-tools.ts"))).toEqual([]);
  });

  it("reads a listing and checks a call with the main entry point's own functions", () => {
    expect(listedTools.readToolListing).toBe(root.readToolListing);
    expect(listedTools.checkToolCall).toBe(root.checkToolCall);
  });
});
