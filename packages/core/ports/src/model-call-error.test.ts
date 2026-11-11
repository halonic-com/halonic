import { typeTest, verifies } from "@halonicjs/testing-spec";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  isModelCallError,
  isModelOutOfMemory,
  isVendorErrorText,
  ModelCallError,
  type ModelCallErrorReason,
  VendorErrorText,
} from "./index.ts";

/** An error as another copy of this package would build it: same name and fields, other class. */
function fromOtherCopy(reason: unknown, fields: Record<string, unknown> = {}): Error {
  return Object.assign(new Error("from another copy"), {
    name: "ModelCallError",
    reason,
    ...fields,
  });
}

verifies("ports.model-call-error", () => {
  it("says why the call failed", () => {
    const error = new ModelCallError("offline", "no route to host");
    expect(isModelCallError(error)).toBe(true);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("ModelCallError");
    expect(error.reason).toBe("offline");
    expect(error.message).toBe("no route to host");
  });

  it("keeps the cause it was given", () => {
    const cause = new TypeError("fetch failed");
    expect(new ModelCallError("offline", "unreachable", { cause }).cause).toBe(cause);
  });

  it("names the host that didn't answer, with offline only", () => {
    const offline = new ModelCallError("offline", "Ollama didn't answer.", {
      host: "localhost:11434",
    });
    expect(offline.host).toBe("localhost:11434");
    expect(new ModelCallError("refused", "no", { host: "localhost:11434" }).host).toBeUndefined();
    expect(new ModelCallError("offline", "no route to host").host).toBeUndefined();
  });

  it("recognises the error from another copy of the package by name and reason", () => {
    expect(isModelCallError(fromOtherCopy("model-missing"))).toBe(true);
    expect(isModelCallError(fromOtherCopy("offline", { host: "localhost:11434" }))).toBe(true);
  });

  it("turns away anything else", () => {
    expect(isModelCallError(new Error("boom"))).toBe(false);
    expect(isModelCallError(fromOtherCopy("busy"))).toBe(false);
    expect(isModelCallError(fromOtherCopy(undefined))).toBe(false);
    expect(isModelCallError(fromOtherCopy("offline", { host: 11434 }))).toBe(false);
    expect(isModelCallError({ name: "ModelCallError", reason: "offline", message: "" })).toBe(
      false,
    );
    expect(isModelCallError(null)).toBe(false);
    expect(isModelCallError("ModelCallError")).toBe(false);
  });

  typeTest("has exactly the nine reasons", () => {
    expectTypeOf<ModelCallErrorReason>().toEqualTypeOf<
      | "no-key"
      | "offline"
      | "model-missing"
      | "model-no-tools"
      | "out-of-memory"
      | "key-refused"
      | "out-of-credit"
      | "provider-busy"
      | "refused"
    >();
    expectTypeOf<ModelCallError["reason"]>().toEqualTypeOf<ModelCallErrorReason>();
  });
});

verifies("ports.vendor-error-text", () => {
  /** A `VendorErrorText` as another copy of this package would build it. */
  function textFromOtherCopy(fields: Record<string, unknown>): Error {
    return Object.assign(new Error("from another copy"), { name: "VendorErrorText", ...fields });
  }

  it("keeps the provider's text and the status it came with", () => {
    const text = new VendorErrorText(400, "max_tokens is too large");
    expect(isVendorErrorText(text)).toBe(true);
    expect(text).toBeInstanceOf(Error);
    expect(text.name).toBe("VendorErrorText");
    expect(text.status).toBe(400);
    expect(text.message).toBe("max_tokens is too large");
  });

  it("recognises the text from another copy of the package by name and status", () => {
    expect(isVendorErrorText(textFromOtherCopy({ status: 429 }))).toBe(true);
  });

  it("keeps the text of a stream error that has no status", () => {
    const text = new VendorErrorText(undefined, "unknown stream error");
    expect(isVendorErrorText(text)).toBe(true);
    expect(text.status).toBeUndefined();
    expect(isVendorErrorText(textFromOtherCopy({ status: undefined }))).toBe(true);
  });

  it("turns away anything else", () => {
    expect(isVendorErrorText(new Error("boom"))).toBe(false);
    expect(isVendorErrorText(textFromOtherCopy({}))).toBe(false);
    expect(isVendorErrorText(textFromOtherCopy({ status: "400" }))).toBe(false);
    expect(isVendorErrorText(textFromOtherCopy({ status: 400.5 }))).toBe(false);
    expect(isVendorErrorText({ name: "VendorErrorText", status: 400, message: "" })).toBe(false);
    expect(isVendorErrorText(undefined)).toBe(false);
  });
});

verifies("ports.model-out-of-memory-text", () => {
  describe("recognises what model servers say when memory runs out", () => {
    it.each([
      "model requires more system memory (12.0 GiB) than is available (7.6 GiB)",
      "llama runner process has terminated: cudaMalloc failed: out of memory",
      "CUDA error: out of memory",
      "ggml_metal_graph_compute: command buffer 0 failed with status 5: Insufficient Memory",
      "hipMalloc failed: out of memory",
      "failed to allocate compute buffers",
      "unable to allocate CPU buffer",
      "Not enough memory to load the model",
      "llama-server reported out-of-memory during startup: allocation failed",
    ])("%s", (text) => {
      expect(isModelOutOfMemory(text)).toBe(true);
    });
  });

  describe("leaves other errors alone", () => {
    it.each([
      'model "llama3" not found, try pulling it first',
      "connect ECONNREFUSED 127.0.0.1:11434",
      "rate limit exceeded",
      "",
    ])("%s", (text) => {
      expect(isModelOutOfMemory(text)).toBe(false);
    });
  });
});
