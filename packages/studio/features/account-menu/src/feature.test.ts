import { describe, expect, it } from "vitest";
import { AccountMenuHostService } from "./api.ts";
import { accountMenuFeature } from "./feature.ts";

describe("accountMenuFeature", () => {
  it("is registered under its folder name", () => {
    expect(accountMenuFeature.id).toBe("account-menu");
  });

  it("only wants the host, so the desktop app, which has none, still starts", () => {
    expect(accountMenuFeature.needs).toEqual([]);
    expect(accountMenuFeature.wants).toEqual([AccountMenuHostService]);
  });
});
