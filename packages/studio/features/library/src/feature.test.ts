import { describe, expect, it } from "vitest";
import { libraryFeature } from "./feature.ts";
import { type LibraryItemsHost, LibraryItemsHostService } from "./library-items-host.ts";

/** The tab each item kind the feature registers describes, with `host` as the Library's items. */
function tabLabel(kind: string, hub: string, id: string, host?: Partial<LibraryItemsHost>) {
  let described: ((item: unknown, context: unknown) => { label: string }) | undefined;
  const studio = new Proxy(
    {},
    {
      get: () => ({
        add: (added: { kind?: string; tab?: { describe: typeof described } }) => {
          if (added.kind === kind) described = added.tab?.describe;
        },
      }),
    },
  );
  libraryFeature.register(studio as never);
  const context = {
    services: { find: (key: unknown) => (key === LibraryItemsHostService ? host : undefined) },
  };
  return described?.({ kind, hub, id }, context).label;
}

describe("libraryFeature", () => {
  it("is registered under its folder name", () => {
    expect(libraryFeature.id).toBe("library");
  });

  it.each(["skill", "knowledge", "connector"])(
    "titles a %s's tab with the name the list shows (HAL-11790)",
    (kind) => {
      const asked: unknown[] = [];
      const host = {
        nameOf: (...args: unknown[]) => {
          asked.push(args);
          return "Refund handling";
        },
      };
      expect(tabLabel(kind, "support", "refund-handling", host)).toBe("Refund handling");
      expect(asked).toEqual([[kind, { hub: "support", id: "refund-handling" }]]);
    },
  );

  it("asks for a shared item with no hub, and falls back to the id until it has a name", () => {
    const asked: unknown[] = [];
    const host = {
      nameOf: (...args: unknown[]) => {
        asked.push(args);
        return undefined;
      },
    };
    expect(tabLabel("skill", "~workspace", "tone", host)).toBe("tone");
    expect(asked).toEqual([["skill", { hub: null, id: "tone" }]]);
    expect(tabLabel("connector", "support", "mail")).toBe("mail");
  });
});
