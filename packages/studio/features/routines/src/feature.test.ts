import { describe, expect, it, vi } from "vitest";
import { RoutinesHostService } from "./api.ts";
import { routinesFeature } from "./feature.ts";

/** The `subscribe` of the routine kind's tab, as the feature registers it. */
function tabSubscribe() {
  let subscribe: ((listener: () => void, context: unknown) => () => void) | undefined;
  const studio = new Proxy(
    {},
    {
      get: () => {
        const add = (added: { kind?: string; tab?: { subscribe?: typeof subscribe } }) => {
          if (added.kind === "routine") subscribe = added.tab?.subscribe;
        };
        // Every registry's every method, so the other things the feature adds are let through.
        return new Proxy({}, { get: () => add });
      },
    },
  );
  routinesFeature.register(studio as never);
  return subscribe;
}

describe("routinesFeature", () => {
  it("is registered under its folder name", () => {
    expect(routinesFeature.id).toBe("routines");
  });

  it("tells the window when the routines change, so a renamed routine's tabs follow (PT1, HAL-14489)", () => {
    const listeners = new Set<() => void>();
    const host = {
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    const context = {
      services: { find: (key: unknown) => (key === RoutinesHostService ? host : undefined) },
    };
    const listener = vi.fn();
    const stop = tabSubscribe()?.(listener, context);
    for (const told of listeners) told();
    stop?.();
    expect(listener).toHaveBeenCalledOnce();
    expect(listeners.size).toBe(0);
  });
});
