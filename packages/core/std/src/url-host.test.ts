import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { urlHost } from "./url-host.ts";

const ipv4 = (...octets: number[]) => ({ kind: "ipv4", octets });
const domain = (name: string) => ({ kind: "domain", name });

verifies("std.url-host", () => {
  it("reads a domain without its case, trailing dot, port, path or user info", () => {
    expect(urlHost("http://LOCALHOST.:11434")).toEqual(domain("localhost"));
    expect(urlHost("https://API.Anthropic.com/v1?x=1#y")).toEqual(domain("api.anthropic.com"));
    expect(urlHost("http://localhost@evil.example")).toEqual(domain("evil.example"));
    expect(urlHost("http://a:b@c@evil.example:80/")).toEqual(domain("evil.example"));
    expect(urlHost("  http://nas  ")).toEqual(domain("nas"));
    expect(urlHost("http://localhost.evil.example")).toEqual(domain("localhost.evil.example"));
  });

  it("reads the number forms of an IPv4 address", () => {
    expect(urlHost("http://127.0.0.1")).toEqual(ipv4(127, 0, 0, 1));
    expect(urlHost("http://127.1:8080")).toEqual(ipv4(127, 0, 0, 1));
    expect(urlHost("http://2130706433")).toEqual(ipv4(127, 0, 0, 1));
    expect(urlHost("http://0x7f.0.0.1")).toEqual(ipv4(127, 0, 0, 1));
    expect(urlHost("http://0177.0.0.1")).toEqual(ipv4(127, 0, 0, 1));
    expect(urlHost("http://0x7f000001")).toEqual(ipv4(127, 0, 0, 1));
    expect(urlHost("http://192.168.1.20:8000")).toEqual(ipv4(192, 168, 1, 20));
    expect(urlHost("http://0x")).toEqual(ipv4(0, 0, 0, 0));
    expect(urlHost("http://0.0.0.0")).toEqual(ipv4(0, 0, 0, 0));
  });

  it("reads an IPv6 address in brackets", () => {
    expect(urlHost("http://[::1]:8080")).toEqual({
      kind: "ipv6",
      groups: [0, 0, 0, 0, 0, 0, 0, 1],
    });
    expect(urlHost("http://[fe80::1]")).toEqual({
      kind: "ipv6",
      groups: [0xfe80, 0, 0, 0, 0, 0, 0, 1],
    });
    expect(urlHost("http://[::ffff:127.0.0.1]")).toEqual({
      kind: "ipv6",
      groups: [0, 0, 0, 0, 0, 0xffff, 0x7f00, 1],
    });
    expect(urlHost("http://[1:2:3:4:5:6:7:8]")).toEqual({
      kind: "ipv6",
      groups: [1, 2, 3, 4, 5, 6, 7, 8],
    });
    expect(urlHost("http://[::]")).toEqual({ kind: "ipv6", groups: [0, 0, 0, 0, 0, 0, 0, 0] });
  });

  it("gives nothing for what it does not fully understand", () => {
    for (const text of [
      "ftp://x",
      "http://",
      "localhost:11434",
      "http://999.1.1.1",
      "http://1.2.3.4.5",
      "http://4294967296",
      "http://1.2.3.0x1ffff",
      "http://a b",
      "http://a%2eb",
      "http://a..b",
      "http://[::1",
      "http://[::1]x",
      "http://[1:2:3]",
      "http://[1::2::3]",
      "http://[1:2:3:4:5:6:7:8:9]",
      "http://[1:2:3:4:5:6:7::8]",
      "http://[::1.2.3.256]",
      "http://[::zz]",
      "http://host:port",
    ]) {
      expect(urlHost(text), text).toBeUndefined();
    }
  });

  it("agrees with the platform's URL on the hosts it reads", () => {
    for (const text of [
      "http://LOCALHOST.:11434",
      "http://127.1:8080",
      "http://2130706433",
      "http://0x7f.0.0.1",
      "http://0177.0.0.1",
      "http://localhost@evil.example",
      "http://[::1]:8080",
      "http://[::ffff:127.0.0.1]",
      "http://192.168.1.20:8000",
      "https://api.anthropic.com/v1",
    ]) {
      // Node writes the host in one canonical form; reading that gives the same host.
      const canonical = new URL(text).hostname.replace(/\.$/, "");
      expect(urlHost(text), text).toEqual(urlHost(`http://${canonical}`));
      expect(urlHost(text), text).toBeDefined();
    }
  });
});
