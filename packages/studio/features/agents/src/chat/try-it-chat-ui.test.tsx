// @vitest-environment jsdom
import { EARLIER_LINE } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { buttonNamed, show, typeInto, unmount } from "../test-support.tsx";
import { Chat, said, scriptedHost, sendMessage } from "./try-it-test-support.tsx";

afterEach(() => {
  unmount();
  vi.clearAllMocks();
});

const buttons =
  'Shall I go on?\n```openui\nroot = Stack([Buttons([Button("Draft replies for all 4"), Button("Only those under €100")])])\n```';
const form = 'root = Stack([Form("Reply", [Field("Note", "text")], "Draft the reply")])';

/** A Try it chat whose first reply is `reply`, with `chatUi` on unless the test says. */
async function replied(reply: string, { chatUi = true } = {}) {
  let trusted = true;
  const script = scriptedHost({ trust: { mayStart: () => trusted } });
  const components = chatUi ? (["card", "form", "buttons"] as const) : undefined;
  const page = await show(<Chat host={script.host} announce={vi.fn()} chatUi={components} />);
  await sendMessage(page, "Sort this mail");
  await answer(script, 0, reply);
  const distrust = () => {
    trusted = false;
  };
  return { ...script, page, distrust };
}

async function answer(script: ReturnType<typeof scriptedHost>, index: number, reply: string) {
  await act(async () =>
    script.requests[index]?.listener?.onMessage?.({ role: "assistant", content: reply }),
  );
  await script.finish({ messages: [], end: { reason: "answered" } });
}

const lastSent = (requests: ReturnType<typeof scriptedHost>["requests"]) =>
  requests.at(-1)?.messages.at(-1);

const ticked = (button: Element | undefined) => button?.querySelector("svg") !== null;

verifies("agents.chat.chat-ui", () => {
  it("shows a reply's OpenUI as plain text when chatUi is off", async () => {
    const { page } = await replied(buttons, { chatUi: false });
    expect(page.textContent).toContain('Button("Only those under €100")');
    expect(buttonNamed(page, "Only those under €100")).toBeUndefined();
  });

  it("draws the reply's buttons and sends nothing until one is clicked", async () => {
    const { page, requests } = await replied(buttons);
    expect(said(page)).toContain("Shall I go on?");
    expect(page.textContent).not.toContain("```");
    expect(requests).toHaveLength(1);
    await act(async () => buttonNamed(page, "Only those under €100")?.click());
    expect(requests).toHaveLength(2);
    expect(lastSent(requests)).toEqual({ role: "user", content: "Only those under €100" });
    expect(said(page)).toContain("Only those under €100");
    const used = buttonNamed(page, "Only those under €100");
    expect(used?.getAttribute("aria-disabled")).toBe("true");
    expect(ticked(used)).toBe(true);
    expect(page.textContent).toContain("You sent “Only those under €100”.");
  });

  it("draws a reply's buttons as far as they got while it is written, not yet usable", async () => {
    const script = scriptedHost();
    const page = await show(<Chat host={script.host} announce={vi.fn()} chatUi={["buttons"]} />);
    await sendMessage(page, "Sort this mail");
    await act(async () =>
      script.requests[0]?.listener?.onText?.({
        kind: "delta",
        text: 'root = Stack([Buttons([Button("Not now"',
      }),
    );
    await act(async () => new Promise(requestAnimationFrame));
    expect(buttonNamed(page, "Not now")?.getAttribute("aria-disabled")).toBe("true");
    expect(page.textContent).not.toContain("couldn't be shown");
  });

  it("sends a form's answers as one message the person sees", async () => {
    const { page, requests } = await replied(form);
    await typeInto(page.querySelector("[data-chat-ui] input") as HTMLInputElement, "Sorry");
    await act(async () => buttonNamed(page, "Draft the reply")?.click());
    expect(lastSent(requests)).toEqual({ role: "user", content: "Draft the reply\nNote: Sorry" });
    expect(said(page)).toContain("Draft the reply\nNote: Sorry");
  });

  it("lets only the newest reply's controls work", async () => {
    const script = await replied(buttons);
    const { page, requests } = script;
    await sendMessage(page, "Something else");
    expect(buttonNamed(page, "Not now")).toBeUndefined();
    await answer(script, 1, 'root = Stack([Buttons([Button("Not now")])])');
    const older = buttonNamed(page, "Only those under €100");
    expect(older?.getAttribute("aria-disabled")).toBe("true");
    expect(ticked(older)).toBe(false);
    expect(page.textContent).toContain(EARLIER_LINE);
    await act(async () => older?.click());
    expect(requests).toHaveLength(2);
    await act(async () => buttonNamed(page, "Not now")?.click());
    expect(lastSent(requests)).toEqual({ role: "user", content: "Not now" });
  });

  it("holds a click as it holds Send: a key waits in the box, and nothing starts untrusted", async () => {
    const key = `sk-${"a1B2".repeat(6)}`;
    const { page, requests, distrust } = await replied(
      `root = Stack([Buttons([Button("${key}"), Button("Not now")])])`,
    );
    const box = () => (page.querySelector("textarea") as HTMLTextAreaElement).value;
    await act(async () => buttonNamed(page, key)?.click());
    expect(requests).toHaveLength(1);
    expect(box()).toBe(key);
    expect(page.textContent).toContain("This looks like an API key.");
    distrust();
    await act(async () => buttonNamed(page, "Not now")?.click());
    expect(requests).toHaveLength(1);
  });
});
