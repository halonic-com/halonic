import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { connectorCallRequestsOf, maxConnectorCallRequests } from "./index.ts";

const slowDown = { method: "GET", host: "api.example.com", path: "/v1/items", status: 429 };

/** An error as a connector adapter throws it, built here so the test needs no adapter. */
function failedCall(callRequests: unknown, message = "failed"): Error {
  return Object.assign(new Error(message), { callRequests });
}

verifies("ports.connector-call-requests", () => {
  it("reads the requests of the call, oldest first", () => {
    const refused = {
      method: "POST",
      host: "evil.example.net",
      path: "/",
      refusal: "host-not-allowed",
    };
    const retried = { ...slowDown, retry: 2 };
    expect(connectorCallRequestsOf(failedCall([slowDown, refused, retried]))).toStrictEqual([
      slowDown,
      refused,
      retried,
    ]);
  });

  it("reads them from the error's cause", () => {
    const error = new Error("outer", { cause: failedCall([slowDown]) });
    expect(connectorCallRequestsOf(error)).toStrictEqual([slowDown]);
  });

  it("gives undefined for an error without them, or a value that isn't an error", () => {
    expect(connectorCallRequestsOf(new Error("plain"))).toBeUndefined();
    expect(connectorCallRequestsOf({ callRequests: [slowDown] })).toBeUndefined();
    expect(connectorCallRequestsOf(undefined)).toBeUndefined();
  });

  it("gives undefined when any entry has a field of the wrong type", () => {
    for (const wrong of [
      { ...slowDown, status: "429" },
      { ...slowDown, status: -1 },
      { ...slowDown, retry: 1.5 },
      { ...slowDown, refusal: 3 },
      { ...slowDown, host: undefined },
      "GET /v1",
      null,
    ]) {
      expect(connectorCallRequestsOf(failedCall([slowDown, wrong]))).toBeUndefined();
    }
    expect(connectorCallRequestsOf(failedCall("GET"))).toBeUndefined();
  });

  it("keeps only the request's own fields", () => {
    const withBody = { ...slowDown, body: "reply", headers: [["authorization", "x"]] };
    expect(connectorCallRequestsOf(failedCall([withBody]))).toStrictEqual([slowDown]);
  });

  it("keeps the newest entries of a long list", () => {
    const many = Array.from({ length: maxConnectorCallRequests + 5 }, (_, index) => ({
      ...slowDown,
      path: `/${index}`,
    }));
    const read = connectorCallRequestsOf(failedCall(many));
    expect(read).toHaveLength(maxConnectorCallRequests);
    expect(read?.at(-1)?.path).toBe(`/${maxConnectorCallRequests + 4}`);
  });
});
