// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { OutgoingFeedback, SendAnswer } from "./hand-on.ts";
import { SendFeedback, type SendFeedbackProps } from "./send-feedback.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** The shell's answer to `plugin:feedback|crop`: a 20 × 10 crop, its size first. */
function cropBytes(): ArrayBuffer {
  const bytes = new Uint8Array(8 + 20 * 10 * 4);
  const header = new DataView(bytes.buffer);
  header.setUint32(0, 20, true);
  header.setUint32(4, 10, true);
  return bytes.buffer;
}

/** A shell whose crop is `crop()`: the 20 × 10 crop unless a test gives another answer. */
function fakeShell(crop: () => Promise<unknown> = async () => cropBytes()) {
  return {
    invoke: vi.fn(async (command: string): Promise<unknown> => {
      if (command === "plugin:feedback|crop") return crop();
      return null;
    }),
  };
}

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
const details = {
  project: "Acme apps",
  assignee: "Robin",
  studioVersion: "0.2.0",
  mac: false,
  now: () => new Date("2026-11-25T17:04:05Z"),
};
const taken: SendAnswer = { kind: "taken" };

const canvasPrototype = HTMLCanvasElement.prototype as unknown as Record<string, unknown>;
let root: Root | undefined;
let element: HTMLDivElement;
const closed = vi.fn();

beforeEach(() => {
  // jsdom has `<dialog>` but no `showModal()` or `close()`.
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
  canvasPrototype["getContext"] = () => ({
    createImageData: (width: number, height: number) => ({
      data: new Uint8ClampedArray(width * height * 4),
    }),
    putImageData: () => undefined,
  });
  element = document.createElement("div");
  document.body.append(element);
});

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  element.remove();
  delete canvasPrototype["getContext"];
  vi.useRealTimers();
  vi.restoreAllMocks();
  closed.mockReset();
});

/** Draws the dialog; `answers` are the sender's answers, one per Send, then `taken`. */
async function render(
  options: {
    readonly shell?: ReturnType<typeof fakeShell>;
    readonly answers?: (() => Promise<SendAnswer>)[];
  } & Partial<
    Pick<SendFeedbackProps, "connection" | "selectAgain" | "encodePng" | "pressed" | "initialText">
  > = {},
) {
  const { shell = fakeShell(), answers = [], ...rest } = options;
  const sent: OutgoingFeedback[] = [];
  const send = vi.fn(async (feedback: OutgoingFeedback) => {
    sent.push(feedback);
    return (answers.shift() ?? (async () => taken))();
  });
  await act(async () => {
    root = createRoot(element);
    root.render(
      <SendFeedback
        ipc={shell}
        send={send}
        details={details}
        onClose={closed}
        encodePng={async () => png}
        {...rest}
      />,
    );
  });
  return { shell, send, sent };
}

/** Draws the dialog and waits for its crop. */
async function open(options: Parameters<typeof render>[0] = {}) {
  const drawn = await render(options);
  await vi.waitFor(() => expect(element.textContent).toContain("20 × 10"));
  return drawn;
}

function textField(): HTMLTextAreaElement {
  const found = element.querySelector("textarea");
  if (found === null) throw new Error("No text field.");
  return found;
}

