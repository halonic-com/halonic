import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { localAddress } from "./provider-origin.ts";

function file(type: string, baseUrl?: string, secret?: string) {
  return {
    type,
    options: {},
    ...(baseUrl === undefined ? {} : { baseUrl }),
    ...(secret === undefined ? {} : { secret }),
  };
}

verifies("engine.llm-event-address", () => {
  it("names a provider on this computer by its host and port", () => {
    expect(localAddress(file("ollama"))).toBe("localhost:11434");
    expect(localAddress(file("lmstudio"))).toBe("localhost:1234");
    expect(localAddress(file("openai-compatible", "http://127.0.0.1:8080/v1"))).toBe(
      "127.0.0.1:8080",
    );
    expect(localAddress(file("openai-compatible", "http://[::1]:8080/v1"))).toBe("[::1]:8080");
  });

  it("writes the scheme's own port when the address leaves it out", () => {
    expect(localAddress(file("openai-compatible", "http://localhost/v1"))).toBe("localhost:80");
    expect(localAddress(file("openai-compatible", "https://localhost/v1"))).toBe("localhost:443");
  });

  it("keeps no user name, path or query", () => {
    const address = localAddress(
      file("openai-compatible", "http://ann@127.0.0.1:8080/v1/private?page=2"),
    );

    expect(address).toBe("127.0.0.1:8080");
  });

  it("has none for a provider away from this computer, or for the test model", () => {
    expect(localAddress(file("anthropic", undefined, "anthropic-key"))).toBeUndefined();
    expect(localAddress(file("openai"))).toBeUndefined();
    expect(localAddress(file("ollama", "http://192.168.1.20:11434/v1"))).toBeUndefined();
    expect(localAddress(file("ollama", "http://localhost.evil.example/v1"))).toBeUndefined();
    expect(localAddress(file("openai-compatible"))).toBeUndefined();
    expect(localAddress(file("mock"))).toBeUndefined();
  });

  it("names it on a webview without URL.parse, as Studio's oldest", () => {
    const parse = Object.getOwnPropertyDescriptor(URL, "parse");
    Reflect.deleteProperty(URL, "parse");
    try {
      expect("parse" in URL).toBe(false);
      expect(localAddress(file("ollama"))).toBe("localhost:11434");
      expect(localAddress(file("openai-compatible", "http://localhost/v1"))).toBe("localhost:80");
    } finally {
      if (parse !== undefined) {
        Object.defineProperty(URL, "parse", parse);
      }
    }
  });
});
