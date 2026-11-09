import { readdirSync, readFileSync } from "node:fs";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import * as host from "../index.ts";
import * as integration from "./index.ts";

/**
 * Every module the integration entry's own source files import: `from "…"`,
 * a bare `import "…"` and a dynamic `import("…")`.
 */
function entryImports(): string[] {
  const folder = new URL("./", import.meta.url);
  return readdirSync(folder)
    .filter((file) => file.endsWith(".ts") && !file.includes(".test"))
    .flatMap((file) => [
      ...readFileSync(new URL(file, folder), "utf8").matchAll(/(?:from|import)\s*\(?\s*"([^"]+)"/g),
    ])
    .map((match) => match[1] ?? "");
}

verifies("integration-kit.integration-entry", () => {
  it("imports only its own files and the ports, so it brings no outside code into an integration", () => {
    const outside = entryImports().filter(
      (specifier) => !specifier.startsWith("./") && specifier !== "@halonicjs/ports",
    );
    expect(outside).toEqual([]);
  });

  it("offers what integration code uses, and nothing of the host side", () => {
    expect(Object.keys(integration).sort()).toEqual([
      "IntegrationRefusedError",
      "IntegrationTimeoutError",
      "maxIntegrationWaitMs",
      "runTool",
    ]);
  });

  it("shares its error classes with the host side, so instanceof works across both", () => {
    expect(host.IntegrationRefusedError).toBe(integration.IntegrationRefusedError);
    expect(host.IntegrationTimeoutError).toBe(integration.IntegrationTimeoutError);
  });
});
