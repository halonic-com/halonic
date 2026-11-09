import { PassThrough } from "node:stream";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readRequestBody } from "./read-body.ts";

const limits = { maxBytes: 16, timeoutMs: 5_000 };

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

verifies("harness-bridge.server", () => {
  it("reads a body that arrives in time and within the limit", async () => {
    const request = new PassThrough();
    const body = readRequestBody(request, limits);
    request.write("hello ");
    request.end("bridge");
    expect(new TextDecoder().decode(await body)).toBe("hello bridge");
  });

  it("gives up on a body that doesn't arrive within the time limit", async () => {
    const request = new PassThrough();
    const body = readRequestBody(request, limits);
    request.write("hel");
    const rejected = expect(body).rejects.toMatchObject({
      kind: "invalid_input",
      message: "The request didn't arrive within 5 seconds.",
    });
    await vi.advanceTimersByTimeAsync(4_999);
    request.write("l");
    await vi.advanceTimersByTimeAsync(1);
    await rejected;
  });

  it("stops at the first byte over the size limit", async () => {
    const request = new PassThrough();
    const body = readRequestBody(request, limits);
    request.write("x".repeat(16));
    request.write("y");
    await expect(body).rejects.toMatchObject({ kind: "invalid_input" });
  });

  it("passes on an error from the connection", async () => {
    const request = new PassThrough();
    const body = readRequestBody(request, limits);
    request.destroy(new Error("connection reset"));
    await expect(body).rejects.toThrow("connection reset");
  });
});
