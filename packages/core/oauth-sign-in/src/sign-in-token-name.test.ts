import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { signInsInTokenNames, signInTokenName } from "./sign-in-token-name.ts";

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

  it("reads an integration's sign-ins back from token names, as written or as stored", () => {
    const names = ["s6_gitlab_work_account", "S6-GITLAB-HOME", "s3_jira_work", "google-account-1"];
    expect(signInsInTokenNames("gitlab", names)).toEqual(["home", "work-account"]);
    expect(signInsInTokenNames("gitlab", [signInTokenName("gitlab", "work-account")])).toEqual([
      "work-account",
    ]);
  });

  it("keeps two integrations whose names run together apart", () => {
    expect(signInsInTokenNames("a-b", ["s1_a_b_c"])).toEqual([]);
    expect(signInsInTokenNames("a", ["s1_a_b_c"])).toEqual(["b-c"]);
  });

  it("finds none for an integration that isn't a sheet name, or a rest that isn't a sign-in", () => {
    expect(signInsInTokenNames("acme.weather", ["s12_acme.weather_work"])).toEqual([]);
    expect(signInsInTokenNames("gitlab", ["s6_gitlab_", "s6_gitlab__work"])).toEqual([]);
  });
});
