import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import * as factories from "./connector-factories.ts";
import { forbiddenImportsOf } from "./entry-imports.spec.ts";
import * as root from "./index.ts";

// Only value names are compared: type-only names don't exist at runtime.
verifies("app.connector-factories", () => {
  it("reaches no yaml, no package root and no workspace past trust-url", () => {
    expect(forbiddenImportsOf(join(import.meta.dirname, "connector-factories.ts"))).toEqual([]);
  });

  it("connects with the main entry point's own class and function", () => {
    expect(factories.ConnectorFactories).toBe(root.ConnectorFactories);
    expect(factories.connectorConfigOf).toBe(root.connectorConfigOf);
  });
});
