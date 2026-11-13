import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { testServer } from "./test-server.ts";

const host = "halonic.acme.example";

describe("hello", () => {
  verifies("server.hello", () => {
    it("answers exactly three keys without a session, even when a password is set", async () => {
      const server = testServer({
        passwordHash: "hash",
        config: { version: "1.2.3", minAppVersion: "1.0.0" },
      });
      const response = await server.handle(
        new Request(`https://${host}/api/hello`, { headers: { host } }),
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        product: "halonic",
        version: "1.2.3",
        minAppVersion: "1.0.0",
      });
    });

    it("is refused on a foreign Host by a server with no password", async () => {
      const server = testServer({ passwordHash: null });
      const response = await server.handle(
        new Request("http://evil.example/api/hello", { headers: { host: "evil.example" } }),
      );
      expect(response.status).toBe(421);
    });
  });
});
