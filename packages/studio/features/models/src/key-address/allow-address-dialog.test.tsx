// @vitest-environment jsdom
import type { WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { KeyAddressQuestion } from "../api.ts";
import { AllowAddressDialogHost } from "./allow-address-dialog-host.tsx";
import { KeyAddressQueue } from "./key-address-queue.ts";

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
  // jsdom doesn't scroll; the kit scrolls a failure into view.
  Element.prototype.scrollIntoView = () => undefined;
});

afterEach(() => {
  act(() => root?.unmount());
  element?.remove();
});

/** A made-up key value; no text the dialog shows may hold it (X-3). */
const keyValue = "sk-example-not-a-real-key-123";

const gateway: KeyAddressQuestion = {
  provider: "Gateway",
  key: "gateway-key",
  origin: "https://gateway.example.com",
  allowed: ["https://api.example.com"],
};

/** Draws the host over a queue, as the feature does for an open folder. */
function show(queue: KeyAddressQueue) {
  element = document.createElement("div");
  document.body.append(element);
  const context = { services: { get: () => queue } } as unknown as WorkspaceContext;
  root = createRoot(element);
  act(() => root?.render(<AllowAddressDialogHost context={context} />));
}

/** Asks `question` and draws the dialog; the answer and what was saved. */
function ask(queue: KeyAddressQueue, question: KeyAddressQuestion, saved = true) {
  const saves: string[] = [];
  let answer: string | undefined;
  act(() => {
    queue
      .ask(question, {
        save: async () => {
          saves.push(question.origin);
          return saved;
        },
        signal: new AbortController().signal,
      })
      .then((given) => (answer = given));
  });
  return { saves, answer: () => answer };
}

function dialog(): HTMLDialogElement {
  return document.querySelector("dialog") as HTMLDialogElement;
}

/** A button's visible label, without what only a screen reader hears. */
function labelOf(button: HTMLButtonElement): string {
  const shown = button.querySelector(":scope > span > span:not(.invisible)");
  return (shown ?? button).textContent ?? "";
}

function button(name: string): HTMLButtonElement {
  const found = [...document.querySelectorAll("button")].find((b) => labelOf(b) === name);
  if (found === undefined) throw new Error(`no button ${name}`);
  return found;
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
  });
}

verifies("models.key-address.allow-address", () => {
  it("asks as an alertdialog: provider and key, the address, the key's addresses, the warning, the scope", () => {
    const queue = new KeyAddressQueue();
    show(queue);
    expect(dialog()).toBeNull();
    ask(queue, gateway);
    expect(dialog().getAttribute("role")).toBe("alertdialog");
    const text = dialog().textContent ?? "";
    const order = [
      "Allow this address?",
      'Gateway wants to send the key "gateway-key" to:',
      "https://gateway.example.com",
      "This key is currently allowed for https://api.example.com.",
      "Only allow an address you recognise. Halonic will send the key there on every request.",
      "Allowing it applies to this key only.",
      "Don't allow",
      "Allow this address",
    ];
    let from = 0;
    for (const part of order) {
      const at = text.indexOf(part, from);
      expect(at, part).toBeGreaterThanOrEqual(from);
      from = at + part.length;
    }
    expect(text).not.toContain(keyValue);
    expect(text).not.toMatch(/origin|host|URL/);
  });

  it("shows the address as one element, so it reads and copies as a whole", () => {
    const queue = new KeyAddressQueue();
    show(queue);
    ask(queue, gateway);
    const address = [...dialog().querySelectorAll("p")].find(
      (p) => p.textContent === "https://gateway.example.com",
    );
    expect(address?.children.length).toBe(0);
  });

  it('says "This key has no address yet." for a key with none', () => {
    const queue = new KeyAddressQueue();
    show(queue);
    ask(queue, { ...gateway, allowed: undefined });
    expect(dialog().textContent).toContain("This key has no address yet.");
  });

  it("starts on Don't allow, which comes first", () => {
    const queue = new KeyAddressQueue();
    show(queue);
    ask(queue, gateway);
    expect(document.activeElement).toBe(button("Don't allow"));
    const buttons = [...dialog().querySelectorAll("button")].map(labelOf);
    expect(buttons.indexOf("Don't allow")).toBeLessThan(buttons.indexOf("Allow this address"));
  });

  it("never draws Allow as the prominent button (C-2)", () => {
    const queue = new KeyAddressQueue();
    show(queue);
    ask(queue, gateway);
    expect(button("Allow this address").className.split(" ")).not.toContain("bg-primary");
  });

  it("sets the key's current addresses in mono, like the asked address (X-2)", () => {
    const queue = new KeyAddressQueue();
    show(queue);
    ask(queue, { ...gateway, allowed: ["https://api.example.com", "https://eu.example.com"] });
    const mono = [...dialog().querySelectorAll(".font-mono")].map((part) => part.textContent);
    expect(mono).toEqual([
      "https://gateway.example.com",
      "https://api.example.com",
      "https://eu.example.com",
    ]);
    expect(dialog().textContent).toContain(
      "This key is currently allowed for https://api.example.com, https://eu.example.com.",
    );
  });

  it("answers not-allowed on Escape, as on Don't allow, and saves nothing", async () => {
    for (const refuse of [
      () => dialog().dispatchEvent(new Event("cancel", { cancelable: true })),
      () => button("Don't allow").click(),
    ]) {
      const queue = new KeyAddressQueue();
      show(queue);
      const { saves, answer } = ask(queue, gateway);
      act(() => {
        refuse();
      });
      await settle();
      expect(answer()).toBe("not-allowed");
      expect(saves).toEqual([]);
      expect(dialog()).toBeNull();
    }
  });

  it("saves the engine's own address on Allow, then answers allowed and closes", async () => {
    const queue = new KeyAddressQueue();
    show(queue);
    const { saves, answer } = ask(queue, gateway);
    act(() => button("Allow this address").click());
    await settle();
    expect(saves).toEqual(["https://gateway.example.com"]);
    expect(answer()).toBe("allowed");
    expect(dialog()).toBeNull();
  });

  it("stays open with the failure line when the address can't be saved", async () => {
    const queue = new KeyAddressQueue();
    show(queue);
    const { answer } = ask(queue, gateway, false);
    act(() => button("Allow this address").click());
    await settle();
    // The kit fills the alert slot a frame after the save ends.
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });
    expect(answer()).toBeUndefined();
    expect(dialog().textContent).toContain(
      "Couldn't save this address. The key was not sent. Try again, or add the address on the Models page.",
    );
    act(() => button("Don't allow").click());
    await settle();
    expect(answer()).toBe("not-allowed");
  });

  it('adds "(1 of 2)" only while another question waits', async () => {
    const queue = new KeyAddressQueue();
    show(queue);
    ask(queue, gateway);
    ask(queue, { ...gateway, key: "other-key" });
    expect(dialog().textContent).toContain("Allow this address? (1 of 2)");
    act(() => button("Don't allow").click());
    await settle();
    expect(dialog().textContent).toContain('the key "other-key"');
    expect(dialog().textContent).not.toContain("(1 of");
  });
});
