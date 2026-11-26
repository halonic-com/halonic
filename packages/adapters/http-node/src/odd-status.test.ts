import { type AddressInfo, createServer, type Server } from "node:net";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { createNodeHttpClient } from "./node-http-client.ts";

let server: Server | undefined;

afterEach(async () => {
  await new Promise<void>((resolve) => server?.close(() => resolve()) ?? resolve());
  server = undefined;
});

/**
 * Starts a raw TCP server that answers every request with `statusLine` and the
 * body `no`. `node:http` won't send such a status line itself.
 */
async function answerWith(statusLine: Buffer): Promise<string> {
  server = createServer((socket) => {
    socket.once("data", () => {
      socket.end(
        Buffer.concat([
          statusLine,
          Buffer.from("\r\ncontent-length: 2\r\nconnection: close\r\n\r\nno"),
        ]),
      );
    });
  });
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}/`;
}

const http = createNodeHttpClient({ hostClass: () => "loopback" });

verifies("http-node.odd-status", () => {
  it("answers a status above 599 as the global fetch does", async () => {
    const response = await http.fetch(await answerWith(Buffer.from("HTTP/1.1 600 Busy")));

    expect(response.status).toBe(600);
    expect(response.ok).toBe(false);
    expect(response.statusText).toBe("Busy");
    expect(await response.text()).toBe("no");
  });

  it("refuses a 101 without an upgrade, as the global fetch does", async () => {
    const url = await answerWith(Buffer.from("HTTP/1.1 101 Switching"));

    await expect(http.fetch(url)).rejects.toThrow(/status 101/);
  });

  it("refuses a status below 100, as the global fetch does", async () => {
    const url = await answerWith(Buffer.from("HTTP/1.1 099 Odd"));

    await expect(http.fetch(url)).rejects.toThrow(/status 99/);
  });

  it("leaves out a status text with a control character", async () => {
    const statusLine = Buffer.from([...Buffer.from("HTTP/1.1 503 O"), 0x01, 0x4b]);
    const response = await http.fetch(await answerWith(statusLine));

    expect(response.status).toBe(503);
    expect(response.statusText).toBe("");
  });

  it("keeps a valid status text, Latin-1 included", async () => {
    const statusLine = Buffer.from([...Buffer.from("HTTP/1.1 503 Busy "), 0xe9]);
    const response = await http.fetch(await answerWith(statusLine));

    expect(response.status).toBe(503);
    expect(response.statusText).toBe("Busy é");
  });
});
