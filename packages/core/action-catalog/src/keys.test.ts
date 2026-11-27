import { describe, expect, it } from "vitest";
import { shippedKeys } from "./keys.ts";

describe("shippedKeys", () => {
  it("lists every definition file under src/<service>/", () => {
    expect(shippedKeys).toEqual([
      "anthropic/create-key",
      "cloudflare/create-token",
      "cloudflare/enable-email-routing",
      "device/check-android-build",
      "device/check-phone-pairing",
      "device/check-windows-build",
      "github/change-branch-protection",
      "github/change-ruleset",
      "github/create-actions-variable",
      "github/remove-runner",
      "github/set-actions-secret",
      "github/set-actions-variable",
      "github/set-repo-merge-options",
      "github/set-repo-visibility",
      "github/upload-social-preview",
      "google/configure-oauth-consent",
      "google/create-cloud-project",
      "google/create-credential",
      "google/create-test-account",
      "npm/claim-placeholder",
      "npm/renew-trusted-publisher",
      "npm/set-trusted-publisher",
      "openrouter/add-credit",
      "openrouter/create-key",
      "paperclip/bind-secret",
      "paperclip/connect-and-test",
      "paperclip/set-secret",
      "play/fill-data-safety",
      "play/set-up-closed-test",
      "registrar/set-nameservers",
    ]);
  });
});
