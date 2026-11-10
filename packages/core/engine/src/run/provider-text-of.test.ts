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
});
