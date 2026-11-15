import { describe, expect, it } from "vitest";
import { defaultLocalAddress, defaultLocalBaseUrl } from "./index.ts";

describe("default local addresses", () => {
  it("gives the servers' own addresses, and none for a type without one", () => {
    expect(defaultLocalAddress("lmstudio")).toBe("localhost:1234");
    expect(defaultLocalBaseUrl("ollama")).toBe("http://localhost:11434/v1");
    expect(defaultLocalBaseUrl("anthropic")).toBeUndefined();
    expect(defaultLocalAddress("constructor")).toBeUndefined();
  });
});
