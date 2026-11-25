import { describe, expect, it } from "vitest";
import { shippedKeys } from "./keys.ts";

describe("shippedKeys", () => {
  it("lists every definition file under src/<service>/", () => {
    expect(shippedKeys).toEqual([
      "github/upload-social-preview",
      "google/configure-oauth-consent",
      "google/create-cloud-project",
      "play/fill-data-safety",
      "play/set-up-closed-test",
    ]);
  });
});
