import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { isNoCostOnThisMachine, isOnThisMachine, isPayPerUse } from "./provider-cost.ts";

function provider(
  baseUrl: string | undefined,
  fields: { type?: string; secret?: string; options?: Record<string, unknown> } = {},
) {
  return { type: "openai-compatible", baseUrl, options: {}, ...fields };
}

verifies("workspace.provider-cost", () => {
  describe("on this machine", () => {
    it("holds for loopback hosts in any spelling and for the test model", () => {
      for (const url of [
        "http://localhost:11434/v1",
        "http://LOCALHOST./",
        "http://127.1:11434",
        "http://2130706433",
        "http://127.255.0.9",
        "http://[::1]:8080",
        "http://user:pw@localhost",
      ]) {
        expect(isOnThisMachine(provider(url)), url).toBe(true);
      }
      expect(isOnThisMachine(provider(undefined, { type: "mock" }))).toBe(true);
    });

    it("fails closed for anything else", () => {
      for (const url of [
        "http://localhost.evil.example",
        "http://localhost@evil.example",
        "http://notlocalhost",
        "http://0.0.0.0",
        "http://192.168.1.20",
        "http://[::2]",
        "http://[::ffff:127.0.0.1]",
        "http://localhost:99999",
        "ftp://localhost",
        "localhost:11434",
      ]) {
        expect(isOnThisMachine(provider(url)), url).toBe(false);
      }
      expect(isOnThisMachine(provider(undefined, { type: "ollama" }))).toBe(false);
    });
  });

  describe("no cost on this machine", () => {
    const local = provider("http://localhost:11434/v1");

    it("holds without a key, a cloud model or a price", () => {
      expect(isNoCostOnThisMachine(local, { model: "llama3.2" })).toBe(true);
    });

    it("needs all of them", () => {
      expect(isNoCostOnThisMachine(local, { model: "gpt-oss:120b-cloud" })).toBe(false);
      expect(isNoCostOnThisMachine(local, { model: "Qwen-Cloud" })).toBe(false);
      expect(
        isNoCostOnThisMachine(local, { model: "llama3.2", price: { input: 0, output: 0 } }),
      ).toBe(false);
      expect(isNoCostOnThisMachine({ ...local, secret: "key" }, { model: "llama3.2" })).toBe(false);
      expect(
        isNoCostOnThisMachine(
          provider("http://localhost:1234", { options: { headers: { Authorization: "x" } } }),
          { model: "m" },
        ),
      ).toBe(false);
      expect(isNoCostOnThisMachine(provider("http://192.168.1.2"), { model: "m" })).toBe(false);
    });
  });

  describe("pay per use", () => {
    it("holds for a public host or no address", () => {
      expect(isPayPerUse(provider("https://api.anthropic.com/v1"))).toBe(true);
      expect(isPayPerUse(provider(undefined, { type: "anthropic" }))).toBe(true);
      expect(isPayPerUse(provider("http://172.32.0.1"))).toBe(true);
      expect(isPayPerUse(provider("http://169.254.1.1"))).toBe(true);
      expect(isPayPerUse(provider("http://0.0.0.0"))).toBe(true);
      expect(isPayPerUse(provider("http://[2001:db8::1]"))).toBe(true);
      expect(isPayPerUse(provider("not a url"))).toBe(true);
    });

    it("holds with a key, an auth header or a query string, even on a private host", () => {
      expect(isPayPerUse(provider("http://localhost:11434", { secret: "k" }))).toBe(true);
      expect(
        isPayPerUse(provider("http://nas", { options: { headers: { "X-Api-Key": "" } } })),
      ).toBe(true);
      expect(
        isPayPerUse(
          provider("http://nas", { options: { headers: { "Proxy-Authorization": "x" } } }),
        ),
      ).toBe(true);
      expect(isPayPerUse(provider("http://localhost:11434?key=x"))).toBe(true);
      expect(isPayPerUse(provider("http://localhost:11434/v1?"))).toBe(true);
    });

    it("doesn't hold for this machine, a private range or a single-label name without a key", () => {
      for (const url of [
        "http://localhost:11434/v1",
        "http://[::1]",
        "http://10.1.2.3",
        "http://172.16.0.1",
        "http://172.31.255.255",
        "http://192.168.1.20:1234/v1",
        "http://[fd00::1]",
        "http://[fe80::1]",
        "http://nas:8000",
        "http://localhost/v1#frag?x",
      ]) {
        expect(isPayPerUse(provider(url)), url).toBe(false);
      }
      expect(isPayPerUse(provider(undefined, { type: "mock" }))).toBe(false);
      expect(
        isPayPerUse(provider("http://nas", { secret: "", options: { headers: { Accept: "x" } } })),
      ).toBe(false);
    });
  });
});
