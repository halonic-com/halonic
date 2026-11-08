import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { parsedValue, problemsOf, summary, yaml } from "../../test/parse.ts";

verifies("format.knowledge-file", () => {
  it("fills in config and keeps mode and writable", () => {
    const text = yaml("id: handbook", "provider: files", "mode: auto", "writable: true");
    expect(parsedValue("knowledge", text)).toEqual({
      version: 1,
      id: "handbook",
      provider: "files",
      mode: "auto",
      writable: true,
      config: {},
    });
  });

  it("refuses an unknown mode", () => {
    const text = yaml("id: handbook", "provider: files", "mode: always");
    expect(summary(problemsOf("knowledge", text))).toEqual(["mode invalid_value 3"]);
  });

  it("refuses a source without a provider", () => {
    expect(summary(problemsOf("knowledge", yaml("id: handbook")))).toEqual([
      "provider invalid_type 1",
    ]);
  });
});
