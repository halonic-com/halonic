import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { hostMainPart } from "./service-refused-cause.ts";
import { twoPartEndings } from "./two-part-endings.ts";

verifies("engine.tool-result-cause", () => {
  describe("each two-part ending keeps three labels", () => {
    for (const ending of twoPartEndings) {
      it(`shows api.shop.${ending} as shop.${ending}`, () => {
        expect(hostMainPart(`api.shop.${ending}`)).toBe(`shop.${ending}`);
      });
    }
  });

  it("writes every ending as two lower-case ASCII labels", () => {
    for (const ending of twoPartEndings) {
      expect(ending).toMatch(/^[a-z]+\.[a-z]+$/);
    }
  });

  it("keeps two labels under any other ending", () => {
    expect(hostMainPart("api.shop.example.com")).toBe("example.com");
    expect(hostMainPart("uk.example.com")).toBe("example.com");
  });

  it("keeps a host with fewer labels as it is, without a final dot", () => {
    expect(hostMainPart("example.com.")).toBe("example.com");
    expect(hostMainPart("intranet")).toBe("intranet");
  });
});