/** Types `text` as React hears it: the native setter, then an input event. */
function type(text: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  act(() => {
    setter?.call(textField(), text);
    textField().dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function findButton(label: string): HTMLButtonElement | undefined {
  return [...element.querySelectorAll("button")].find((each) => each.textContent === label);
}

function button(label: string): HTMLButtonElement {
  const found = findButton(label);
  if (found === undefined) throw new Error(`No ${label} button.`);
  return found;
}

/** Send, the dialog's submit button; its text also holds the hidden "Sending…". */
function sendButton(): HTMLButtonElement {
  const found = element.querySelector<HTMLButtonElement>('dialog button[type="submit"]');
  if (found === null) throw new Error("No Send button.");
  return found;
}

function dialog(): HTMLDialogElement {
  const found = element.querySelector("dialog");
  if (found === null) throw new Error("No dialog.");
  return found;
}

function ends(shell: ReturnType<typeof fakeShell>) {
  return shell.invoke.mock.calls.filter(([command]) => command === "plugin:feedback|end");
}

/** The Callout above the footnote that took the focus: its name's text and its own text. */
function focusedCallout() {
  const group = document.activeElement;
  if (group?.getAttribute("role") !== "group") throw new Error("No Callout has the focus.");
  const title = document.getElementById(group.getAttribute("aria-labelledby") ?? "");
  const text = document.getElementById(group.getAttribute("aria-describedby") ?? "");
  return { title: title?.textContent, text: text?.textContent ?? null };
}

verifies("feedback.send-window", () => {
  it("shows the crop's size, the field with its placeholder and the footnote, as a dialog", async () => {
    await open();
    expect(dialog().open).toBe(true);
    const title = document.getElementById(dialog().getAttribute("aria-labelledby") ?? "");
    expect(title?.textContent).toBe("Send feedback");
    expect(textField().placeholder).toBe("What did you notice? The first line becomes the title.");
    expect(document.activeElement).toBe(textField());
    expect(element.textContent).toContain(
      "Goes to Acme apps as a task in Paperclip for Robin, with the app, window, time and Studio version.",
    );
    expect(element.textContent).toContain("CtrlEntersend");
  });

  it("names the field with the placeholder's question and describes it with the footnote", async () => {
    await open();
    const label = element.querySelector(`label[for="${textField().id}"]`);
    expect(label?.textContent).toBe("What did you notice?");
    const described = textField().getAttribute("aria-describedby")?.split(" ") ?? [];
    const footnote = described.map((id) => document.getElementById(id)?.textContent);
    expect(footnote).toContain(
      "Goes to Acme apps as a task in Paperclip for Robin, with the app, window, time and Studio version.",
    );
  });

  it("sends once with text, with the crop as a PNG, then ends and closes", async () => {
    const { shell, send, sent } = await open();
    type("Run list jumps\nIt scrolls to the top");
    await act(async () => sendButton().click());
    await vi.waitFor(() => expect(ends(shell)).toHaveLength(1));
    expect(closed).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledOnce();
    expect(sent[0]?.png).toBe(png);
    expect(sent[0]?.task).toMatchObject({
      title: "Run list jumps",
      project: "Acme apps",
      assignee: "Robin",
      screenshot: { width: 20, height: 10, contentType: "image/png" },
    });
  });

  it("sends on Ctrl Enter in the text field", async () => {
    const { send } = await open();
    type("Run list jumps");
    await act(async () => {
      textField().dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true }),
      );
    });
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
  });

  it("says to write a line when the text is empty, and sends nothing", async () => {
    const { shell, send } = await open();
    type("   \n ");
    await act(async () => sendButton().click());
    expect(element.textContent).toContain("Write a line about what you saw.");
    expect(document.activeElement).toBe(textField());
    expect(send).not.toHaveBeenCalled();
    expect(ends(shell)).toEqual([]);
  });

  it("ends and closes on Cancel, the ✕ and Esc, sending nothing", async () => {
    const { shell, send } = await open();
    type("Run list jumps");
    act(() => button("Cancel").click());
    const close = dialog().querySelector<HTMLButtonElement>(
      'button[aria-label="Close Send feedback"]',
    );
    act(() => close?.click());
    // Esc fires `cancel` on a modal `<dialog>`.
    act(() => void dialog().dispatchEvent(new Event("cancel", { cancelable: true })));
    expect(ends(shell)).toHaveLength(3);
    expect(closed).toHaveBeenCalledTimes(3);
    expect(send).not.toHaveBeenCalled();
  });

  it("stays open with the text when the feedback can't be handed on", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { shell } = await open({
      answers: [
        async () => {
          throw new Error("no main window");
        },
      ],
    });
    type("Run list jumps");
    await act(async () => sendButton().click());
    await vi.waitFor(() => expect(errors).toHaveBeenCalled());
    expect(ends(shell)).toEqual([]);
    expect(closed).not.toHaveBeenCalled();
    expect(textField().value).toBe("Run list jumps");
  });
});

