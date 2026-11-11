import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { RECENT_WORKSPACES, type RecentStorage, RecentWorkspaces } from "./recent-workspaces.ts";

/** A `localStorage` stand-in that keeps its items in a map. */
function memoryStorage(items: Record<string, string> = {}): RecentStorage {
  const map = new Map(Object.entries(items));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

const acme = { location: "/work/acme", name: "Acme" };
const beta = { location: "/work/beta", name: "Beta" };

verifies("workspace.recent-workspaces", () => {
  it("starts empty", () => {
    expect(new RecentWorkspaces(memoryStorage()).list()).toEqual([]);
  });

  it("lists the workspaces shown last, most recent first, across restarts", () => {
    const storage = memoryStorage();
    const recent = new RecentWorkspaces(storage);
    recent.remember(acme);
    recent.remember(beta);
    recent.remember(acme);

    expect(new RecentWorkspaces(storage).list()).toEqual([acme, beta]);
  });

  it("keeps a workspace's latest name", () => {
    const recent = new RecentWorkspaces(memoryStorage());
    recent.remember(acme);
    recent.remember({ location: acme.location, name: "Acme Support" });

    expect(recent.list()).toEqual([{ location: acme.location, name: "Acme Support" }]);
  });

  it(`remembers only the ${RECENT_WORKSPACES} most recent`, () => {
    const recent = new RecentWorkspaces(memoryStorage());
    for (let index = 1; index <= 10; index += 1) {
      recent.remember({ location: `/w/${index}`, name: `W${index}` });
    }

    const list = recent.list();
    expect(list).toHaveLength(RECENT_WORKSPACES);
    expect(list[0]?.name).toBe("W10");
    expect(list.at(-1)?.name).toBe("W2");
  });

  it("forgets a workspace on Remove from Recent", () => {
    const recent = new RecentWorkspaces(memoryStorage());
    recent.remember(acme);
    recent.remember(beta);
    recent.forget(acme.location);

    expect(recent.list()).toEqual([beta]);
  });

  it("reads a broken or foreign list as empty, keeping well-formed entries", () => {
    expect(new RecentWorkspaces(memoryStorage({ "halonic.workspace.recent": "{" })).list()).toEqual(
      [],
    );
    expect(
      new RecentWorkspaces(memoryStorage({ "halonic.workspace.recent": '"x"' })).list(),
    ).toEqual([]);
    const mixed = JSON.stringify([acme, { location: 3 }, null, "x"]);
    expect(
      new RecentWorkspaces(memoryStorage({ "halonic.workspace.recent": mixed })).list(),
    ).toEqual([acme]);
  });

  it("never throws when the storage does", () => {
    const blocked: RecentStorage = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    const recent = new RecentWorkspaces(blocked);

    expect(() => recent.remember(acme)).not.toThrow();
    expect(recent.list()).toEqual([]);
  });

  it("tells its listeners when the list changes, and not when storage refuses", () => {
    let full = false;
    const storage = memoryStorage();
    const recent = new RecentWorkspaces({
      getItem: (key) => storage.getItem(key),
      setItem: (key, value) => {
        if (full) {
          throw new Error("QuotaExceededError");
        }
        storage.setItem(key, value);
      },
    });
    const listener = vi.fn();
    const stop = recent.subscribe(listener);

    recent.remember(acme);
    recent.forget(acme.location);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(recent.version).toBe(2);

    full = true;
    recent.remember(beta);
    expect(recent.version).toBe(2);

    full = false;
    stop();
    recent.remember(beta);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
