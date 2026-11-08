import { describe, expect, it } from "vitest";
import { canonicalBody, NoRecordingError, replayTransport } from "./recording.ts";

describe("testing-integration.recordings-fail-closed", () => {
  const { transport, seen } = replayTransport([
    {
      request: {
        method: "POST",
        url: "https://api.example.com/v1/items",
        body: '{"a":1,"b":[2,3]}',
      },
      response: { status: 201, headers: { "x-id": "7" }, body: "made" },
    },
    {
      request: { method: "DELETE", url: "https://api.example.com/v1/items/7" },
      response: { status: 204, body: "" },
    },
  ]);

  it("answers a request that matches on method, URL and JSON body in any key order", async () => {
    const response = await transport.fetch("https://API.example.com/v1/items", {
      method: "post",
      body: '{"b":[2,3],"a":1}',
      headers: { authorization: "Bearer placed-by-kit" },
    });
    expect([response.status, response.headers.get("x-id"), await response.text()]).toEqual([
      201,
      "7",
      "made",
    ]);
    expect(seen.at(-1)?.headers).toEqual({ authorization: "Bearer placed-by-kit" });
  });

  it("answers a 204 without a body", async () => {
    const response = await transport.fetch("https://api.example.com/v1/items/7", {
      method: "DELETE",
    });
    expect(response.status).toBe(204);
  });

  it("throws for a request without a recording, naming host and path only", async () => {
    await expect(transport.fetch("https://api.example.com/v1/items?secret=1")).rejects.toThrow(
      NoRecordingError,
    );
    await expect(transport.fetch("https://api.example.com/v1/items?secret=1")).rejects.toThrow(
      "no recording for GET api.example.com/v1/items",
    );
    await expect(
      transport.fetch("https://api.example.com/v1/items", { method: "POST", body: '{"a":2}' }),
    ).rejects.toThrow(NoRecordingError);
  });

  it("keeps text bodies as they are", () => {
    expect(canonicalBody("a=1&b=2")).toBe("a=1&b=2");
    expect(canonicalBody("")).toBeNull();
  });
});
