import { describe, expect, it, vi } from "vitest";
import { firstLoad, type HomeCardSource } from "./first-load.ts";

/** A source whose loads fail until `answer`, each failure told to its listeners as Inbox does. */
function source() {
  const listeners = new Set<() => void>();
  let ok = false;
  const tell = () => {
    for (const listener of [...listeners]) listener();
  };
  const loadable = {
    state: { loaded: false, error: undefined } as HomeCardSource["state"],
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    refresh: vi.fn(async () => {
      loadable.state = ok ? { loaded: true, error: undefined } : { loaded: false, error: "401" };
      tell();
    }),
  } satisfies HomeCardSource;
  return {
    loadable,
    fail: () => loadable.refresh(),
    answer: () => {
      ok = true;
    },
  };
}

describe("firstLoad", () => {
  it("keeps a failed load for its attempt, so React's renders after it don't load again", async () => {
    const { loadable, fail } = source();
    const first = firstLoad(loadable, 0);
    await fail();
    await expect(first).rejects.toBe("401");
    loadable.refresh.mockClear();

    expect(firstLoad(loadable, 0)).toBe(first);
    expect(firstLoad(loadable, 0)).toBe(first);
    expect(loadable.refresh).not.toHaveBeenCalled();
  });

  it("loads again for a new attempt, once", async () => {
    const { loadable, fail, answer } = source();
    const first = firstLoad(loadable, 0);
    await fail();
    await expect(first).rejects.toBe("401");
    loadable.refresh.mockClear();
    answer();

    const second = firstLoad(loadable, 1);
    expect(firstLoad(loadable, 1)).toBe(second);
    await expect(second).resolves.toBeUndefined();
    expect(loadable.refresh).toHaveBeenCalledTimes(1);
  });

  it("is done for every attempt once the source has loaded, even after a failed one", async () => {
    const { loadable, fail, answer } = source();
    const first = firstLoad(loadable, 0);
    await fail();
    await expect(first).rejects.toBe("401");
    answer();
    await loadable.refresh();
    loadable.refresh.mockClear();

    await expect(firstLoad(loadable, 0)).resolves.toBeUndefined();
    expect(loadable.refresh).not.toHaveBeenCalled();
  });

  it("loads again for a second section's Try again after the first section's failed (HAL-13446)", async () => {
    // Recent runs and Spend share one runs list; Home gives each Try again an attempt of its own.
    const { loadable, fail } = source();
    const first = firstLoad(loadable, 0);
    expect(firstLoad(loadable, 0)).toBe(first);
    await fail();
    await expect(first).rejects.toBe("401");

    const recentRuns = firstLoad(loadable, 1);
    await expect(recentRuns).rejects.toBe("401");
    loadable.refresh.mockClear();

    const spend = firstLoad(loadable, 2);
    expect(spend).not.toBe(recentRuns);
    await expect(spend).rejects.toBe("401");
    expect(loadable.refresh).toHaveBeenCalledTimes(1);
  });
});