verifies("feedback.send-states", () => {
  it("marks the crop box busy and shows the skeleton only after 300 ms, keeping the size line", async () => {
    vi.useFakeTimers();
    await render({ shell: fakeShell(() => new Promise(() => undefined)) });
    const box = element.querySelector("[data-feedback-crop]");
    expect(box?.getAttribute("aria-busy")).toBe("true");
    expect(element.querySelector("[data-feedback-crop-skeleton]")).toBeNull();
    // The size line keeps a line's height with a zero-width space.
    expect(element.querySelector("[data-feedback-size]")?.textContent).toBe(
      String.fromCharCode(0x200b),
    );
    await act(async () => vi.advanceTimersByTime(300));
    const skeleton = element.querySelector("[data-feedback-crop-skeleton]");
    expect(skeleton?.getAttribute("aria-hidden")).toBe("true");
    expect(document.activeElement).toBe(textField());
  });

  it("says the crop couldn't be loaded, stays open and sends the text alone", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const selectAgain = vi.fn();
    const shell = fakeShell(async () => Promise.reject("gone"));
    const { send, sent } = await render({ shell, selectAgain });
    await vi.waitFor(() => expect(element.textContent).toContain("Couldn't load the screenshot."));
    expect(element.querySelector("[data-feedback-crop]")?.hasAttribute("aria-busy")).toBe(false);
    expect(ends(shell)).toEqual([]);
    act(() => button("Select again").click());
    expect(selectAgain).toHaveBeenCalledOnce();
    type("Run list jumps");
    await act(async () => sendButton().click());
    expect(send).not.toHaveBeenCalled();
    await act(async () => button("Send without a screenshot").click());
    await vi.waitFor(() => expect(ends(shell)).toHaveLength(1));
    expect(sent[0]?.png).toBeNull();
    expect(sent[0]?.task).toMatchObject({ title: "Run list jumps", screenshot: null });
  });

  it("offers no Select again where the window can't start a selection", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await render({ shell: fakeShell(async () => Promise.reject("gone")) });
    await vi.waitFor(() => expect(element.textContent).toContain("Couldn't load the screenshot."));
    expect(findButton("Select again")).toBeUndefined();
    expect(findButton("Send without a screenshot")).toBeDefined();
  });

  it("keeps the danger focus ring on a field with an error", async () => {
    await open();
    await act(async () => sendButton().click());
    expect(textField().getAttribute("aria-invalid")).toBe("true");
    const ring = (textField().parentElement?.className ?? "").split(" ");
    expect(ring).toContain("focus-field-danger");
    expect(ring).not.toContain("focus-field");
  });

  it("says before Send that Studio is offline", async () => {
    await open({ connection: "offline" });
    expect(element.textContent).toContain("Studio is offline");
    expect(element.textContent).toContain(
      "Send saves your feedback on this computer and sends it automatically once Studio is back online.",
    );
  });

  it("says before Send that Studio isn't connected to Paperclip", async () => {
    await open({ connection: "not-connected" });
    expect(element.textContent).toContain("Studio isn't connected to Paperclip");
    expect(element.textContent).toContain(
      "Send saves your feedback on this computer and sends it automatically once Studio is connected to Paperclip.",
    );
  });

  it("says nothing about the connection while Studio is online", async () => {
    await open({ connection: "online" });
    expect(element.textContent).not.toContain("Studio is offline");
    expect(element.textContent).not.toContain("Studio isn't connected to Paperclip");
  });

  it("makes the field read-only and hides Select again while sending, with the spinner after 300 ms", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { send } = await render({
      shell: fakeShell(async () => Promise.reject("gone")),
      selectAgain: vi.fn(),
      answers: [() => new Promise(() => undefined)],
    });
    await vi.waitFor(() => expect(findButton("Select again")).toBeDefined());
    type("Run list jumps");
    vi.useFakeTimers();
    await act(async () => button("Send without a screenshot").click());
    await act(async () => undefined);
    expect(send).toHaveBeenCalledOnce();
    expect(textField().readOnly).toBe(true);
    expect(findButton("Select again")).toBeUndefined();
    expect(sendButton().hasAttribute("aria-busy")).toBe(false);
    await act(async () => vi.advanceTimersByTime(300));
    expect(sendButton().getAttribute("aria-busy")).toBe("true");
  });

  it("says why Paperclip refused, keeps the text, focuses the Callout and tries again", async () => {
    const refused: SendAnswer = { kind: "refused", reason: "Project not found." };
    const { shell, send } = await open({ answers: [async () => refused] });
    type("Run list jumps");
    await act(async () => sendButton().click());
    await vi.waitFor(() => expect(focusedCallout().title).toBe("Couldn't send your feedback"));
    expect(focusedCallout().text).toBe(
      "Paperclip said: Project not found. Your text and screenshot are still here.",
    );
    expect(textField().value).toBe("Run list jumps");
    expect(textField().readOnly).toBe(false);
    expect(ends(shell)).toEqual([]);
    await act(async () => button("Try again").click());
    await vi.waitFor(() => expect(ends(shell)).toHaveLength(1));
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("shows the title alone when Paperclip gives no reason", async () => {
    const refused: SendAnswer = { kind: "refused", reason: "" };
    await open({ answers: [async () => refused] });
    type("Run list jumps");
    await act(async () => sendButton().click());
    await vi.waitFor(() => expect(focusedCallout().title).toBe("Couldn't send your feedback"));
    expect(focusedCallout().text).toBe("");
    expect(element.textContent).not.toContain("Paperclip said");
  });

  it("says the screenshot couldn't be prepared and sends the text alone", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { shell, send, sent } = await open({
      encodePng: async () => {
        throw new Error("no canvas");
      },
    });
    type("Run list jumps");
    await act(async () => sendButton().click());
    await vi.waitFor(() => expect(focusedCallout().title).toBe("Couldn't prepare the screenshot"));
    expect(focusedCallout().text).toBe("Your text is still here.");
    expect(send).not.toHaveBeenCalled();
    await act(async () => button("Send without a screenshot").click());
    await vi.waitFor(() => expect(ends(shell)).toHaveLength(1));
    expect(sent[0]?.png).toBeNull();
  });
});

