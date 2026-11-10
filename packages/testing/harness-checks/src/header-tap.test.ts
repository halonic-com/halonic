import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { type HeaderTap, openHeaderTap, pathWithoutQuery } from "./header-tap.ts";

/** A made-up sign-in: not a real token. */
const signIn = "Bearer made-up-sign-in-for-the-tap-test";

/** What the stand-in bridge received. */
interface Received {
  method: string | undefined;
  url: string | undefined;
  headers: IncomingHttpHeaders;
  body: string;
}

const open: { close(): Promise<void> }[] = [];

afterEach(async () => {
  for (const item of open.splice(0).reverse()) await item.close();
});

/** A stand-in for the bridge that answers in three chunks and notes what it got. */
async function fakeBridge(status = 200): Promise<{ url: string; received: Received[] }> {
  const received: Received[] = [];
  const server: Server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += String(chunk);
    received.push({ method: request.method, url: request.url, headers: request.headers, body });
    response.writeHead(status, { "content-type": "text/event-stream" });
    response.write("event: one\n\n");
    response.write("event: two\n\n");
    response.end("event: three\n\n");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  open.push({ close: () => new Promise((resolve) => server.close(() => resolve())) });
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, received };
}

async function tapFor(bridgeUrl: string): Promise<HeaderTap> {
  const tap = await openHeaderTap({ bridgeUrl, watched: ["Authorization", "x-api-key"] });
  open.push(tap);
  return tap;
}

verifies("harness-checks.header-tap", () => {
  it("passes a request and its streamed answer on unchanged", async () => {
    const bridge = await fakeBridge();
    const tap = await tapFor(bridge.url);

    const answer = await fetch(`${tap.url}/v1/messages?beta=true`, {
      method: "POST",
      headers: { authorization: signIn, "x-halonic-run-token": "made-up-run-token" },
      body: '{"model":"m"}',
    });

    expect(await answer.text()).toBe("event: one\n\nevent: two\n\nevent: three\n\n");
    expect(bridge.received).toEqual([
      expect.objectContaining({
        method: "POST",
        url: "/v1/messages?beta=true",
        body: '{"model":"m"}',
        headers: expect.objectContaining({
          authorization: signIn,
          "x-halonic-run-token": "made-up-run-token",
        }),
      }),
    ]);
  });

  it("keeps the method, the path, the bridge's status and present or absent", async () => {
    const tap = await tapFor((await fakeBridge(401)).url);

    await (
      await fetch(`${tap.url}/v1/messages?beta=true`, {
        method: "POST",
        headers: { authorization: signIn },
        body: "{}",
      })
    ).text();

    expect(tap.requests).toEqual([
      {
        method: "POST",
        path: "/v1/messages",
        headers: { authorization: "present", "x-api-key": "absent" },
        status: 401,
      },
    ]);
  });

  it("keeps no header value", async () => {
    const tap = await tapFor((await fakeBridge()).url);

    await (await fetch(`${tap.url}/v1/messages`, { headers: { authorization: signIn } })).text();

    expect(JSON.stringify(tap.requests)).not.toContain("made-up-sign-in");
  });

  it("answers 502 and notes no status when the bridge is gone", async () => {
    const bridge = await fakeBridge();
    const tap = await tapFor(bridge.url);
    await open.shift()?.close();

    const answer = await fetch(`${tap.url}/v1/messages`, { method: "POST", body: "{}" });

    expect(answer.status).toBe(502);
    expect(tap.requests[0]?.status).toBeNull();
  });

  it("drops the query and the fragment from a path", () => {
    expect(pathWithoutQuery("/v1/messages?beta=true")).toBe("/v1/messages");
    expect(pathWithoutQuery("/v1/responses#x")).toBe("/v1/responses");
    expect(pathWithoutQuery("/mcp")).toBe("/mcp");
  });
});
