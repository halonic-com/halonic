import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { ModelCallError, networkCauseOf } from "./index.ts";

/** A network error as the HTTP client's `ProxyError` builds it, from another package. */
function proxyRefused(): Error {
  return Object.assign(new Error("Your proxy refused to connect to model.test (status 403)."), {
    name: "ProxyError",
    code: "proxy-failed",
    kind: "denied",
    failureCause: { code: "proxy.refused", detail: { variable: "HTTPS_PROXY", status: "403" } },
  });
}

verifies("ports.model-call-cause", () => {
  describe("networkCauseOf", () => {
    it("reads the kind, code and detail a network error carries", () => {
      expect(networkCauseOf(proxyRefused())).toEqual({
        kind: "denied",
        code: "proxy.refused",
        detail: { variable: "HTTPS_PROXY", status: "403" },
      });
    });

    it("finds none on a plain network error or a value that isn't an error", () => {
      expect(networkCauseOf(new TypeError("fetch failed"))).toBeUndefined();
      expect(networkCauseOf(Object.assign(new Error("x"), { kind: "denied" }))).toBeUndefined();
      expect(networkCauseOf({ kind: "denied", failureCause: {} })).toBeUndefined();
    });
  });

  describe("a ModelCallError with a typed cause", () => {
    it("keeps the kind as its own and the code and detail as its failureCause", () => {
      const cause = proxyRefused();
      const error = new ModelCallError("offline", "Halonic couldn't reach Acme", {
        cause,
        failureCause: networkCauseOf(cause),
      });

      expect(error.kind).toBe("denied");
      expect(error.failureCause).toEqual({
        code: "proxy.refused",
        detail: { variable: "HTTPS_PROXY", status: "403" },
      });
    });

    it("has neither field without one", () => {
      const error = new ModelCallError("offline", "no route to host");

      expect("kind" in error).toBe(false);
      expect("failureCause" in error).toBe(false);
    });
  });
});
