import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { signInPlace } from "./sign-in-place.ts";

describe("sign-in place", () => {
  verifies("server.google-setup-list", () => {
    it.each([
      ["127.0.0.1", "http://localhost:4747", "here"],
      ["127.0.0.1", "http://127.0.0.1:4747", "here"],
      ["::1", "http://[::1]:4747", "here"],
      ["::ffff:127.0.0.1", "localhost:4747", "here"],
      ["127.0.0.1", "LOCALHOST", "here"],
      // A tunnel or proxy reaches the server from loopback, under its public name.
      ["127.0.0.1", "https://studio.example.net", "elsewhere"],
      ["127.0.0.1", "studio.example.net:443", "elsewhere"],
      ["127.0.0.1", "http://localhost.example.net", "elsewhere"],
      ["127.0.0.1", "http://evillocalhost", "elsewhere"],
      ["127.0.0.1", "null", "elsewhere"],
      ["127.0.0.1", "http://localhost@evil.example", "elsewhere"],
      ["127.0.0.1", "", "elsewhere"],
      ["127.0.0.1", undefined, "elsewhere"],
      ["127.0.0.1", null, "elsewhere"],
      // Another computer that names the server `localhost` in a header.
      ["192.168.1.20", "http://localhost:4747", "elsewhere"],
      ["::ffff:192.168.1.20", "localhost", "elsewhere"],
      [undefined, "http://localhost:4747", "elsewhere"],
    ] as const)("%s with origin %s answers %s", (address, origin, place) => {
      expect(signInPlace(address, origin)).toBe(place);
    });
  });
});
