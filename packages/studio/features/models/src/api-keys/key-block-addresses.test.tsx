// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import type { KeyAddresses, ModelKeys } from "../api.ts";
import { useKeyAddresses } from "./key-addresses.tsx";
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
  const reading = { unreadable };
  const addresses: KeyAddresses = {
    allowed: async (name) => {
      if (reading.unreadable) throw new Error("the list can't be read");
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
  return { keys, sent, lists, reading };
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
    // Small, like the field's other lines, with the address in code as the list shows it.
    const preview = [...view.querySelectorAll("p")].find((line) =>
      line.textContent?.startsWith("Allowed address:"),
    );
    expect(preview?.className).toContain("text-small");
    expect(preview?.querySelector("code")?.textContent).toBe("https://gateway.example.com");

    await type(addressInput(view), "http://192.168.1.20:8080");
    await leave(addressInput(view));
    expect(view.textContent).toContain("This address isn't encrypted.");
  });

  it("says a new key is still stored when its address isn't kept and it can't be removed", async () => {
    const made = keysWith([]);
    const stored: string[] = [];
    const keys: ModelKeys = {
      ...made.keys,
      stored: async (name) => stored.includes(name),
      save: async (name) => {
        stored.push(name);
      },
      remove: async () => {
        throw new Error("the keychain is locked");
      },
      addresses: {
        ...(made.keys.addresses as KeyAddresses),
        allow: async (name) => (stored.includes(name) ? { result: "full" } : { result: "no-key" }),
      },
    };
    await show(keys);
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    const view = element as HTMLElement;

    await type(keyInput(view), "sk-acme-test-123");
    await type(addressInput(view), "https://llm.example.com");
    await press(view, "Save key");
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

    expect(view.textContent).toContain(
      "This key can't take more addresses. To start again, remove the key and save it with one address. The key is still stored, with no address yet.",
    );
    expect(view.textContent).not.toContain("keychain is locked");
    expect(view.textContent).toContain("Not bound yet");
  });

  it("says the address didn't save, not the key, when the second address write fails", async () => {
    const made = keysWith([]);
    const stored: string[] = [];
    const keys: ModelKeys = {
      ...made.keys,
      stored: async (name) => stored.includes(name),
      save: async (name) => {
        stored.push(name);
      },
      remove: async () => {
        throw new Error("the keychain is locked");
      },
      addresses: {
        ...(made.keys.addresses as KeyAddresses),
        allow: async (name) => {
          if (stored.includes(name)) throw new Error("the address list couldn't be written");
          return { result: "no-key" };
        },
      },
    };
    await show(keys);
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    const view = element as HTMLElement;

    await type(keyInput(view), "sk-acme-test-123");
    await type(addressInput(view), "https://llm.example.com");
    await press(view, "Save key");
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

    expect(view.textContent).toContain(
      "Couldn't save the address. The key is still stored, with no address yet.",
    );
    expect(view.textContent).not.toContain("Couldn't save the key");
    expect(view.textContent).not.toContain("Try again.");
    expect(view.textContent).toContain("Not bound yet");
  });

  it("never shows one key's addresses under another key's name", async () => {
    const { keys } = keysWith(["anthropic", "openai"], { anthropic: ["https://api.example.com"] });
    const seen: string[] = [];
    function Probe({ name }: { readonly name: string }) {
      seen.push(`${name} ${useKeyAddresses(keys.addresses, name, true, 0)?.kind}`);
      return null;
    }
    element = document.createElement("div");
    root = createRoot(element);
    await act(async () => root?.render(<Probe name="anthropic" />));
    await act(async () => root?.render(<Probe name="openai" />));

    expect(seen).toContain("anthropic listed");
    expect(seen).not.toContain("openai listed");
    expect(seen.at(-1)).toBe("openai none");
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
    // The button is gone, so the focus goes on to the field it opened, not to the page.
    expect(document.activeElement).toBe(addressInput(view));
  });
});

verifies("models.api-keys.not-bound-yet", () => {
  it("shows an old key's quiet badge, and binds it with just an address", async () => {
    const { sent, lists } = await keysAndShow(["anthropic"], "https://api.anthropic.com");
    const view = element as HTMLElement;
    expect(view.textContent).toContain("Not bound yet");
    expect(view.textContent).toContain("This key has no address yet.");
    expect([...view.querySelectorAll("button")].map((button) => button.textContent)).not.toContain(
      "Not bound yet",
    );
    // The chip steps up from the page's own fill, so it keeps its shape.
    const chip = [...view.querySelectorAll("span")].find(
      (span) => span.textContent === "Not bound yet",
    );
    expect(chip?.closest('[data-fill="muted"]')).not.toBeNull();
    // The notice is small, like the field's other lines.
    const notice = [...view.querySelectorAll("p")].find((line) =>
      line.textContent?.includes("This key has no address yet."),
    );
    expect(notice?.className).toContain("text-small");

    await press(view, "Save key");

    expect(sent).toEqual([]);
    expect(lists["anthropic"]).toEqual(["https://api.anthropic.com"]);
    expect(view.textContent).toContain("Address saved: https://api.anthropic.com");
    expect(view.textContent).not.toContain("Not bound yet");
    expect(document.activeElement).toBe(keyInput(view));
  });

  it("names a wrong address on an old key before asking for the key", async () => {
    const { lists } = await keysAndShow(["anthropic"]);
    const view = element as HTMLElement;

    await type(addressInput(view), "llm.example.com");
    await press(view, "Save key");

    expect(view.textContent).toContain("Enter a full address, starting with https:// or http://.");
    expect(view.textContent).not.toContain("Paste the key first.");
    expect(document.activeElement).toBe(addressInput(view));
    expect(lists["anthropic"]).toBeUndefined();
  });

  it("says when the addresses can't be read, with no badge, address or field", async () => {
    await keysAndShow(["anthropic"], "https://api.anthropic.com", {}, true);
    const view = element as HTMLElement;

    expect(view.querySelector('[role="alert"]')?.textContent).toContain(
      "Can't read the addresses saved for this key.",
    );
    expect(view.textContent).toContain(
      "Check that your system keychain is unlocked, then try again.",
    );
    expect(view.textContent).not.toContain("Not bound yet");
    expect(addressInput(view)).toBeNull();
  });

  it("reads the addresses again when Try again is pressed", async () => {
    const { reading } = await keysAndShow(
      ["anthropic"],
      "https://api.anthropic.com",
      { anthropic: ["https://api.anthropic.com"] },
      true,
    );
    const view = element as HTMLElement;
    reading.unreadable = false;

    await press(view, "Try again");

    expect(view.querySelector('[role="alert"]')).toBeNull();
    expect(view.querySelector("code")?.textContent).toBe("https://api.anthropic.com");
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
