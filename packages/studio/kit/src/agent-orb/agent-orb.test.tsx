// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { render, unmountAll } from "../test/render.tsx";
import { AgentOrb, type AgentOrbProps, characterPairOf } from "./agent-orb.tsx";

afterEach(() => {
  unmountAll();
});

const orbOf = (props: AgentOrbProps) =>
  render(<AgentOrb {...props} />).container.firstElementChild as HTMLElement;

verifies("kit.agent-orb", () => {
  it("is hidden from screen readers and picks the same theme pair for the same id", () => {
    const first = orbOf({ agentId: "triage", size: 16 });
    const second = orbOf({ agentId: "triage", size: 64 });
    expect(first.getAttribute("aria-hidden")).toBe("true");
    expect(first.classList).toContain("agent-orb");
    expect(first.style.getPropertyValue("--orb-a")).toMatch(/^var\(--character-[1-5]a\)$/);
    expect(first.style.getPropertyValue("--orb-a")).toBe(second.style.getPropertyValue("--orb-a"));
    expect(first.style.getPropertyValue("--orb-b")).toBe(second.style.getPropertyValue("--orb-b"));
  });

  it("spreads ids over all five pairs", () => {
    const ids = Array.from({ length: 20 }, (_, index) => `agent-${index + 1}`);
    const pairs = new Set(ids.map((id) => characterPairOf(id)[0]));
    expect(pairs.size).toBe(5);
  });

  it("uses the agent's own colours, highlight then edge", () => {
    const orb = orbOf({ agentId: "clerk", colors: ["#3B82F6", "#8B5CF6"], size: 24 });
    expect(orb.style.getPropertyValue("--orb-a")).toBe("#3B82F6");
    expect(orb.style.getPropertyValue("--orb-b")).toBe("#8B5CF6");
  });

  it("names its box size and state, idle by default", () => {
    const idle = orbOf({ agentId: "triage", size: 24 });
    expect(idle.dataset["size"]).toBe("24");
    expect(idle.dataset["state"]).toBe("idle");
    expect(orbOf({ agentId: "triage", size: 24, state: "think" }).dataset["state"]).toBe("think");
  });
});
