import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { forbiddenImportsOf } from "./entry-imports.spec.ts";
import * as root from "./index.ts";
import * as modelText from "./model-text.ts";

// Only value names are compared: type-only names don't exist at runtime.
verifies("ports.untrusted-tool-listings", () => {
  it("reaches no yaml, no package root and no workspace past trust-url", () => {
    expect(forbiddenImportsOf(join(import.meta.dirname, "model-text.ts"))).toEqual([]);
  });

  it("finds the format and workspace roots through the main entry point, so the check above can fail", () => {
    const forbidden = forbiddenImportsOf(join(import.meta.dirname, "index.ts"));
    expect(forbidden).toContain("@halonicjs/workspace");
    expect(forbidden).toContain("@halonicjs/format");
  });

  it("fences a tool's text with the main entry point's own functions", () => {
    expect(modelText.fenceUntrusted).toBe(root.fenceUntrusted);
    expect(modelText.fenceStart).toBe(root.fenceStart);
    expect(modelText.fenceEnd).toBe(root.fenceEnd);
    expect(modelText.fencedTextsNotice).toBe(root.fencedTextsNotice);
    expect(modelText.toolForModel).toBe(root.toolForModel);
    expect(modelText.toolResultForModel).toBe(root.toolResultForModel);
  });
});

verifies("ports.untrusted-knowledge", () => {
  it("fences knowledge with the main entry point's own functions", () => {
    expect(modelText.knowledgeDocForModel).toBe(root.knowledgeDocForModel);
    expect(modelText.knowledgeHitForModel).toBe(root.knowledgeHitForModel);
    expect(modelText.maxKnowledgeRefLength).toBe(root.maxKnowledgeRefLength);
  });
});
