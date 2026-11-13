import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { ShellError } from "../shell-error.ts";
import { type BadgeState, createBadgeRegistry, trustBadgePriority } from "./badge-registry.ts";

const state = (id: string, priority: number): BadgeState => ({
  id,
  label: id,
  tone: "attention",
  priority,
});

verifies("shell.header-badges", () => {
  it("lists the highest priority first, then by id", () => {
    const registry = createBadgeRegistry();
    registry.add(state("api-off", 10));
    registry.add(state("needs-sign-in", 10));
    registry.add(state("trust", trustBadgePriority));
    expect(registry.list().map((badge) => badge.id)).toEqual(["trust", "api-off", "needs-sign-in"]);
  });

  it("removes a state with the function add returned, and only that state", () => {
    const registry = createBadgeRegistry();
    const remove = registry.add(state("api-off", 10));
    remove();
    const removeAgain = registry.add(state("api-off", 20));
    remove();
    expect(registry.list().map((badge) => badge.priority)).toEqual([20]);
    removeAgain();
    expect(registry.list()).toEqual([]);
  });

  it("tells subscribers about each change, and stops after they unsubscribe", () => {
    const registry = createBadgeRegistry();
    const listener = vi.fn();
    const stop = registry.subscribe(listener);
    const remove = registry.add(state("api-off", 10));
    remove();
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
    registry.add(state("api-off", 10));
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("throws a ShellError naming the id when it is already shown", () => {
    const registry = createBadgeRegistry();
    registry.add(state("api-off", 10));
    expect(() => registry.add(state("api-off", 20))).toThrow(ShellError);
    expect(() => registry.add(state("api-off", 20))).toThrow(/"api-off"/);
  });
});
