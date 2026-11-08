import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { isLocalAddress, isLoopback } from "./local-address.ts";

const hostname = (url: string) => new URL(url).hostname;

verifies("integration-kit.local-http-hosts", () => {
  it.each([
    "http://localhost:3000/",
    "http://127.0.0.1/",
    "http://127.8.9.10/",
    "http://0x7f.1/",
    "http://[::1]:8080/",
  ])("counts %s as this machine", (url) => {
    expect(isLoopback(hostname(url))).toBe(true);
    expect(isLocalAddress(hostname(url))).toBe(true);
  });

  it.each([
    "http://10.0.0.2/",
    "http://172.16.0.1/",
    "http://172.31.255.255/",
    "http://192.168.1.5/",
    "http://[fd00::1]/",
    "http://[fc12:3456::1]/",
  ])("counts %s as the local network, not this machine", (url) => {
    expect(isLoopback(hostname(url))).toBe(false);
    expect(isLocalAddress(hostname(url))).toBe(true);
  });

  it.each([
    "http://169.254.169.254/",
    "http://172.32.0.1/",
    "http://8.8.8.8/",
    "http://[fc::1]/",
    "http://[fe80::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://localhost.evil.example/",
    "http://my-nas.local/",
  ])("doesn't count %s", (url) => {
    expect(isLocalAddress(hostname(url))).toBe(false);
  });
});
