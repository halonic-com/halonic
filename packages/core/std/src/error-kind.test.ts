import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { type ErrorKind, errorKindOf, errorKinds, isErrorKind, KindedError } from "./error-kind.ts";

/** Stands in for an existing error class that keeps its own codes and adds a kind. */
class RuleError extends Error {
  get kind(): ErrorKind {
    return "denied";
  }
}

verifies("std.error-kind", () => {
  it("lists exactly the eight kinds, in a fixed order", () => {
    expect(errorKinds).toEqual([
      "invalid_input",
      "not_found",
      "conflict",
      "unauthenticated",
      "denied",
      "limit_reached",
      "unavailable",
      "internal",
    ]);
  });

  it("makes an error that keeps its kind, message and name", () => {
    const error = new KindedError("not_found", "There is no hub named support.");
    expect(error).toBeInstanceOf(Error);
    expect(error.kind).toBe("not_found");
    expect(error.message).toBe("There is no hub named support.");
    expect(error.name).toBe("KindedError");
    expect(errorKindOf(error)).toBe("not_found");
  });

  it("keeps the error it wraps as the cause", () => {
    const cause = new Error("socket closed");
    const error = new KindedError("unavailable", "The model provider didn't answer.", { cause });
    expect(error.cause).toBe(cause);
  });

  it("reads the kind of every kind it makes", () => {
    for (const kind of errorKinds) {
      expect(errorKindOf(new KindedError(kind, "x"))).toBe(kind);
    }
  });

  it("reads the kind of an error that came over the wire as a plain object", () => {
    expect(errorKindOf({ kind: "conflict", message: "The run changed." })).toBe("conflict");
    expect(errorKindOf(JSON.parse('{"kind":"limit_reached","message":"Budget used up."}'))).toBe(
      "limit_reached",
    );
  });

  it("reads the kind of an existing error class through its getter", () => {
    expect(errorKindOf(new RuleError("The permission sheet doesn't allow this host."))).toBe(
      "denied",
    );
  });

  it("treats an event-like object with a kind but no message as internal", () => {
    expect(errorKindOf({ kind: "conflict" })).toBe("internal");
    expect(errorKindOf({ kind: "conflict", message: 42 })).toBe("internal");
  });

  it("treats values without a valid kind as internal", () => {
    expect(errorKindOf({ kind: "not-found", message: "x" })).toBe("internal");
    expect(errorKindOf(new TypeError("x is undefined"))).toBe("internal");
    expect(errorKindOf("boom")).toBe("internal");
    expect(errorKindOf(null)).toBe("internal");
    expect(errorKindOf(undefined)).toBe("internal");
  });

  it("never reads the kind of the cause", () => {
    const cause = new KindedError("unavailable", "The provider is down.");
    expect(errorKindOf(new Error("Saving the run failed.", { cause }))).toBe("internal");
  });

  it("recognises only the eight kinds", () => {
    expect(isErrorKind("limit_reached")).toBe(true);
    expect(isErrorKind("not-found")).toBe(false);
    expect(isErrorKind("toString")).toBe(false);
    expect(isErrorKind("")).toBe(false);
    expect(isErrorKind(3)).toBe(false);
  });
});

verifies("std.error-fix", () => {
  it("keeps the fix apart from the message", () => {
    const error = new KindedError("unavailable", "Halonic couldn't reach Ollama.", {
      fix: "Start Ollama, then run again.",
    });
    expect(error.message).toBe("Halonic couldn't reach Ollama.");
    expect(error.fix).toBe("Start Ollama, then run again.");
  });

  it("has no fix and no cause when none is given", () => {
    const error = new KindedError("not_found", "There is no hub named support.");
    expect(error.fix).toBeUndefined();
    expect("cause" in error).toBe(false);
  });
});
