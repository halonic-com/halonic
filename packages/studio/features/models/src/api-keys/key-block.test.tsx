// @vitest-environment jsdom

import { KindedError } from "@halonicjs/std";
import type { SecretText } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { KeyEntry, ModelKeys } from "../api.ts";
import { KeyBlock } from "./key-block.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let element: HTMLElement | undefined;

beforeEach(() => {
  // jsdom has `<dialog>` but no `showModal()`; opening it is all these tests need.
  Object.assign(HTMLDialogElement.prototype, {
    showModal(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
    close(this: HTMLDialogElement) {
      this.removeAttribute("open");
    },
  });
});

afterEach(() => {
  act(() => root?.unmount());
  element?.remove();
});

const desktop: KeyEntry = { kind: "field", keptOn: "this-computer", offHostHttps: false };

/** A key store in memory that records what was sent to it. */
function keysWith(entry: KeyEntry, stored: string[] = []) {
  const sent: string[] = [];
  const keys: ModelKeys = {
    entry,
    stored: async (name) => stored.includes(name),
    save: async (name, key) => {
      sent.push(`${name}=${key.reveal()}`);
      stored.push(name);
    },
    remove: async (name) => {
      stored.splice(stored.indexOf(name), 1);
    },
  };
  return { keys, sent, stored };
}

/** Shows the block; `null` for a provider with no secret name. */
async function show(
  keys: ModelKeys,
  secretName: string | null = "anthropic",
  focusRequest?: string,
) {
  element = document.createElement("div");
  document.body.append(element);
  root = createRoot(element);
  await draw(keys, secretName ?? undefined, focusRequest);
  return element;
}

/** Draws the block again, as the provider page does when it is asked for its key again. */
async function draw(keys: ModelKeys, secretName: string | undefined, focusRequest?: string) {
  await act(async () =>
    root?.render(
      <KeyBlock
        keys={keys}
        secretName={secretName}
        providerName="Anthropic"
        focusRequest={focusRequest}
      />,
    ),
  );
  // The focus moves a moment later, after the shell focuses the page's heading.
  await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
}

async function type(container: HTMLElement, value: string) {
  const input = container.querySelector("input") as HTMLInputElement;
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  await act(async () => {
    set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  return input;
}

async function press(container: HTMLElement | Document, label: string) {
  const button = [...container.querySelectorAll("button")].find(
    (candidate) => candidate.textContent?.includes(label) === true,
  );
  await act(async () => button?.click());
}

verifies("models.api-keys.enter-key", () => {
  it("stores a typed key under the secret name, clears the field and says Key set", async () => {
    const { keys, sent } = keysWith(desktop);
    const view = await show(keys);
    expect(view.textContent).toContain("No key");
    expect(view.textContent).toContain("system keychain");
    const input = await type(view, "sk-acme-test-123");
    expect(input.type).toBe("password");
    await press(view, "Save key");
    expect(sent).toEqual(["anthropic=sk-acme-test-123"]);
    expect(input.value).toBe("");
    expect(view.textContent).toContain("Key set");
    expect(view.textContent).toContain("Saved key for Anthropic");
    expect(document.activeElement).toBe(input);
  });

  it("asks for the key and keeps focus in the field when Save key is pressed empty", async () => {
    const { keys, sent } = keysWith(desktop);
    const view = await show(keys);
    await press(view, "Save key");
    expect(view.textContent).toContain("Paste the key first.");
    expect(document.activeElement).toBe(view.querySelector("input"));
    expect(sent).toEqual([]);
  });

  it("warns on another device over https and names the host command", async () => {
    const view = await show(
      keysWith({ kind: "field", keptOn: "host-computer", offHostHttps: true }).keys,
    );
    expect(view.textContent).toContain("halonic secret set anthropic");
    expect(view.textContent).toContain("encrypted");
    expect(view.querySelector("input")).not.toBeNull();
  });

  it("offers no field over plain http from another device, as the server refuses it", async () => {
    const view = await show(keysWith({ kind: "unavailable", reason: "unencrypted" }).keys);
    expect(view.querySelector("input")).toBeNull();
    expect(view.textContent).toContain("not encrypted");
    expect(view.textContent).toContain("halonic secret set anthropic");
  });

  it("offers no field without a password and shows the host command", async () => {
    const view = await show(keysWith({ kind: "unavailable", reason: "no-password" }).keys);
    expect(view.querySelector("input")).toBeNull();
    expect(view.textContent).toContain("password is needed");
    expect(view.textContent).toContain("halonic secret set anthropic");
  });

  it("keeps the typed key and never repeats it when saving fails", async () => {
    const { keys } = keysWith(desktop);
    const failing: ModelKeys = {
      ...keys,
      save: async (_name: string, key: SecretText) => {
        throw new KindedError("unavailable", `refused ${key.reveal()}`);
      },
    };
    const view = await show(failing);
    const input = await type(view, "sk-acme-test-789");
    await press(view, "Save key");
    expect(view.textContent).toContain("Couldn't save the key: refused");
    expect(view.textContent).not.toContain("sk-acme-test-789");
    expect(input.value).toBe("sk-acme-test-789");
  });

  it("shows no path or stack when saving fails", async () => {
    const { keys } = keysWith(desktop);
    const leak = new Error("EPERM: /srv/studio/.halonic/keys\n    at write (keys.ts:1:1)");
    const view = await show({ ...keys, save: async () => Promise.reject(leak) });
    await type(view, "sk-acme-test-789");
    await press(view, "Save key");
    expect(view.textContent).toContain("Couldn't save the key. Try again.");
    expect(view.textContent).not.toMatch(/srv|EPERM|keys\.ts/);
  });

  it("shows no path or stack when removing fails", async () => {
    const { keys } = keysWith(desktop, ["anthropic"]);
    const leak = new Error("EPERM: /srv/studio/.halonic/keys\n    at write (keys.ts:1:1)");
    const view = await show({ ...keys, remove: async () => Promise.reject(leak) });
    await press(view, "Remove key");
    await press(document.querySelector("dialog") as HTMLElement, "Remove key");
    expect(view.textContent).toContain("Couldn't remove the key. Try again.");
    expect(view.textContent).not.toMatch(/srv|EPERM|keys\.ts/);
  });
});

verifies("models.api-keys.key-status", () => {
  it("draws a filled dot for a stored key and a hollow ring for none, hidden from readers", async () => {
    const set = await show(keysWith(desktop, ["anthropic"]).keys);
    expect(set.querySelector('[role="status"] [aria-hidden="true"]')?.className).toContain(
      "bg-success",
    );
    expect(set.querySelector("input")?.placeholder).toContain("replace");
    act(() => root?.unmount());
    set.remove();
    const none = await show(keysWith(desktop).keys);
    expect(none.querySelector('[role="status"] [aria-hidden="true"]')?.className).toContain(
      "border",
    );
  });

  it("offers Try again after a failed check and shows the state once it works", async () => {
    const { keys } = keysWith(desktop, ["anthropic"]);
    let calls = 0;
    const view = await show({
      ...keys,
      stored: async (name) => {
        if (calls++ === 0) throw new Error("unreachable");
        return keys.stored(name);
      },
    });
    expect(view.textContent).toContain("Couldn't check");
    await press(view, "Try again");
    expect(view.textContent).toContain("Key set");
    expect(view.textContent).not.toContain("Try again");
  });

  it("says Key set for a stored key and never shows it", async () => {
    const view = await show(keysWith(desktop, ["anthropic"]).keys);
    expect(view.textContent).toContain("Key set");
    expect(view.querySelector("input")?.value).toBe("");
  });
});

verifies("models.api-keys.replace-or-remove", () => {
  it("asks before replacing a key and keeps the old one on Cancel", async () => {
    const { keys, sent } = keysWith(desktop, ["anthropic"]);
    const view = await show(keys);
    await type(view, "sk-acme-test-456");
    await press(view, "Save key");
    expect(document.body.textContent).toContain(
      "Change anthropic? Every agent that uses it switches to the new key right away.",
    );
    expect(sent).toEqual([]);
    await press(document, "Cancel");
    expect(sent).toEqual([]);
    await press(view, "Save key");
    await press(document, "Change key");
    expect(sent).toEqual(["anthropic=sk-acme-test-456"]);
    expect(view.textContent).toContain("Key set");
  });

  it("asks 'Save a key as' when the check failed, and sends nothing until confirmed", async () => {
    const { keys, sent } = keysWith(desktop, ["anthropic"]);
    const view = await show({
      ...keys,
      stored: async () => {
        throw new Error("unreachable");
      },
    });
    await type(view, "sk-acme-test-456");
    await press(view, "Save key");
    expect(document.body.textContent).not.toContain("Change anthropic?");
    expect(document.body.textContent).toContain("Save a key as anthropic?");
    expect(sent).toEqual([]);
  });

  it("removes a key after a confirm and then says No key", async () => {
    const { keys, stored } = keysWith(desktop, ["anthropic"]);
    const view = await show(keys);
    await press(view, "Remove key");
    expect(stored).toEqual(["anthropic"]);
    await press(document.querySelector("dialog") as HTMLElement, "Remove key");
    expect(stored).toEqual([]);
    expect(view.textContent).toContain("No key");
  });
});

verifies("models.api-keys.where-keys-are-kept", () => {
  it("says a served key is kept on the host", async () => {
    const view = await show(
      keysWith({ kind: "field", keptOn: "host-computer", offHostHttps: false }).keys,
    );
    expect(view.textContent).toContain("kept on the host");
  });
});

verifies("models.api-keys.open-at-key", () => {
  it("puts the focus in the key field when the page is opened at the key", async () => {
    const view = await show(keysWith(desktop).keys, "anthropic", "anthropic/0");
    expect(document.activeElement).toBe(view.querySelector("input"));
  });

  it("puts the focus back in the field when it is asked again, and only then", async () => {
    const { keys } = keysWith(desktop, ["anthropic"]);
    const view = await show(keys, "anthropic", "anthropic/0");
    const outside = document.createElement("button");
    document.body.append(outside);
    outside.focus();
    await draw(keys, "anthropic", "anthropic/0");
    expect(document.activeElement).toBe(outside);
    await draw(keys, "anthropic", "anthropic/1");
    expect(document.activeElement).toBe(view.querySelector("input"));
    outside.remove();
  });

  it("focuses the heading when the provider has no secret name", async () => {
    const view = await show(keysWith(desktop).keys, null, "anthropic/0");
    expect(view.textContent).toContain("Give this provider a secret name");
    expect(document.activeElement).toBe(view.querySelector("h2"));
  });

  it("focuses the heading where this page can't take a key", async () => {
    const view = await show(
      keysWith({ kind: "unavailable", reason: "unencrypted" }).keys,
      "anthropic",
      "anthropic/0",
    );
    expect(view.querySelector("input")).toBeNull();
    expect(document.activeElement).toBe(view.querySelector("h2"));
  });

  it("leaves the focus alone when the page isn't opened at the key", async () => {
    const view = await show(keysWith(desktop).keys);
    expect(view.contains(document.activeElement)).toBe(false);
  });
});
