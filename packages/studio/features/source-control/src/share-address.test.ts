import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { isShareAddress } from "./share-address.ts";

verifies("source-control.share-address", () => {
  describe("isShareAddress", () => {
    it.each([
      "https://github.com/acme/agents.git",
      "https://git.acme.example:8443/acme/agents.git",
      "ssh://git@git.acme.example/acme/agents.git",
      "git@github.com:acme/agents.git",
    ])("accepts %s", (address) => {
      expect(isShareAddress(address)).toBe(true);
    });

    it.each([
      "",
      "github.com/acme/agents.git",
      "http://github.com/acme/agents.git",
      "file:///srv/agents.git",
      "/srv/agents.git",
      "../agents.git",
      "ext::sh -c touch",
      "-oProxyCommand=x",
      "https://",
      "https://-evil.example/a.git",
      "ssh://-oProxyCommand=x/a.git",
      "https://git%2Dhost.example/a.git",
      "https://github.com/acme agents.git",
      "git@github.com:",
      "-git@github.com:acme/a.git",
      "git@github.com:acme//a.git",
    ])("refuses %j", (address) => {
      expect(isShareAddress(address)).toBe(false);
    });
  });
});
