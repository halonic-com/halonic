import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { writeReply } from "./node-exchange.ts";

verifies("harness-bridge.pass-through", () => {
  it("writes each repeated set-cookie header apart, not joined into one", async () => {
    const headers = new Headers();
    headers.append("set-cookie", "a=1; Path=/");
    headers.append("set-cookie", "b=2; Path=/");
    const server = createServer((_, response) => {
      void writeReply(new Response("ok", { headers }), response, new AbortController().signal);
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    try {
      const { port } = server.address() as AddressInfo;
      const reply = await fetch(`http://127.0.0.1:${port}/`);

      expect(reply.headers.getSetCookie()).toEqual(["a=1; Path=/", "b=2; Path=/"]);
      expect(await reply.text()).toBe("ok");
    } finally {
      server.closeAllConnections();
      server.close();
    }
  });
});
