import { proxyFromEnv } from "@halonicjs/adapter-http-node";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { networkProblemOf } from "./doctor-network.ts";

verifies("cli.doctor-network", () => {
  it("names the variable and the scheme of a proxy that isn't http://", () => {
    expect(networkProblemOf(proxyFromEnv({ https_proxy: "socks5://proxy.corp:1080" }))).toEqual({
      problem: "proxy-not-http",
      variable: "https_proxy",
      scheme: "socks5",
    });
  });

  it("keeps the setting's reason for a proxy it can't use for another reason", () => {
    expect(networkProblemOf(proxyFromEnv({ HTTPS_PROXY: "proxy.corp:3128" }))).toEqual({
      problem: "proxy-unusable",
      variable: "HTTPS_PROXY",
      reason: "The proxy setting is not a URL. Halonic needs it as http://host:port.",
    });
  });

  it("finds nothing without a proxy, or with an http:// one", () => {
    expect(networkProblemOf(proxyFromEnv({}))).toBeNull();
    expect(networkProblemOf(proxyFromEnv({ HTTPS_PROXY: "http://proxy.corp:3128" }))).toBeNull();
  });
});
