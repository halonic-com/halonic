// The fetch trap lives in @halonicjs/testing-contracts, whose code is
// measured in this package's run (its "measuredIn"), so its tests run here.
import { trapFetch } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";

/** A fetch that answers every request with "local", and the addresses it was asked for. */
function localFetch() {
  const asked: string[] = [];
  const fetch: typeof globalThis.fetch = async (input) => {
    asked.push(input instanceof Request ? input.url : String(input));
    return new Response("local");
  };
  return { fetch, asked };
}

verifies("contracts.connector-client", () => {
  it("refuses and records a request for another machine, written as text, a URL or a Request", async () => {
    const local = localFetch();
    const trap = trapFetch(local.fetch);
    const requests = [
      "https://gmail.googleapis.com/gmail/v1/users/me/messages",
      new URL("https://www.googleapis.com/drive/v3/files"),
      new Request("https://oauth2.googleapis.com/token", { method: "POST" }),
      "http://127.0.0.1.evil.test/",
      "not a url",
    ];
    for (const request of requests) await expect(trap.fetch(request)).rejects.toThrow();
    expect(trap.reached()).toEqual([
      "https://gmail.googleapis.com/gmail/v1/users/me/messages",
      "https://www.googleapis.com/drive/v3/files",
      "https://oauth2.googleapis.com/token",
      "http://127.0.0.1.evil.test/",
      "not a url",
    ]);
    expect(local.asked).toEqual([]);
  });

  it("lets a request to this machine through, unrecorded", async () => {
    const local = localFetch();
    const trap = trapFetch(local.fetch);
    for (const url of [
      "http://localhost:4100/mcp",
      "http://127.0.0.1:4100/",
      "http://[::1]:4100/",
    ]) {
      expect(await (await trap.fetch(url)).text()).toBe("local");
    }
    expect(trap.reached()).toEqual([]);
    expect(local.asked).toHaveLength(3);
  });
});
