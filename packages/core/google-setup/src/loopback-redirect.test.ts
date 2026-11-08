import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { loopbackRedirectUri } from "./loopback-redirect.ts";

verifies("google-setup.sign-in.loopback-redirect", () => {
  it("builds http://127.0.0.1 with the port and path", () => {
    expect(loopbackRedirectUri({ port: 8787, path: "/google/callback" })).toBe(
      "http://127.0.0.1:8787/google/callback",
    );
    expect(loopbackRedirectUri({ port: 1, path: "/" })).toBe("http://127.0.0.1:1/");
    expect(loopbackRedirectUri({ port: 65535, path: "/a-b.c_d~e" })).toBe(
      "http://127.0.0.1:65535/a-b.c_d~e",
    );
  });

  it.each([0, 65536, -1, 80.5, Number.NaN])("refuses port %s", (port) => {
    expect(() => loopbackRedirectUri({ port, path: "/callback" })).toThrow(RangeError);
  });

  it.each([
    "callback",
    "",
    "/callback?next=/evil",
    "/callback#fragment",
    "/callback?",
    "//evil.example.com/callback",
    "/a/../callback",
    "/call back",
    "/%2e%2e/callback",
    "/callback@evil.example.com",
  ])("refuses the path %j", (path) => {
    expect(() => loopbackRedirectUri({ port: 8787, path })).toThrow("no query string or fragment");
  });
});
