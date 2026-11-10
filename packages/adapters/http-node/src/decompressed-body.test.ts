import { brotliCompressSync, deflateSync, gzipSync, zstdCompressSync } from "node:zlib";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { type LoopbackServer, startLoopbackServer } from "./loopback-server.test-helper.ts";
import { createNodeHttpClient } from "./node-http-client.ts";

const text = "an echoed header: Bearer example-key";

const encoders: Readonly<Record<string, (input: Buffer) => Buffer>> = {
  gzip: gzipSync,
  deflate: deflateSync,
  br: brotliCompressSync,
  zstd: zstdCompressSync,
  "gzip, br": (input) => brotliCompressSync(gzipSync(input)),
};

let server: LoopbackServer;

beforeEach(async () => {
  server = await startLoopbackServer((request, response) => {
    const encoding = String(request.headers["x-encoding"]);
    // `x-raw` sends the plain text while claiming the encoding, as a broken server would.
    const encode = request.headers["x-raw"] === undefined ? encoders[encoding] : undefined;
    const body = encode === undefined ? Buffer.from(text) : encode(Buffer.from(text));
    response
      .writeHead(200, { "content-encoding": encoding, "content-length": body.length })
      .end(body);
  });
});

afterEach(async () => {
  await server.close();
});

const http = createNodeHttpClient({ hostClass: () => "loopback" });

verifies("http-node.decompressed-body", () => {
  it.each(Object.keys(encoders))("decodes a %s body and drops both headers", async (encoding) => {
    const response = await http.fetch(`http://127.0.0.1:${server.port}/`, {
      headers: { "x-encoding": encoding },
    });
    expect(await response.text()).toBe(text);
    expect(response.headers.has("content-encoding")).toBe(false);
    expect(response.headers.has("content-length")).toBe(false);
  });

  it("passes an identity body through with its length", async () => {
    const response = await http.fetch(`http://127.0.0.1:${server.port}/`, {
      headers: { "x-encoding": "identity" },
    });
    expect(await response.text()).toBe(text);
    expect(response.headers.get("content-length")).toBe(String(text.length));
  });

  it("fails rather than pass on an encoding it can't decode", async () => {
    await expect(
      http.fetch(`http://127.0.0.1:${server.port}/`, { headers: { "x-encoding": "compress" } }),
    ).rejects.toThrow("content-encoding the transport can't undo: compress");
  });

  it("fails the body when the bytes don't match their encoding", async () => {
    const response = await http.fetch(`http://127.0.0.1:${server.port}/`, {
      headers: { "x-encoding": "gzip", "x-raw": "1" },
    });
    await expect(response.text()).rejects.toThrow();
  });
});
