import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { isAllowedWebLink } from "./index.ts";

const origin = "https://paperclip.acme.test";

verifies("ports.team-status", () => {
  describe("isAllowedWebLink", () => {
    it.each([
      "https://github.com/acme/app/pull/12",
      "https://github.com/acme-co/app.web/pull/5641",
      "https://paperclip.acme.test/HAL/issues/HAL-1",
      "https://paperclip.acme.test",
    ])("passes %s", (link) => {
      expect(isAllowedWebLink(link, origin)).toBe(true);
    });

    it.each([
      ["plain http", "http://github.com/acme/app/pull/12"],
      ["a user name", "https://me@github.com/acme/app/pull/12"],
      ["a user name and password", "https://me:pw@github.com/acme/app/pull/12"],
      ["a look-alike host", "https://github.com.evil.io/acme/app/pull/12"],
      ["GitHub in the path", "https://evil.io/github.com/acme/app/pull/12"],
      ["an issue, not a pull request", "https://github.com/acme/app/issues/12"],
      ["more after the number", "https://github.com/acme/app/pull/12/files"],
      ["a query", "https://github.com/acme/app/pull/12?x=1"],
      ["a dot-dot owner", "https://github.com/../app/pull/12"],
      ["upper case", "https://GitHub.com/acme/app/pull/12"],
      ["a port on GitHub", "https://github.com:443/acme/app/pull/12"],
      ["the origin on another port", "https://paperclip.acme.test:8443/HAL/issues/HAL-1"],
      ["a host that starts like the origin", "https://paperclip.acme.test.evil.io/"],
      ["user info before the origin", "https://me@paperclip.acme.test/"],
      ["a backslash after the origin", "https://paperclip.acme.test\\@evil.io/"],
      ["a newline", "https://github.com/acme/app/pull/12\n"],
      ["a script", "javascript:alert(1)"],
    ])("refuses %s", (_case, link) => {
      expect(isAllowedWebLink(link, origin)).toBe(false);
    });

    it("passes no Paperclip page without a valid connection origin", () => {
      const page = "https://paperclip.acme.test/HAL/issues/HAL-1";
      expect(isAllowedWebLink(page, undefined)).toBe(false);
      expect(isAllowedWebLink(page, "http://paperclip.acme.test")).toBe(false);
      expect(
        isAllowedWebLink("https://paperclip.acme.test/x", "https://paperclip.acme.test/"),
      ).toBe(false);
    });
  });
});
