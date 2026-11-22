import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { isSetupCause, setupFailureOf } from "./run-failure-setup.ts";

const file = "/profile/secrets/secrets.json";

function unreadable(detail: Record<string, string>) {
  return { kind: "denied" as const, code: "secrets.file-unreadable", detail };
}

verifies("app.run-failure-secrets-unreadable", () => {
  describe("a secrets file the person's user account can't read (HAL-15693)", () => {
    it("names the file and the fix, as this computer's setup", () => {
      for (const fix of ["chmod", "chown", "properties"]) {
        const cause = unreadable({ file, fix });
        expect(setupFailureOf(cause)).toEqual({ reason: "secrets-file-unreadable", file, fix });
        expect(isSetupCause(cause)).toBe(true);
      }
    });

    it("is no setup failure without the file, or with a fix the app doesn't know", () => {
      for (const cause of [
        unreadable({ fix: "chmod" }),
        unreadable({ file }),
        unreadable({ file, fix: "icacls" }),
      ]) {
        expect(setupFailureOf(cause)).toBeUndefined();
        expect(isSetupCause(cause)).toBe(false);
      }
    });
  });
});
