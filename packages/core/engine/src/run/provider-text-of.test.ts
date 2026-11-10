import { ModelCallError, VendorErrorText } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { providerTextOf } from "./provider-text-of.ts";

verifies("engine.provider-text", () => {
  it("takes the text and status of a VendorErrorText cause", () => {
    const cause = new VendorErrorText(400, "max_tokens is too large");
    const error = new ModelCallError("refused", "acme refused the call (HTTP 400)", { cause });
    expect(providerTextOf(error)).toEqual({ status: 400, text: "max_tokens is too large" });
  });

  it("takes one from another copy of the ports package", () => {
    const cause = Object.assign(new Error("Overloaded"), { name: "VendorErrorText", status: 529 });
    const error = new ModelCallError("provider-busy", "acme is busy (HTTP 529)", { cause });
    expect(providerTextOf(error)).toEqual({ status: 529, text: "Overloaded" });
  });

  it("leaves the status out for a stream error that has none", () => {
    const cause = new VendorErrorText(undefined, "unknown stream error");
    const error = new ModelCallError("refused", "acme refused the call (error event)", { cause });
    expect(providerTextOf(error)).toStrictEqual({ text: "unknown stream error" });
  });

  it("takes nothing from any other cause, or from an error without one", () => {
    const network = new ModelCallError("offline", "Halonic couldn't reach acme", {
      cause: new TypeError("fetch failed"),
    });
    expect(providerTextOf(network)).toBeUndefined();
    expect(providerTextOf(new ModelCallError("refused", "no"))).toBeUndefined();
    expect(providerTextOf(new Error("boom", { cause: "max_tokens" }))).toBeUndefined();
    expect(providerTextOf("boom")).toBeUndefined();
  });

  it("drops a text that still holds something shaped like a key", () => {
    const leaked = `invalid key sk-${"Q7x2Lm9K".repeat(3)}`;
    const cause = Object.assign(new Error(leaked), { name: "VendorErrorText", status: 401 });
    const error = new ModelCallError("key-refused", "acme refused the key (HTTP 401)", { cause });
    expect(providerTextOf(error)).toBeUndefined();
  });

  it("drops a key that sits past the cut", () => {
    const leaked = `${"x".repeat(295)} sk-${"Q7x2Lm9K".repeat(3)}`;
    const error = new ModelCallError("refused", "acme refused the call (HTTP 400)", {
      cause: new VendorErrorText(400, leaked),
    });
    expect(providerTextOf(error)).toBeUndefined();
  });

  it("keeps at most 300 characters, with an ellipsis after the cut", () => {
    const error = new ModelCallError("refused", "acme refused the call (HTTP 400)", {
      cause: new VendorErrorText(400, "a".repeat(5000)),
    });
    expect(providerTextOf(error)).toEqual({ status: 400, text: `${"a".repeat(300)}…` });
  });

  it("keeps a text of exactly 300 characters, and an adapter's own cut, as they are", () => {
    const exact = "b".repeat(300);
    const alreadyCut = `${"c".repeat(300)}…`;
    for (const text of [exact, alreadyCut]) {
      const error = new ModelCallError("refused", "acme refused the call (HTTP 400)", {
        cause: new VendorErrorText(400, text),
      });
      expect(providerTextOf(error)).toEqual({ status: 400, text });
    }
  });

  it("takes nothing from an empty text", () => {
    const error = new ModelCallError("refused", "acme refused the call (HTTP 400)", {
      cause: new VendorErrorText(400, ""),
    });
    expect(providerTextOf(error)).toBeUndefined();
  });
});
