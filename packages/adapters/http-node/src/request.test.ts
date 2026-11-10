import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  fakeResolver,
  type LoopbackServer,
  startLoopbackServer,
} from "./loopback-server.test-helper.ts";
import { createNodeHttpClient } from "./node-http-client.ts";

let server: LoopbackServer;
let hold: (() => void) | undefined;

beforeEach(async () => {
  server = await startLoopbackServer((request, response) => {
    if (request.url === "/empty") {
      response.writeHead(204).end();
      return;
    }
    if (request.url === "/slow") {
      hold = () => response.end("late");
      return;
    }
    response
      .writeHead(201, "Made", [
        ["set-cookie", "a=1"],
        ["set-cookie", "b=2"],
      ])
      .end("made");
  });
});

afterEach(async () => {
  hold?.();
  hold = undefined;
  await server.close();
});

const http = createNodeHttpClient({ hostClass: () => "loopback" });
const at = (path: string) => `http://127.0.0.1:${server.port}${path}`;

describe("the Node transport as an HttpClient", () => {
  it("sends a form body with the content-type and length fetch would", async () => {
    await http.fetch(at("/form?x=1"), {
      method: "post",
      body: new URLSearchParams({ name: "acme" }),
    });
    const [received] = server.received;
    expect(received).toMatchObject({ method: "POST", url: "/form?x=1", body: "name=acme" });
    expect(received?.headers["content-type"]).toBe(
      "application/x-www-form-urlencoded;charset=UTF-8",
    );
    expect(received?.headers["content-length"]).toBe("9");
  });

  it("sends the URL's host, not one the caller set", async () => {
    const named = createNodeHttpClient({
      hostClass: () => "loopback",
      resolve: fakeResolver({ "api.example.test": [["127.0.0.1"]] }).resolve,
    });
    await named.fetch(`http://api.example.test:${server.port}/`, {
      headers: { host: "other.example.test" },
    });
    expect(server.received[0]?.headers.host).toBe(`api.example.test:${server.port}`);
  });

  it("sets the framing itself and drops the caller's hop-by-hop headers", async () => {
    await http.fetch(at("/"), {
      method: "POST",
      body: "abc",
      headers: {
        connection: "upgrade",
        "keep-alive": "timeout=600",
        "transfer-encoding": "chunked",
        te: "trailers",
        upgrade: "websocket",
        expect: "100-continue",
        "content-length": "999",
      },
    });
    const headers = server.received[0]?.headers ?? {};
    expect(headers["content-length"]).toBe("3");
    for (const name of ["keep-alive", "transfer-encoding", "te", "upgrade", "expect"]) {
      expect(headers[name]).toBeUndefined();
    }
    expect(headers.connection).not.toBe("upgrade");
    expect(server.received[0]?.body).toBe("abc");
  });

  it("keeps the status text and every repeated header", async () => {
    const response = await http.fetch(at("/"));
    expect([response.status, response.statusText]).toEqual([201, "Made"]);
    expect(response.headers.getSetCookie()).toEqual(["a=1", "b=2"]);
  });

  it("gives no body for 204 and for HEAD", async () => {
    expect((await http.fetch(at("/empty"))).body).toBeNull();
    expect((await http.fetch(at("/"), { method: "HEAD" })).body).toBeNull();
  });

  it("refuses a body on GET, as fetch does", async () => {
    await expect(http.fetch(at("/"), { body: "x" })).rejects.toThrow(TypeError);
    expect(server.connections()).toBe(0);
  });

  it("sends nothing when the signal is already aborted", async () => {
    const signal = AbortSignal.abort(new Error("stopped by the caller"));
    await expect(http.fetch(at("/"), { signal })).rejects.toThrow("stopped by the caller");
    expect(server.connections()).toBe(0);
  });

  it("stops waiting when the signal aborts during the request", async () => {
    const controller = new AbortController();
    const request = http.fetch(at("/slow"), { signal: controller.signal });
    await expect.poll(() => server.received.length).toBe(1);
    controller.abort();
    await expect(request).rejects.toThrow();
  });
});
