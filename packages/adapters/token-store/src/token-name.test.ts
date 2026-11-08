import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { canonicalTokenName } from "./token-name.ts";

verifies("token-store.token-names", () => {
  it("treats case and - versus _ as the same name", () => {
    expect(canonicalTokenName("Google-Refresh")).toBe("google_refresh");
    expect(canonicalTokenName("google_refresh")).toBe("google_refresh");
    expect(canonicalTokenName("GOOGLE_REFRESH")).toBe("google_refresh");
  });

  it("accepts a name of exactly 128 characters", () => {
    expect(canonicalTokenName(`a${"b".repeat(127)}`)).toHaveLength(128);
  });

  it("throws RangeError for a name that breaks the rule", () => {
    for (const name of [
      "",
      "1token",
      "_token",
      "to ken",
      "token.key",
      "tökén",
      `a${"b".repeat(128)}`,
    ]) {
      expect(() => canonicalTokenName(name)).toThrow(RangeError);
    }
  });
});
