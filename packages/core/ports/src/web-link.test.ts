import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { isAllowedWebLink } from "./index.ts";

/** Checks a link against a connection, both parsed as an opener parses them. */
function allowed(link: string, connection = "https://paperclip.acme.test"): boolean {
  return isAllowedWebLink(new URL(link), new URL(connection));
}

verifies("ports.web-link", () => {
  it("lets a GitHub pull request page and the connection's own pages open", () => {
    expect(allowed("https://github.com/acme/rockets/pull/12")).toBe(true);
    expect(allowed("https://github.com/acme/rockets.js/pull/7")).toBe(true);
    expect(allowed("https://paperclip.acme.test/ACME/issues/ACME-4")).toBe(true);
    expect(
      allowed("https://paperclip.acme.test:8443/ACME", "https://paperclip.acme.test:8443"),
    ).toBe(true);
  });

  it.each([
    ["plain http", "http://github.com/acme/rockets/pull/12"],
    ["a user name", "https://someone@github.com/acme/rockets/pull/12"],
    [
      "a longer host ending in github.com's name",
      "https://github.com.evil.io/acme/rockets/pull/12",
    ],
    ["github.com in the path", "https://evil.io/github.com/acme/rockets/pull/12"],
    ["a GitHub page that isn't a pull request", "https://github.com/acme/rockets/settings"],
    ["a pull request's files tab", "https://github.com/acme/rockets/pull/12/files"],
    ["a pull request number that isn't a number", "https://github.com/acme/rockets/pull/12a"],
    ["an encoded slash", "https://github.com/acme%2Frockets/x/pull/12"],
    ["GitHub on another port", "https://github.com:8443/acme/rockets/pull/12"],
    ["the connection's host on another port", "https://paperclip.acme.test:8443/ACME"],
    ["the connection's host over http", "http://paperclip.acme.test/ACME"],
    ["a script", "javascript:alert(1)"],
  ])("refuses %s", (_case, link) => {
    expect(allowed(link)).toBe(false);
  });

  it("refuses a link with a user name and password", () => {
    const link = new URL("https://github.com/acme/rockets/pull/12");
    link.username = "someone";
    link.password = "made-up";

    expect(isAllowedWebLink(link, new URL("https://paperclip.acme.test"))).toBe(false);
  });

  it("refuses the connection's own pages when the connection itself is plain http", () => {
    expect(allowed("http://paperclip.acme.test/ACME", "http://paperclip.acme.test")).toBe(false);
  });
});
