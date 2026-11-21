import { beforeAll, describe, expect, it } from "vitest";
import { libraryFeature } from "./feature.ts";
import { type LibraryItemsHost, LibraryItemsHostService } from "./library-items-host.ts";
import { libraryKinds } from "./library-words.ts";

interface AddedItemKind {
  readonly kind: string;
  readonly place: string;
  readonly open: { readonly view: string; readonly load: () => Promise<Record<string, unknown>> };
}

/** Every item kind the feature registers. */
function itemKinds(): AddedItemKind[] {
  const added: AddedItemKind[] = [];
  const studio = new Proxy(
    {},
    {
      get: (_, registry) => ({
        add: (entry: AddedItemKind) => {
          if (registry === "itemKinds") added.push(entry);
        },
      }),
    },
  );
  libraryFeature.register(studio as never);
  return added;
}

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
  // Each Library page loads lazily. On a busy CI machine the first import (transforming the page and
  // everything behind it) took longer than the test's 30 s (HAL-14641), so load them all up front under
  // the hook's longer limit; the tests then only check the already loaded pages.
  beforeAll(async () => {
    await Promise.all(itemKinds().map((entry) => entry.open.load()));
  }, 120_000);

  it("is registered under its folder name", () => {
    expect(libraryFeature.id).toBe("library");
  });

  // A tab whose kind no view answers opened a blank page (HAL-12534).
  it.each(libraryKinds)(
    "opens a %s from its Library tab on a page the feature loads",
    async (kind) => {
      const added = itemKinds().find((entry) => entry.kind === kind);
      expect(added?.place).toBe("library");
      const loaded = await added?.open.load();
      expect(typeof loaded?.[added?.open.view ?? ""]).toBe("function");
    },
  );

  it.each(libraryKinds)("titles a %s's tab with the name the list shows (HAL-11790)", (kind) => {
    const asked: unknown[] = [];
    const host = {
      nameOf: (...args: unknown[]) => {
        asked.push(args);
        return "Refund handling";
      },
    };
    expect(tabLabel(kind, "support", "refund-handling", host)).toBe("Refund handling");
    expect(asked).toEqual([[kind, { hub: "support", id: "refund-handling" }]]);
  });

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
