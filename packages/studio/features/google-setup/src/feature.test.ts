import { InboxService } from "@halonicjs/studio-feature-inbox/api";
import { RunsListService } from "@halonicjs/studio-feature-runs/api";
import { describe, expect, it } from "vitest";
import { GoogleSetupAccountsService, GoogleSetupSourceService } from "./api.ts";
import { googleSetupFeature } from "./feature.ts";

describe("googleSetupFeature", () => {
  it("is registered under its folder name, reads the app's accounts and adds to the Inbox", () => {
    expect(googleSetupFeature.id).toBe("google-setup");
    expect(googleSetupFeature.needs).toEqual([
      GoogleSetupAccountsService,
      InboxService,
      RunsListService,
    ]);
    expect(googleSetupFeature.provides).toEqual([GoogleSetupSourceService]);
  });
});
