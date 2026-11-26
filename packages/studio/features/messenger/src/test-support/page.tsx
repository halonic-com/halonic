/**
 * Drives the Messenger's page in a jsdom test: renders it on a fake, presses
 * its buttons and types in its box, each inside `act` with every settled
 * promise run, so the test looks only after the page's reads have landed.
 */

import type { AgentMessaging } from "@halonicjs/ports";
import { NarrowProvider, OpenExternalProvider } from "@halonicjs/studio-kit";
import type { AgentActivity } from "@halonicjs/studio-services";
import { act, StrictMode } from "react";
import { Messenger } from "../messenger.ts";
import { MessengerPage } from "../ui/messenger-page.tsx";
import { render } from "./render.tsx";

/** Lets every promise that is already settled run its callbacks, with no timer. */
export async function settle(): Promise<void> {
  await act(async () => {
    for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
  });
}

/**
 * Renders the Messenger and lets its first reads land; links it opens go to `opened`. `narrow`
 * renders it in a window narrower than 900px; `now` gives the Messenger its own clock; `activity`
 * gives it the agents' activity, for the activity panel. Strict mode, as Studio renders every page, so an
 * effect that can't run twice fails here too.
 */
export async function openMessenger(
  messaging: AgentMessaging,
  opened: string[] = [],
  narrow = false,
  now?: () => Date,
  activity?: AgentActivity,
): Promise<HTMLElement> {
  const page = render(
    <StrictMode>
      <NarrowProvider narrow={narrow}>
        <OpenExternalProvider openExternal={async (address) => void opened.push(await address)}>
          <MessengerPage messenger={new Messenger(messaging, now, activity)} />
        </OpenExternalProvider>
      </NarrowProvider>
    </StrictMode>,
  );
  await settle();
  return page;
}

/** What the open chat's status region last read out: a new message or an answered card. */
export function said(page: HTMLElement): string | null | undefined {
  return page.querySelector('main p.sr-only[role="status"]')?.textContent;
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

/** Opens the chat whose row holds `text`, and gives its message box. */
export async function openChat(page: HTMLElement, text: string): Promise<HTMLTextAreaElement> {
  await press(byText(page, "nav li button", text));
  const box = page.querySelector("textarea");
  if (box === null) throw new Error("no message box");
  return box;
}

/** Types `text` in the box and sends it with Enter. */
export async function typeAndSend(box: HTMLTextAreaElement, text: string): Promise<void> {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(box, text);
    box.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    box.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
  await settle();
}

/**
 * Presses a key where focus is, as a shortcut: `Ctrl+F` is `pressKey("f", { ctrlKey: true })`. It
 * goes up to the window, as a real key press does.
 */
export async function pressKey(key: string, options: KeyboardEventInit = {}): Promise<void> {
  const target = document.activeElement ?? document.body;
  await act(async () => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options }),
    );
  });
  await settle();
}

/** Types `text` in a field, as a person does, and lets what it started land. */
export async function typeIn(field: Element | null | undefined, text: string): Promise<void> {
  if (!(field instanceof HTMLInputElement)) throw new Error("no field to type in");
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(field, text);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await settle();
}

/** Opens the open chat's find bar with Ctrl+F and types `text` in it. */
export async function findInChat(page: HTMLElement, text: string): Promise<void> {
  if (page.querySelector("main [data-find-bar]") === null) await pressKey("f", { ctrlKey: true });
  await typeIn(page.querySelector("main [data-find-bar] input"), text);
}
