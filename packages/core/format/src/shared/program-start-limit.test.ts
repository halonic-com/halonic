import { KindedError } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { parsedValue, problemsOf, summary, yaml } from "../test/parse.spec.ts";
import { pathsIn, pathsNamedBy, startReadingSize } from "./program-start.ts";

const colons = ":".repeat(4000);

/** A connector whose local program takes `arg`. */
function connectorWith(arg: string): string {
  return yaml("id: files", "transport:", "  stdio:", "    command: mcp", `    args: ['${arg}']`);
}

verifies("format.program-start-limit", () => {
  it("counts the text after each '=', ':' and '@' without building it", () => {
    expect(startReadingSize({ args: ["a=b:c"] })).toBe(4);
    expect(startReadingSize({ args: ["a@b"], env: { MAIL: "x=y" } })).toBe(2);
    expect(startReadingSize({ args: ["tools/mail.js"] })).toBe(0);
  });

  it("refuses to read a start that holds too much, rather than read part of it", () => {
    const read = () => pathsNamedBy({ cwd: ".", program: "mcp", args: [colons] });
    expect(read).toThrow(KindedError);
    expect(read).toThrow(/too long to check for the paths it names/);
    expect(() => pathsNamedBy({ cwd: ".", program: "mcp", args: [], env: { X: colons } })).toThrow(
      KindedError,
    );
    expect(() => pathsIn(colons)).toThrow(KindedError);
  });

  it("refuses a connector whose program start holds too much to read", () => {
    expect(summary(problemsOf("connector", connectorWith(colons)))).toEqual([
      "transport.stdio start-too-long-to-check 4",
    ]);
  });

  it("passes a connector with an ordinary start", () => {
    const connector = parsedValue("connector", connectorWith("--config=tools/mail.json"));
    expect(connector.id).toBe("files");
  });
});
