/**
 * Drives quick ask's box in a jsdom test: renders it on a fake Messenger, types, presses keys and
 * buttons, each inside `act` with every settled promise run, so the test looks only after the
 * box's reads have landed.
 */
import { ClipboardProvider, type WriteClipboard } from "@halonicjs/studio-kit";
import { act, StrictMode } from "react";
import type { AskWindow } from "../api.ts";
import { AskMemory, type AskStorage, memoryStorage } from "../ask-memory.ts";
import { AskSession } from "../ask-session.ts";
import { AskBox } from "../ui/ask-box.tsx";
import type { FakeMessenger } from "./fake-messenger.ts";
import { render } from "./render.tsx";

/** A window that counts what the box asked of it. */
export class FakeAskWindow implements AskWindow {
  hidden = 0;
  studioShown = 0;
  readonly chatsOpened: string[] = [];

  async hide(): Promise<void> {
    this.hidden += 1;
  }

  async openStudio(): Promise<void> {
    this.studioShown += 1;
  }

  async openChat(conversation: string): Promise<void> {
    this.chatsOpened.push(conversation);
  }
}

/** Lets every promise that is already settled run its callbacks, with no timer. */
export async function settle(): Promise<void> {
  await act(async () => {
    for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
  });
}

/** A clipboard that takes every text, or refuses each one, and keeps what it took. */
export class FakeClipboard {
  readonly copied: string[] = [];
  readonly #refuses: boolean;

  constructor(refuses = false) {
    this.#refuses = refuses;
  }

  readonly write: WriteClipboard = async (text) => {
    if (this.#refuses) return false;
    this.copied.push(text);
    return true;
  };
}

/** The box, open on `messenger`, after its first reads; strict mode, as Studio renders pages. */
export async function openBox(
  messenger: FakeMessenger,
  storage: AskStorage = memoryStorage(),
  clipboard = new FakeClipboard(),
) {
  const window = new FakeAskWindow();
  const closed: number[] = [];
  const session = new AskSession(messenger, new AskMemory(storage));
  const page = render(
    <StrictMode>
      <ClipboardProvider writeClipboard={clipboard.write}>
        <AskBox session={session} window={window} onClosed={() => closed.push(1)} />
      </ClipboardProvider>
    </StrictMode>,
  );
  await settle();
  return { page, window, closed };
}

/** The box's text box. */
export function textBox(page: HTMLElement): HTMLTextAreaElement {
  const box = page.querySelector("textarea");
  if (box === null) throw new Error("no text box");
  return box;
}

/** Types `text` into a text box or search box, as React hears it. */
export async function typeIn(field: HTMLTextAreaElement | HTMLInputElement, text: string) {
  await act(async () => {
    const prototype = Object.getPrototypeOf(field) as object;
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(field, text);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/** Presses `key` on `element`, with Shift when asked, and lets what it started land. */
export async function pressKey(element: Element | null, key: string, shiftKey = false) {
  if (element === null) throw new Error(`nothing to press ${key} on`);
  await act(async () => {
    element.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey, bubbles: true }));
  });
  await settle();
}

/** Clicks an element and lets what it started land. */
export async function press(element: Element | null | undefined): Promise<void> {
  if (!(element instanceof HTMLElement)) throw new Error("nothing to press");
  await act(async () => element.click());
  await settle();
}

/** The first element under `selector` whose text holds `text`. */
export function byText(page: HTMLElement, selector: string, text: string): Element | undefined {
  return [...page.querySelectorAll(selector)].find((each) => each.textContent?.includes(text));
}

/** Types a question and sends it with Enter. */
export async function ask(page: HTMLElement, question: string): Promise<void> {
  await typeIn(textBox(page), question);
  await pressKey(textBox(page), "Enter");
}
