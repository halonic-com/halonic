// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import { AskMemory, memoryStorage } from "../ask-memory.ts";
import { AskSession } from "../ask-session.ts";
import { ask, FakeAskWindow, settle, textBox, typeIn } from "../test-support/box-page.tsx";
import { agent, chat, FakeMessenger } from "../test-support/fake-messenger.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { AskBoxWhileShown } from "./ask-window.tsx";

afterEach(unmountAll);

async function openWindow(messenger: FakeMessenger) {
  const session = new AskSession(messenger, new AskMemory(memoryStorage()));
  const page = render(
    <AskBoxWhileShown session={session} window={new FakeAskWindow()} page={window} />,
  );
  await settle();
  return page;
}

async function fire(type: "blur" | "focus") {
  await act(async () => window.dispatchEvent(new Event(type)));
  await settle();
}

verifies("quick-ask.box", () => {
  it("goes when the window loses the focus, and stops watching for the answer", async () => {
    const messenger = new FakeMessenger([chat(agent("Chief"))]);
    const page = await openWindow(messenger);
    await ask(page, "Where are we?");
    expect(messenger.listeners.size).toBe(1);

    await fire("blur");
    expect(page.querySelector('[role="dialog"]')).toBeNull();
    expect(messenger.listeners.size).toBe(0);
  });

  it("opens empty when the window shows again, with the unsent text kept", async () => {
    const messenger = new FakeMessenger([chat(agent("Chief"))]);
    const page = await openWindow(messenger);
    await ask(page, "Where are we?");
    await typeIn(textBox(page), "And the docs?");

    await fire("blur");
    await fire("focus");
    expect(page.querySelector("[data-question]")).toBeNull();
    expect(textBox(page).value).toBe("And the docs?");
  });

  it("goes as soon as the box closes from Esc", async () => {
    const page = await openWindow(new FakeMessenger([chat(agent("Chief"))]));
    await act(async () =>
      textBox(page).dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
    );
    await settle();

    expect(page.querySelector('[role="dialog"]')).toBeNull();
  });
});
