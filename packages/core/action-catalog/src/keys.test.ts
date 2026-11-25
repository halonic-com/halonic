import { describe, expect, it } from "vitest";
import { shippedKeys } from "./keys.ts";

describe("shippedKeys", () => {
  it("lists every definition file under src/<service>/", () => {
    expect(shippedKeys).toEqual([
      "device/check-android-build",
      "device/check-phone-pairing",
      "device/check-windows-build",
      "github/upload-social-preview",
      "google/configure-oauth-consent",
      "google/create-cloud-project",
      "npm/claim-placeholder",
      "npm/renew-trusted-publisher",
      "npm/set-trusted-publisher",
      "play/fill-data-safety",
      "play/set-up-closed-test",
    ]);
  });
});
