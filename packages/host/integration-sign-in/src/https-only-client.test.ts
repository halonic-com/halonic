import type { HttpClient } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { createHttpsOnlyClient } from "./https-only-client.ts";

function recordingClient(): HttpClient & { readonly urls: string[] } {
  const urls: string[] = [];
  return {
    urls,
    async fetch(url) {
      urls.push(url);
      return Response.json({});
    },
  };
}

verifies("integration-sign-in.https-only", () => {
  it("passes an https request on", async () => {
    const inner = recordingClient();

    await createHttpsOnlyClient(inner).fetch("https://auth.example.com/token", { method: "POST" });

    expect(inner.urls).toEqual(["https://auth.example.com/token"]);
  });

  it.each([
    "http://auth.example.com/token",
    "http://127.0.0.1:8787/token",
    "ftp://auth.example.com/token",
    "not a url",
  ])("refuses %s without calling the wrapped client", async (url) => {
    const inner = recordingClient();

    await expect(createHttpsOnlyClient(inner).fetch(url)).rejects.toThrow(TypeError);

    expect(inner.urls).toEqual([]);
  });
});
