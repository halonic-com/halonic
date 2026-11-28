import { maxActionErrorLength } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { ActionShellError } from "./action-shell-error.ts";
import {
  readAccount,
  readNothing,
  readOpenResult,
  readSendResult,
  readSignInResult,
  readUserCode,
} from "./answers.ts";

function failureOf(read: () => unknown): string {
  try {
    read();
  } catch (error) {
    if (error instanceof ActionShellError) return error.failure;
    throw error;
  }
  throw new Error("expected the answer to be refused");
}

const answered = {
  outcome: "answered",
  status: 201,
  kept: { id: 7, state: "approved", note: null },
};

verifies("action-send-tauri.answers", () => {
  describe("the shell's answers", () => {
    it("takes every answer the shell gives, field by field", () => {
      expect(readSendResult(answered)).toEqual(answered);
      const failed = {
        outcome: "answered",
        status: 403,
        kept: {},
        error: "Must have admin rights.",
      };
      expect(readSendResult(failed)).toEqual(failed);
      expect(readSendResult({ outcome: "refused", reason: "signed-out" })).toEqual({
        outcome: "refused",
        reason: "signed-out",
      });
      expect(readSendResult({ outcome: "cancelled" })).toEqual({ outcome: "cancelled" });
      expect(readSendResult({ outcome: "unreachable" })).toEqual({ outcome: "unreachable" });
      expect(readOpenResult("action_open_guided", { outcome: "opened" })).toEqual({
        outcome: "opened",
      });
      expect(
        readOpenResult("action_open_page", { outcome: "refused", reason: "too-often" }),
      ).toEqual({
        outcome: "refused",
        reason: "too-often",
      });
      expect(readAccount("github", null)).toBeUndefined();
      expect(readAccount("github", { service: "github", name: "acme-dev" })).toEqual({
        service: "github",
        name: "acme-dev",
      });
      expect(readSignInResult("github", { outcome: "not-available" })).toEqual({
        outcome: "not-available",
      });
      expect(
        readUserCode(
          JSON.parse('{"code":"ACME-1","page":"https://github.com/login/device","expiresIn":900}'),
        ),
      ).toEqual({ code: "ACME-1", page: "https://github.com/login/device", expiresIn: 900 });
    });

    it("refuses an answer with a field it doesn't know, such as a token, rather than pass it on", () => {
      const withToken = [
        { ...answered, token: "acme-fake-token" },
        { outcome: "refused", reason: "bad-value", token: "acme-fake-token" },
        { outcome: "cancelled", headers: {} },
      ];
      for (const answer of withToken) {
        expect(failureOf(() => readSendResult(answer))).toBe("malformed-answer");
      }
      const account = { service: "github", name: "acme-dev", token: "acme-fake-token" };
      expect(failureOf(() => readAccount("github", account))).toBe("malformed-answer");
      const signedIn = {
        outcome: "signed-in",
        account: { service: "github", name: "acme-dev" },
        token: "x",
      };
      expect(failureOf(() => readSignInResult("github", signedIn))).toBe("malformed-answer");
      expect(
        failureOf(() => readOpenResult("action_open_page", { outcome: "opened", page: "x" })),
      ).toBe("malformed-answer");
    });

    it("refuses an answer whose fields aren't what the port says", () => {
      const malformed = [
        "answered",
        { outcome: "answered", status: 99, kept: {} },
        { outcome: "answered", status: 200.5, kept: {} },
        { outcome: "answered", status: 200 },
        { outcome: "answered", status: 200, kept: { details: { a: 1 } } },
        { outcome: "answered", status: 200, kept: { count: Number.NaN } },
        { outcome: "answered", status: 500, kept: {}, error: 42 },
        { outcome: "refused", reason: "nope" },
        { outcome: "sent" },
      ];
      for (const answer of malformed) {
        expect(failureOf(() => readSendResult(answer))).toBe("malformed-answer");
      }
      for (const answer of [null, { outcome: "refused" }, { outcome: "closed" }]) {
        expect(failureOf(() => readOpenResult("action_open_guided", answer))).toBe(
          "malformed-answer",
        );
      }
      for (const answer of [
        { service: "cloudflare", name: "acme" },
        { service: "github", name: "" },
        "acme",
      ]) {
        expect(failureOf(() => readAccount("github", answer))).toBe("malformed-answer");
      }
      const signIns = [
        null,
        { outcome: "signed-in", account: { service: "cloudflare", name: "acme" } },
        { outcome: "failed", reason: 3 },
        { outcome: "cancelled", why: "x" },
      ];
      for (const answer of signIns) {
        expect(failureOf(() => readSignInResult("github", answer))).toBe("malformed-answer");
      }
      expect(failureOf(() => readNothing("action_sign_out", { signedOut: true }))).toBe(
        "malformed-answer",
      );
    });

    it("takes more-than-one only on a successful status with nothing kept and no text", () => {
      const unusable = { outcome: "answered", status: 200, kept: {}, unusable: "more-than-one" };
      expect(readSendResult(unusable)).toEqual(unusable);
      const malformed = [
        { ...unusable, unusable: "The service found more than one match." },
        { ...unusable, status: 404 },
        { ...unusable, kept: { id: "acme-record" } },
        { ...unusable, error: "The service found more than one match." },
      ];
      for (const answer of malformed) {
        expect(failureOf(() => readSendResult(answer))).toBe("malformed-answer");
      }
    });

    it("caps the service's message even if the shell didn't", () => {
      const error = "x".repeat(maxActionErrorLength + 50);
      const result = readSendResult({ outcome: "answered", status: 500, kept: {}, error });
      expect(result).toEqual({
        outcome: "answered",
        status: 500,
        kept: {},
        error: "x".repeat(maxActionErrorLength),
      });
    });

    it("takes a device code only with an https page and a whole number of seconds", () => {
      const code = { code: "ACME-1", page: "https://github.com/login/device", expiresIn: 900 };
      const notCodes = [
        null,
        { ...code, extra: 1 },
        { ...code, code: "" },
        { ...code, code: 1 },
        { ...code, page: 1 },
        { ...code, page: "http://github.com/login/device" },
        { ...code, expiresIn: "900" },
      ];
      for (const message of notCodes) expect(readUserCode(message)).toBeUndefined();
    });
  });
});
