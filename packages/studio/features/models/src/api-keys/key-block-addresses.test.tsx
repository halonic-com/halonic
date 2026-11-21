// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import type { KeyAddresses, ModelKeys } from "../api.ts";
import { KeyBlock } from "./key-block.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let element: HTMLElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  element?.remove();
});

/**
 * A key store with addresses, in memory. `lists` holds each stored key's addresses: a key in
 * `stored` with no entry was saved before addresses existed. `unreadable` makes every read fail.
 */
function keysWith(stored: string[], lists: Record<string, string[]> = {}, unreadable = false) {
  const sent: string[] = [];
  const addresses: KeyAddresses = {
    allowed: async (name) => {
      if (unreadable) throw new Error("the list can't be read");
      return lists[name];
    },
    allow: async (name, address) => {
      if (!stored.includes(name)) return { result: "no-key" };
      const origin = new URL(address).origin;
      lists[name] = [...(lists[name] ?? []), origin];
      return { result: "added", origin };
    },
    usualAddress: () => undefined,
  };
  const keys: ModelKeys = {
    entry: { kind: "field", keptOn: "this-computer", offHostHttps: false },
    stored: async (name) => stored.includes(name),
    save: async (name, key) => {
      sent.push(`${name}=${key.reveal()}`);
      stored.push(name);
    },
    remove: async () => undefined,
    addresses,
  };
  return { keys, sent, lists };
}

async function show(keys: ModelKeys, usualAddress?: string) {
  element = document.createElement("div");
  document.body.append(element);
  root = createRoot(element);
  await act(async () =>
    root?.render(
      <KeyBlock
        keys={keys}
        secretName="anthropic"
        providerName="Anthropic"
        usualAddress={usualAddress}
      />,
    ),
  );
  return element;
}

const keyInput = (view: HTMLElement) => view.querySelector('input[type="password"]');
const addressInput = (view: HTMLElement) =>
  view.querySelector<HTMLInputElement>('input[inputmode="url"]');

async function type(input: Element | null, value: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  await act(async () => {
    set?.call(input, value);
    input?.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function leave(input: HTMLInputElement | null) {
  await act(async () => {
    input?.focus();
    input?.blur();
  });
}

async function press(view: HTMLElement, label: string) {
  const button = [...view.querySelectorAll("button")].find((candidate) =>
    candidate.textContent?.includes(label),
  );
  await act(async () => button?.click());
}

verifies("models.api-keys.address-field", () => {
  it("saves a new key with the provider type's own address, pre-filled", async () => {
    const { keys, sent, lists } = await keysAndShow([], "https://api.anthropic.com");
    const view = element as HTMLElement;
    const address = addressInput(view);
    expect(address?.value).toBe("https://api.anthropic.com");
    expect(address?.type).toBe("text");
    expect(view.textContent).toContain("Halonic sends this key only to this address.");

    await type(keyInput(view), "sk-acme-test-123");
    await press(view, "Save key");

    expect(sent).toEqual(["anthropic=sk-acme-test-123"]);
    expect(lists["anthropic"]).toEqual(["https://api.anthropic.com"]);
    expect(view.textContent).toContain("Key saved. Address: https://api.anthropic.com");
    expect(view.querySelector("code")?.textContent).toBe("https://api.anthropic.com");
    expect(view.textContent).not.toContain("sk-acme");
    expect(keys.addresses).toBeDefined();
  });

  it("needs an address for a custom provider's new key, and stores nothing without one", async () => {
    const { sent } = await keysAndShow([]);
    const view = element as HTMLElement;
    const address = addressInput(view);
    expect(address?.placeholder).toBe("https://gateway.example.com");
    expect(address?.getAttribute("aria-required")).toBe("true");

    await type(keyInput(view), "sk-acme-test-123");
    await press(view, "Save key");

    expect(view.textContent).toContain("Enter an address for this key.");
    expect(address?.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(address);
    expect(sent).toEqual([]);
  });

  it("refuses another scheme and a user name in the address before anything is saved", async () => {
    const { sent } = await keysAndShow([]);
    const view = element as HTMLElement;
    await type(keyInput(view), "sk-acme-test-123");

    await type(addressInput(view), "ftp://llm.example.com");
    await press(view, "Save key");
    expect(view.textContent).toContain("Use an address that starts with https:// or http://.");

    await type(addressInput(view), "https://user:pw@llm.example.com");
    await press(view, "Save key");
    expect(view.textContent).toContain("Remove the user name and password from the address.");
    expect(sent).toEqual([]);
  });

  it("shows the address as it is kept once focus leaves the field, and notes plain http", async () => {
    await keysAndShow([]);
    const view = element as HTMLElement;

    await type(addressInput(view), "https://Gateway.example.com/v1");
    await leave(addressInput(view));
    expect(view.textContent).toContain(
      "Allowed address: https://gateway.example.com. Only the address part is kept.",
    );

    await type(addressInput(view), "http://192.168.1.20:8080");
    await leave(addressInput(view));
    expect(view.textContent).toContain("This address isn't encrypted.");
  });

  it("lists a key's addresses, opens the rest in place, and adds one only when asked", async () => {
    await keysAndShow(["anthropic"], undefined, {
      anthropic: ["https://api.example.com", "https://gateway.example.com"],
    });
    const view = element as HTMLElement;
    expect(addressInput(view)).toBeNull();
    const more = [...view.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("+1 more"),
    );
    expect(more?.textContent).toContain("Show 1 more address for key anthropic");
    expect(more?.getAttribute("aria-expanded")).toBe("false");
    const list = document.getElementById(more?.getAttribute("aria-controls") ?? "");
    expect(list?.hidden).toBe(true);

    await act(async () => more?.click());
    expect(list?.hidden).toBe(false);
    expect(list?.textContent).toBe("https://gateway.example.com");

    await press(view, "Add another address");
    expect(addressInput(view)?.value).toBe("");
  });
});

verifies("models.api-keys.not-bound-yet", () => {
  it("shows an old key's quiet badge, and binds it with just an address", async () => {
    const { sent, lists } = await keysAndShow(["anthropic"], "https://api.anthropic.com");
    const view = element as HTMLElement;
    expect(view.textContent).toContain("Not bound yet");
    expect(view.textContent).toContain("saved before Halonic recorded addresses");
    expect([...view.querySelectorAll("button")].map((button) => button.textContent)).not.toContain(
      "Not bound yet",
    );

    await press(view, "Save key");

    expect(sent).toEqual([]);
    expect(lists["anthropic"]).toEqual(["https://api.anthropic.com"]);
    expect(view.textContent).toContain("Address saved: https://api.anthropic.com");
    expect(view.textContent).not.toContain("Not bound yet");
    expect(document.activeElement).toBe(keyInput(view));
  });

  it("says when the addresses can't be read, with no badge, address or field", async () => {
    await keysAndShow(["anthropic"], "https://api.anthropic.com", {}, true);
    const view = element as HTMLElement;

    expect(view.querySelector('[role="alert"]')?.textContent).toContain(
      "Can't read the addresses saved for this key.",
    );
    expect(view.textContent).toContain("Check that your Halonic profile folder can be opened");
    expect(view.textContent).not.toContain("Not bound yet");
    expect(addressInput(view)).toBeNull();
  });
});

/** Makes the store and shows the block, waiting for the stored key and its addresses. */
async function keysAndShow(
  stored: string[],
  usualAddress?: string,
  lists?: Record<string, string[]>,
  unreadable?: boolean,
) {
  const made = keysWith(stored, lists, unreadable);
  await show(made.keys, usualAddress);
  await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
  return made;
}
