import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { WorkspaceNoLimit } from "./workspace-no-limit.ts";

function storage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

verifies("models.budget-step.no-limit-remembered", () => {
  it("remembers per workspace, provider and host, and again in a new window", () => {
    const shared = storage();
    new WorkspaceNoLimit(shared, "/work/acme").remember("anthropic", "api.anthropic.com");

    const again = new WorkspaceNoLimit(shared, "/work/acme");
    expect(again.remembered("anthropic", "api.anthropic.com")).toBe(true);
    expect(again.remembered("anthropic", "proxy.example.com")).toBe(false);
    expect(again.remembered("openai", "api.anthropic.com")).toBe(false);
    expect(
      new WorkspaceNoLimit(shared, "/work/beta").remembered("anthropic", "api.anthropic.com"),
    ).toBe(false);
  });

  it("keeps the answer for the session when storage refuses", () => {
    const refusing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("full");
      },
    };
    const memory = new WorkspaceNoLimit(refusing, "/work/acme");
    expect(memory.remembered("a", "h")).toBe(false);
    memory.remember("a", "h");
    expect(memory.remembered("a", "h")).toBe(true);
  });

  it("remembers for the session without storage", () => {
    const memory = new WorkspaceNoLimit(undefined, "/work/acme");
    memory.remember("a", "h");
    expect(memory.remembered("a", "h")).toBe(true);
    expect(memory.remembered("a", "other")).toBe(false);
  });
});