verifies("feedback.select-again", () => {
  const pressed = { app: "Halonic", window: "Runs · Acme" };

  it("names the app and window under the crop, and puts them in the task", async () => {
    const { sent } = await open({ pressed });
    expect(element.querySelector("[data-feedback-size]")?.textContent).toBe(
      "Halonic · Runs · Acme · 20 × 10",
    );
    type("Run list jumps");
    await act(async () => sendButton().click());
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]?.task.description).toContain("- App: `Halonic`\n- Window: `Runs · Acme`\n");
  });

  it("hands the text to Select again at the right of that line, ending nothing", async () => {
    const selectAgain = vi.fn();
    const { shell } = await open({ pressed, selectAgain });
    type("Run list jumps");
    act(() => button("Select again").click());
    expect(selectAgain).toHaveBeenCalledWith("Run list jumps");
    expect(ends(shell)).toEqual([]);
  });

  it("opens with the text Select again kept", async () => {
    await open({ initialText: "Run list jumps" });
    expect(textField().value).toBe("Run list jumps");
  });

  it("tabs from the text to Select again, then Cancel, then Send", async () => {
    await open({ pressed, selectAgain: vi.fn() });
    const order: HTMLElement[] = [
      textField(),
      button("Select again"),
      button("Cancel"),
      sendButton(),
    ];
    const tabbable = [...dialog().querySelectorAll<HTMLElement>("textarea, button")].filter(
      (each) => order.includes(each),
    );
    expect(tabbable).toEqual(order);
  });
});
