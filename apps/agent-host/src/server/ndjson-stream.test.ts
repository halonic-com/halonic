import { createServer, type IncomingMessage, request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { maxUnsentBytes, type NdjsonStream, startNdjsonStream } from "./ndjson-stream.ts";

let server: Server | undefined;

afterEach(async () => {
  server?.closeAllConnections();
  await new Promise((resolve) => server?.close(resolve));
  server = undefined;
});

/** Serves one stream and opens it, giving the test both ends. */
async function openStream(): Promise<{ stream: NdjsonStream; answer: IncomingMessage }> {
  let stream: NdjsonStream | undefined;
  server = createServer((_request, response) => {
    stream = startNdjsonStream(response);
  });
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const answer = await new Promise<IncomingMessage>((resolve, reject) => {
    request({ host: "127.0.0.1", port }, resolve).on("error", reject).end();
  });
  if (stream === undefined) throw new Error("the server didn't start the stream");
  return { stream, answer };
}

/** Whether the promise has settled by the time the event loop has turned once. */
async function hasSettled(promise: Promise<unknown>): Promise<boolean> {
  let settled = false;
  void promise.then(() => {
    settled = true;
  });
  await new Promise((resolve) => setImmediate(resolve));
  return settled;
}

describe("startNdjsonStream", () => {
  it("sends each value as a line until it ends", async () => {
    const { stream, answer } = await openStream();
    expect(answer.headers["content-type"]).toBe("application/x-ndjson; charset=utf-8");
    stream.send({ kind: "network", host: "example.com", port: 443 });
    stream.send("second");
    stream.end();
    stream.end();
    stream.send("after the end");
    let body = "";
    for await (const chunk of answer) body += String(chunk);
    expect(body).toBe('{"kind":"network","host":"example.com","port":443}\n"second"\n');
    await stream.ended;
  });

  it("ends when the caller goes away", async () => {
    const { stream, answer } = await openStream();
    answer.destroy();
    await expect(stream.ended).resolves.toBeUndefined();
  });

  it("ends, and drops what waits, when the caller stops reading", async () => {
    const { stream, answer } = await openStream();
    answer.pause();
    let received = 0;
    answer.on("data", (chunk: Buffer) => {
      received += chunk.length;
    });
    const cutOff = new Promise((resolve) => answer.on("aborted", resolve));

    // Far more than the limit, in lines of 64 KiB, letting the sockets fill between them.
    const line = "x".repeat(64 * 1024);
    let sent = 0;
    while (sent < 16 * maxUnsentBytes && !(await hasSettled(stream.ended))) {
      stream.send(line);
      sent += line.length;
    }
    await stream.ended;
    expect(sent).toBeLessThan(16 * maxUnsentBytes);

    answer.resume();
    await cutOff;
    expect(received).toBeLessThan(sent);
  });
});
