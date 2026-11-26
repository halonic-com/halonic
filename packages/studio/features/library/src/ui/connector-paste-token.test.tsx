// @vitest-environment jsdom
import type { ConnectorTroubleKind } from "@halonicjs/app";
import { type ItemViewProps, limitedLookup } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { ConnectorSecrets } from "../connector-secrets-host.ts";
import { ConnectorSecretsService } from "../connector-secrets-host.ts";
import { type ConnectorStatusHost, ConnectorStatusHostService } from "../connector-status-host.ts";
import { libraryFeature } from "../feature.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { ConnectorPage } from "./connector-page.tsx";

afterEach(unmountAll);

/** The local integration Shop orders, whose last call `shop.example.com` answered with `kind`. */
function shopOrders(kind: ConnectorTroubleKind, secrets: readonly string[]): ConnectorStatusHost {
  return {
    list: async () => [
      {
        id: "orders",
        name: "Shop orders",
        state: "not-checked",
        connection: { kind: "integration", folder: "shop-orders", secrets },
        trouble: { kind, host: "shop.example.com", fields: [] },
      },
    ],
    refusals: async () => [],
    waiting: async () => [],
    subscribe: () => () => {},
  };
}

/** A keychain in memory with nothing stored. */
function emptyKeychain(): ConnectorSecrets {
  return { set: async () => {}, remove: async () => {}, has: async () => false };
}

/** The connector's page on the desktop app, or on a phone. */
async function openPage(
  status: ConnectorStatusHost,
  host: "desktop-app" | "phone" = "desktop-app",
): Promise<HTMLElement> {
  const services = new Map<unknown, unknown>([
    [ConnectorStatusHostService, status],
    [ConnectorSecretsService, emptyKeychain()],
  ]);
  const props = {
    item: { kind: "connector", hub: "local", id: "orders" },
    context: {
      services: limitedLookup(libraryFeature, {
        get: (key: unknown) => services.get(key),
        find: (key: unknown) => services.get(key),
      }),
      announcer: { announceState: vi.fn() },
      host,
    },
    Sections: () => null,
  } as unknown as ItemViewProps;
  const root = render(<ConnectorPage {...props} />);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return root;
}

const pasteToken = (root: HTMLElement) =>
  [...root.querySelectorAll("button")].find((button) => button.textContent === "Paste a new token");

/** The password entry labelled `name`. */
function entryOf(root: HTMLElement, name: string): HTMLInputElement | undefined {
  const label = [...root.querySelectorAll("label")].find((each) => each.textContent === name);
  const input = label === undefined ? null : root.querySelector(`#${CSS.escape(label.htmlFor)}`);
  return input instanceof HTMLInputElement ? input : undefined;
}

verifies("library.connector-trouble-line", () => {
  it("offers Paste a new token on a 401, which focuses the token's entry", async () => {
    const root = await openPage(shopOrders("not-accepted", ["shop-key"]));
    expect(root.textContent).toContain(
      "shop.example.com didn't accept the token. It may be mistyped or revoked.",
    );
    const button = pasteToken(root);
    expect(button).toBeDefined();

    act(() => {
      button?.focus();
      button?.click();
    });
    expect(entryOf(root, "shop-key")).toBeDefined();
    expect(document.activeElement).toBe(entryOf(root, "shop-key"));
  });

  it("focuses the first secret's entry when the integration gets several", async () => {
    const root = await openPage(shopOrders("not-accepted", ["backup-key", "shop-key"]));
    act(() => pasteToken(root)?.click());
    expect(document.activeElement).toBe(entryOf(root, "backup-key"));
  });

  it("shows no Paste a new token when the integration gets no secret", async () => {
    const root = await openPage(shopOrders("not-accepted", []));
    expect(root.textContent).toContain("didn't accept the token");
    expect(pasteToken(root)).toBeUndefined();
  });

  it("shows no Paste a new token on a phone, which has no Secrets section", async () => {
    const root = await openPage(shopOrders("not-accepted", ["shop-key"]), "phone");
    expect(pasteToken(root)).toBeUndefined();
  });

  it("shows no Paste a new token for a trouble a new token doesn't fix", async () => {
    const root = await openPage(shopOrders("not-allowed", ["shop-key"]));
    expect(root.textContent).toContain("Your token isn't allowed to do this.");
    expect(pasteToken(root)).toBeUndefined();
  });
});
