import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { DeployError, type DeployErrorCode, DeployLockedError } from "./errors.ts";
import { lockHolderOf, toDeployFailure } from "./port-failure.ts";

const startedAt = Date.parse("2026-11-22T14:30:00.000Z");
const expiresAt = Date.parse("2026-11-22T14:42:00.000Z");

verifies("deploy.port-failure", () => {
  describe("toDeployFailure", () => {
    it("keeps the holder of a deploy-locked error, kind conflict", () => {
      const error = new DeployLockedError("sam@example.com", startedAt, expiresAt);
      const failure = toDeployFailure(error);
      expect(failure).toMatchObject({ code: "deploy-locked", kind: "conflict", fix: undefined });
      expect(failure.message).toBe(error.message);
      expect(failure.cause).toBe(error);
      expect(lockHolderOf(error)).toEqual({
        who: "sam@example.com",
        startedAt: "2026-11-22T14:30:00.000Z",
        expiresAt: "2026-11-22T14:42:00.000Z",
      });
    });

    it.each<[DeployErrorCode, string, string]>([
      ["token-inactive", "token-inactive", "unauthenticated"],
      ["cloudflare-request-failed", "host-request-failed", "unavailable"],
      ["deploy-lock-lost", "deploy-locked", "conflict"],
      ["traffic-split-in-progress", "traffic-split", "conflict"],
      ["schema-newer-than-cli", "older-than-live", "conflict"],
      ["uncommitted-changes", "uncommitted-changes", "conflict"],
      ["deploy-aborted", "stopped", "conflict"],
      ["bundle-hash-mismatch", "unexpected", "internal"],
      ["export-refused", "transfer-failed", "denied"],
    ])("maps %s to %s, kind %s", (own, code, kind) => {
      const failure = toDeployFailure(new DeployError(own, "Nothing changed on Cloudflare."));
      expect(failure).toMatchObject({ code, kind, message: "Nothing changed on Cloudflare." });
    });

    it("passes on the fix of the target's own error", () => {
      const error = new DeployError("deploy-lock-lost", "Another deploy took over.", {
        fix: "Run halonic deploy again once the other deploy has finished.",
      });
      expect(toDeployFailure(error)).toMatchObject({
        code: "deploy-locked",
        fix: "Run halonic deploy again once the other deploy has finished.",
      });
    });

    it("hides the message of an error that isn't the target's own", () => {
      const failure = toDeployFailure(new TypeError('response {"token":"abc"}'));
      expect(failure).toMatchObject({ code: "unexpected", kind: "internal" });
      expect(failure.message).not.toContain("abc");
    });
  });

  it("shows a stored lease's label as the holder", () => {
    expect(lockHolderOf({ id: "a", label: "build-box", startedAt, expiresAt }).who).toBe(
      "build-box",
    );
  });
});
