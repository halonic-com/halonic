import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { signInTokenName } from "./sign-in-token-name.ts";

verifies("oauth-sign-in.sign-in-token-name", () => {
  it("builds s<length>_<integration>_<sign-in>", () => {
    expect(signInTokenName("gitlab", "work-account")).toBe("s6_gitlab_work-account");
  });

  it("keeps two pairs that run together apart", () => {
    expect(signInTokenName("a-b", "c")).not.toBe(signInTokenName("a", "b-c"));
  });

  it("refuses a name that isn't lower-case words joined by '-'", () => {
    for (const bad of ["Gitlab", "git_lab", "", "1gitlab", "git--lab", "git lab"]) {
      expect(() => signInTokenName(bad, "work")).toThrow(RangeError);
      expect(() => signInTokenName("gitlab", bad)).toThrow(RangeError);
    }
  });

  it("refuses a name longer than a token name may be", () => {
    expect(() => signInTokenName("a".repeat(70), "b".repeat(70))).toThrow(RangeError);
  });
});
