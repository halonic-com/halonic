import { type ErrorKind, errorKindOf } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { IntegrationRefusedError, IntegrationTimeoutError, type RefusalCode } from "./refused.ts";

/** The kind of each refusal code, written out as plan section 4 gives it. */
const expectedKinds: Record<RefusalCode, ErrorKind> = {
  "bad-url": "invalid_input",
  "body-not-supported": "invalid_input",
  "secret-needs-form-body": "invalid_input",
  "request-too-large": "invalid_input",
  "response-too-large": "unavailable",
  "scheme-not-allowed": "denied",
  "host-not-allowed": "denied",
  "secret-not-declared": "denied",
  "placement-not-in-sheet": "denied",
  "secret-not-allowed-for-host": "denied",
  "secret-over-plain-http": "denied",
  "secret-not-configured": "denied",
  "secret-too-short": "denied",
  "too-many-redirects": "denied",
  "secret-in-request": "denied",
  "secret-in-redirect": "denied",
  "token-not-declared": "denied",
};

verifies("integration-kit.error-kinds", () => {
  it.each(Object.entries(expectedKinds))("gives the refusal %s the kind %s", (code, kind) => {
    const error = new IntegrationRefusedError(code as RefusalCode, "Refused.");
    expect(error.kind).toBe(kind);
    expect(errorKindOf(error)).toBe(kind);
  });

  it("gives a timeout the kind unavailable, as a retry may work", () => {
    const error = new IntegrationTimeoutError("The request took too long.");
    expect(errorKindOf(error)).toBe("unavailable");
  });
});
