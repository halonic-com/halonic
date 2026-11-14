import { type ErrorKind, errorKinds, isErrorKind, KindedError } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { kindedErrorResponse } from "./error-response.ts";

const statuses: Record<ErrorKind, number> = {
  invalid_input: 400,
  unauthenticated: 401,
  denied: 403,
  not_found: 404,
  conflict: 409,
  limit_reached: 429,
  unavailable: 503,
  internal: 500,
};

const genericMessage = "The server couldn't answer this request.";

describe("kindedErrorResponse", () => {
  verifies("server.error-response", () => {
    for (const kind of errorKinds.filter((each) => each !== "internal")) {
      it(`answers ${kind} with status ${statuses[kind]} and its own message`, async () => {
        const response = kindedErrorResponse(new KindedError(kind, "Readable reason."));
        expect(response.status).toBe(statuses[kind]);
        const body = (await response.json()) as { code: unknown; message: string };
        expect(isErrorKind(body.code)).toBe(true);
        expect(body).toEqual({ code: kind, message: "Readable reason." });
      });
    }

    it("answers internal with status 500 and a generic message, not its own text", async () => {
      const response = kindedErrorResponse(new KindedError("internal", "failed at the key file"));
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ code: "internal", message: genericMessage });
    });

    it("adds the fix when the error has one, and only then", async () => {
      const withFix = kindedErrorResponse(
        new KindedError("limit_reached", "Too many runs.", { fix: "Try again in a minute." }),
      );
      expect(await withFix.json()).toEqual({
        code: "limit_reached",
        message: "Too many runs.",
        fix: "Try again in a minute.",
      });
      const without = kindedErrorResponse(new KindedError("denied", "Not allowed."));
      expect(await without.json()).toEqual({ code: "denied", message: "Not allowed." });
    });

    it("keeps the fix of an internal error out of the reply", async () => {
      const response = kindedErrorResponse(
        new KindedError("internal", "detail", { fix: "Edit halonic.conf." }),
      );
      expect(await response.text()).not.toContain("halonic.conf");
    });

    it("answers an unknown thrown value with a 500 and the generic message", async () => {
      const thrown = [
        Object.assign(new Error("ENOENT: no such file or directory, open secrets.json"), {
          errno: -2,
        }),
        "a string",
        { kind: "not_found", message: "looks kinded but isn't" },
        undefined,
      ];
      for (const error of thrown) {
        const response = kindedErrorResponse(error);
        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ code: "internal", message: genericMessage });
      }
    });
  });
});
