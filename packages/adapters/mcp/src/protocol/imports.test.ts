import { readdirSync, readFileSync } from "node:fs";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";

const protocolFolder = new URL("./", import.meta.url);

/** The protocol's own source files, without tests. */
function protocolSources(): string[] {
  return readdirSync(protocolFolder, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
    .sort();
}

verifies("mcp.protocol-portable", () => {
  it.each(protocolSources())(
    "%s imports only the protocol, schema-kit and nothing from Node",
    (file) => {
      const source = readFileSync(new URL(file, protocolFolder), "utf8");
      const imported = [...source.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]);
      const foreign = imported.filter(
        (specifier) => specifier !== "@halonicjs/schema-kit" && !specifier?.startsWith("."),
      );
      expect(foreign).toEqual([]);
    },
  );
});
